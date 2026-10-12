// src/features/arbitres/arbitres.controller.ts

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { AdminGuard } from "@/features/auth/auth.guards";
import { Acces } from "@/features/acces/acces.decorator";
import { AccesService } from "@/features/acces/acces.service";
import { ContexteAcces } from "@/features/acces/contexte-acces";

import { CreateArbitreDto, UpdateArbitreDto, CreateArbitreMatchDto, UpdateArbitreMatchDto } from "./arbitres.dto";
import { ArbitresService } from "./arbitres.service";

/**
 * Un arbitre sans ce qui concerne les saisons fermees au compte : le detail par saison (`participations`, JSON ou liste) et
 * les matchs arbitres. Les totaux de carriere, denormalises, ne se decoupent pas par saison et restent.
 */
function sansSaisonsFermees<T extends { participations?: unknown; liensMatchs?: { match?: { saisonId?: string | null } }[] }>(
  a: T, ctx: ContexteAcces,
): T {
  if (!ctx.saisonsRestreintes) return a;
  const brut = a.participations;
  let liste: { saisonId?: string | null }[] = [];
  try { liste = typeof brut === "string" ? JSON.parse(brut) : Array.isArray(brut) ? brut : []; } catch { liste = []; }
  const gardees = liste.filter((p) => ctx.voitSaison(p.saisonId));
  const participations = typeof brut === "string" ? (gardees.length ? JSON.stringify(gardees) : null) : gardees;
  const copie: T = { ...a, participations };
  if (a.liensMatchs) copie.liensMatchs = a.liensMatchs.filter((l) => ctx.voitSaison(l.match?.saisonId));
  return copie;
}

@Controller("arbitres")
export class ArbitresController {
  constructor(private svc: ArbitresService, private acces: AccesService) {}

  // Les arbitres sont une donnee de championnat : lisibles par tous, hors saisons fermees au compte.
  @Get() async find(@Acces() ctx: ContexteAcces, @Query("q") q?: string) {
    return (await this.svc.findAll(q)).map((a) => sansSaisonsFermees(a, ctx));
  }
  @Get(":id") async one(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    return sansSaisonsFermees(await this.svc.findOne(id), ctx);
  }
  // Un arbitre se cree depuis la fiche d'un match (tout compte) ; le renommer ou le supprimer touche tous les clubs : admin.
  @Post() create(@Body() dto: CreateArbitreDto) { return this.svc.create(dto); }
  @Patch(":id") update(@Acces() ctx: ContexteAcces, @Param("id") id: string, @Body() dto: UpdateArbitreDto) {
    this.acces.exigerAdmin(ctx);
    return this.svc.update(id, dto);
  }
  @Delete(":id") remove(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    this.acces.exigerAdmin(ctx);
    return this.svc.remove(id);
  }

  // Maintenance (admin) : simulation par defaut, ?appliquer=true pour supprimer.
  @Post("maintenance/delegues") @UseGuards(AdminGuard)
  nettoyerDelegues(@Query("appliquer") appliquer?: string) {
    return this.svc.nettoyerDelegues(appliquer === "true");
  }

  // Liens arbitre <-> match : lire un match consultable ; ecrire sur un match de mon club.
  @Get("match/:matchId") async byMatch(@Acces() ctx: ContexteAcces, @Param("matchId") matchId: string) {
    await this.acces.match(ctx, matchId);
    return this.svc.listForMatch(matchId);
  }
  @Post("link") async link(@Acces() ctx: ContexteAcces, @Body() dto: CreateArbitreMatchDto) {
    await this.acces.matchGere(ctx, dto.matchId);
    return this.svc.addToMatch(dto);
  }
  @Patch("link/:id") async updateLink(@Acces() ctx: ContexteAcces, @Param("id") id: string, @Body() dto: UpdateArbitreMatchDto) {
    await this.acces.matchGere(ctx, (await this.svc.lien(id)).matchId);
    return this.svc.updateJoin(id, dto);
  }
  @Delete("link/:id") async deleteLink(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    await this.acces.matchGere(ctx, (await this.svc.lien(id)).matchId);
    return this.svc.removeJoin(id);
  }
}
