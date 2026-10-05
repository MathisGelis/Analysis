// src/features/matchs/matchs.controller.ts

import {
  Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query,
} from "@nestjs/common";

import { Acces } from "@/features/acces/acces.decorator";
import { AccesService } from "@/features/acces/acces.service";
import { ContexteAcces } from "@/features/acces/contexte-acces";

import { DispositifsMatchDto, UpsertMatchDto, UpdateMatchDto } from "./matchs.dto";
import { MatchsService } from "./matchs.service";
import { refusSaisieDispositifs } from "./systeme";

@Controller("matchs")
export class MatchsController {
  constructor(private svc: MatchsService, private acces: AccesService) {}

  /**
   * Programmer ou modifier un match : l'un des deux clubs doit etre le mien et, de mon cote, l'equipe qui m'est attribuee
   * (l'administrateur est libre). La saison du match doit m'etre ouverte.
   */
  private async exigerMatchDeMonClub(
    ctx: ContexteAcces,
    m: { clubDom?: string; clubExt?: string; equipeDomId?: string | null; equipeExtId?: string | null; saisonId?: string | null; date?: string | null },
  ) {
    // Ni par sa saison, ni par sa date (la saison se deduit de la date a la reconstruction) : rien dans une saison fermee.
    if (!ctx.voitSaison(m.saisonId) || !ctx.voitDate(m.date)) throw new NotFoundException("Saison introuvable");
    if (ctx.admin) return;
    if (!ctx.gereClub(m.clubDom) && !ctx.gereClub(m.clubExt)) throw new ForbiddenException("Ce match ne concerne pas ton club.");
    await this.acces.exigerEquipesDuMatch(ctx, m as any);
  }

  // Les matchs des saisons fermees au compte ne sont pas renvoyes ; `modifiable` dit si le compte peut modifier ou
  // supprimer chacun (le front ne propose pas ce que l'API refuserait).
  @Get() async list(@Acces() ctx: ContexteAcces, @Query("clubId") clubId?: string) {
    const matchs = ctx.filtrerSaison(await this.svc.findAll(clubId), (m) => m.saisonId);
    const modifiables = await this.acces.matchsModifiables(ctx, matchs);
    return matchs.map((m) => Object.assign(m, { modifiable: modifiables.has(m.id) }));
  }
  /**
   * Le match, avec ce que MON compte peut en faire (`droits`) : le front ne propose ni modification ni suppression que
   * l'API refuserait, et sait si un dispositif deja saisi est modifiable ou seulement a renseigner.
   */
  @Get(":id") async get(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    const m = await this.acces.match(ctx, id);
    const modifier = await this.acces.peutModifierMatch(ctx, m);
    const trouve = await this.svc.findOne(id);
    return Object.assign(trouve, { droits: { modifier, dispositifs: modifier ? "libre" : "renseigner" } });
  }
  @Post() async create(@Acces() ctx: ContexteAcces, @Body() dto: UpsertMatchDto) {
    await this.exigerMatchDeMonClub(ctx, dto);
    return this.svc.create(dto);
  }
  @Patch(":id") async update(@Acces() ctx: ContexteAcces, @Param("id") id: string, @Body() dto: UpdateMatchDto) {
    const actuel = await this.acces.matchGere(ctx, id);
    // Le match modifie doit lui aussi rester un match de mon club (pas de transfert a un autre club ou une autre equipe).
    await this.exigerMatchDeMonClub(ctx, { ...actuel, ...dto });
    return this.svc.update(id, dto);
  }
  /**
   * Saisir le systeme de jeu d'un match. Plus large que la modification : un dispositif vide peut etre renseigne sur le
   * match d'un autre club (releves sur les adversaires, base de la prediction de leur systeme) ; un dispositif deja saisi
   * ne se corrige que sur un match que l'on gere.
   */
  @Patch(":id/dispositifs") async dispositifs(@Acces() ctx: ContexteAcces, @Param("id") id: string, @Body() dto: DispositifsMatchDto) {
    const m = await this.acces.match(ctx, id);
    if (!ctx.voitDate(m.date)) throw new NotFoundException(`Match ${id} introuvable`);
    const refus = refusSaisieDispositifs(m, dto, await this.acces.peutModifierMatch(ctx, m));
    if (refus) throw new ForbiddenException(refus);
    const saisie: DispositifsMatchDto = {};
    if (dto.formationDom !== undefined) saisie.formationDom = dto.formationDom;
    if (dto.formationExt !== undefined) saisie.formationExt = dto.formationExt;
    return this.svc.update(id, saisie);
  }
  @Delete(":id") async remove(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    await this.acces.matchGere(ctx, id);
    return this.svc.remove(id);
  }
}
