// src/features/blessures/blessures.controller.ts

import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query } from "@nestjs/common";

import { Acces } from "@/features/acces/acces.decorator";
import { AccesService } from "@/features/acces/acces.service";
import { ContexteAcces } from "@/features/acces/contexte-acces";

import { UpsertBlessureDto } from "./blessures.dto";
import { BlessuresService } from "./blessures.service";

@Controller("blessures")
export class BlessuresController {
  constructor(private svc: BlessuresService, private acces: AccesService) {}

  /** La blessure d'un joueur de mon club, d'une saison ouverte (404 sinon). */
  private async exigerBlessure(ctx: ContexteAcces, id: string) {
    const b = await this.svc.findOne(id);
    await this.acces.joueurDuClub(ctx, b.joueurId);
    if (!ctx.voitDate(b.dateDebut)) throw new NotFoundException(`Blessure ${id} introuvable`);
    return b;
  }

  // Donnee de sante : jamais celles d'un autre club, ni celles d'une saison fermee au compte.
  @Get() async list(@Acces() ctx: ContexteAcces, @Query("joueurId") joueurId?: string) {
    const mes = await this.acces.idsJoueursDuClub(ctx);
    const toutes = await this.svc.findAll(joueurId);
    return toutes.filter((b) => (!mes || mes.has(b.joueurId)) && ctx.voitDate(b.dateDebut));
  }
  @Get(":id") get(@Acces() ctx: ContexteAcces, @Param("id") id: string) { return this.exigerBlessure(ctx, id); }
  @Post() async create(@Acces() ctx: ContexteAcces, @Body() dto: UpsertBlessureDto) {
    await this.acces.joueurDuClub(ctx, dto.joueurId);
    if (!ctx.voitDate(dto.dateDebut)) throw new NotFoundException("Saison introuvable");
    return this.svc.create(dto);
  }
  @Patch(":id") async update(@Acces() ctx: ContexteAcces, @Param("id") id: string, @Body() dto: UpsertBlessureDto) {
    await this.exigerBlessure(ctx, id);
    if (dto.joueurId) await this.acces.joueurDuClub(ctx, dto.joueurId);          // pas de transfert vers le joueur d'un autre club
    if (dto.dateDebut !== undefined && !ctx.voitDate(dto.dateDebut)) throw new NotFoundException("Saison introuvable");
    return this.svc.update(id, dto);
  }
  @Delete(":id") async remove(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    await this.exigerBlessure(ctx, id);
    return this.svc.remove(id);
  }
}
