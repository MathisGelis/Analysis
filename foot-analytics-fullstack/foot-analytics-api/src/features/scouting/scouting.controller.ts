// src/features/scouting/scouting.controller.ts

import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query } from "@nestjs/common";

import { Acces } from "@/features/acces/acces.decorator";
import { ContexteAcces } from "@/features/acces/contexte-acces";

import { RapportScouting } from "./rapport-scouting.entity";
import { UpsertRapportDto } from "./scouting.dto";
import { ScoutingService } from "./scouting.service";

@Controller("scouting")
export class ScoutingController {
  constructor(private svc: ScoutingService) {}

  /** Un rapport est date : ceux d'une saison fermee au compte ne sont pas renvoyes. */
  private visible = (ctx: ContexteAcces) => (r: RapportScouting) => ctx.voitDate(r.date);

  @Get() list(@Acces() ctx: ContexteAcces, @Query("clubId") clubId?: string, @Query("saisonId") saisonId?: string) {
    if (saisonId && !ctx.voitSaison(saisonId)) return [];
    return this.svc.findAll(clubId, saisonId || undefined, this.visible(ctx));
  }
  /** Fiche club : renvoie null si aucun rapport (200 pas 404). */
  @Get("club/:clubId") byClub(@Acces() ctx: ContexteAcces, @Param("clubId") clubId: string, @Query("saisonId") saisonId?: string) {
    if (saisonId && !ctx.voitSaison(saisonId)) return null;
    return this.svc.findLatestByClub(clubId, saisonId || undefined, this.visible(ctx));
  }
  @Get(":id") async get(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    const r = await this.svc.findOne(id);
    if (!ctx.voitDate(r.date)) throw new NotFoundException(`Rapport ${id} introuvable`);
    return r;
  }
  @Post() create(@Acces() ctx: ContexteAcces, @Body() dto: UpsertRapportDto) {
    if (!ctx.voitDate(dto.date)) throw new NotFoundException("Saison introuvable");
    return this.svc.create(dto);
  }
  @Patch(":id") async update(@Acces() ctx: ContexteAcces, @Param("id") id: string, @Body() dto: UpsertRapportDto) {
    if (!ctx.voitDate((await this.svc.findOne(id)).date) || !ctx.voitDate(dto.date)) throw new NotFoundException(`Rapport ${id} introuvable`);
    return this.svc.update(id, dto);
  }
  @Delete(":id") async remove(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    if (!ctx.voitDate((await this.svc.findOne(id)).date)) throw new NotFoundException(`Rapport ${id} introuvable`);
    return this.svc.remove(id);
  }
}
