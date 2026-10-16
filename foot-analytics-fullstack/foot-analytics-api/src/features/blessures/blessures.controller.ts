// src/features/blessures/blessures.controller.ts
//
// Donnees medicales : etanches par club. Une blessure appartient au club qui l'a saisie (clubId) : seuls les comptes
// de ce club la lisent ou la modifient (l'administrateur aussi), elle ne suit pas le joueur s'il change de club, et
// aucune autre route (stats, exports, recherche, fiches, IA) ne la restitue. Chaque lecture et ecriture est tracee dans
// le journal d'audit (sans le contenu medical).

import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query } from "@nestjs/common";

import { Acces } from "@/features/acces/acces.decorator";
import { AccesService } from "@/features/acces/acces.service";
import { ContexteAcces } from "@/features/acces/contexte-acces";
import { JournalAuditService } from "@/features/audit/journal-audit.service";

import { Blessure } from "./blessure.entity";
import { UpsertBlessureDto } from "./blessures.dto";
import { BlessuresService } from "./blessures.service";

@Controller("blessures")
export class BlessuresController {
  constructor(private svc: BlessuresService, private acces: AccesService, private journal: JournalAuditService) {}

  /** La blessure saisie par mon club, d'une saison ouverte (404 sinon : on ne revele pas qu'elle existe). */
  private async exigerBlessure(ctx: ContexteAcces, id: string): Promise<Blessure> {
    const b = await this.svc.findOne(id);
    if (!ctx.gereClub(b.clubId) || !ctx.voitDate(b.dateDebut)) throw new NotFoundException(`Blessure ${id} introuvable`);
    return b;
  }

  private tracer(ctx: ContexteAcces, action: "medical.lecture" | "medical.ecriture", b: Pick<Blessure, "id" | "joueurId" | "clubId"> | null, details?: Record<string, unknown>) {
    return this.journal.noter(action, {
      acteur: ctx.compte, cible: b ? `blessure:${b.id}` : null, cibleClubId: b?.clubId ?? ctx.clubId, details: { joueurId: b?.joueurId, ...details },
    });
  }

  @Get() async list(@Acces() ctx: ContexteAcces, @Query("joueurId") joueurId?: string) {
    const toutes = await this.svc.findAll(joueurId);
    const miennes = toutes.filter((b) => ctx.gereClub(b.clubId) && ctx.voitDate(b.dateDebut));
    await this.journal.noter("medical.lecture", {
      acteur: ctx.compte, cibleClubId: ctx.clubId, details: { nombre: miennes.length, joueurId: joueurId ?? null },
    });
    return miennes;
  }

  @Get(":id") async get(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    const b = await this.exigerBlessure(ctx, id);
    await this.tracer(ctx, "medical.lecture", b);
    return b;
  }

  @Post() async create(@Acces() ctx: ContexteAcces, @Body() dto: UpsertBlessureDto) {
    const joueur = await this.acces.joueurDuClub(ctx, dto.joueurId);
    if (!ctx.voitDate(dto.dateDebut)) throw new NotFoundException("Saison introuvable");
    // Le club qui saisit est le proprietaire de la donnee (l'administrateur saisit pour le club du joueur).
    const cree = await this.svc.create({ ...dto, clubId: ctx.admin ? joueur.clubId : ctx.clubId });
    await this.tracer(ctx, "medical.ecriture", cree, { operation: "creation" });
    return cree;
  }

  @Patch(":id") async update(@Acces() ctx: ContexteAcces, @Param("id") id: string, @Body() dto: UpsertBlessureDto) {
    await this.exigerBlessure(ctx, id);
    if (dto.joueurId) await this.acces.joueurDuClub(ctx, dto.joueurId);          // pas de transfert vers le joueur d'un autre club
    if (dto.dateDebut !== undefined && !ctx.voitDate(dto.dateDebut)) throw new NotFoundException("Saison introuvable");
    const maj = await this.svc.update(id, dto);
    await this.tracer(ctx, "medical.ecriture", maj, { operation: "modification" });
    return maj;
  }

  @Delete(":id") async remove(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    const b = await this.exigerBlessure(ctx, id);
    const r = await this.svc.remove(id);
    await this.tracer(ctx, "medical.ecriture", b, { operation: "suppression" });
    return r;
  }
}
