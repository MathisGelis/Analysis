// src/features/saisons/saisons.controller.ts

import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query } from "@nestjs/common";

import { Acces } from "@/features/acces/acces.decorator";
import { AccesService } from "@/features/acces/acces.service";
import { ContexteAcces } from "@/features/acces/contexte-acces";

import { CreateSaisonDto, UpdateSaisonDto } from "./saisons.dto";
import { SaisonsService } from "./saisons.service";

@Controller("saisons")
export class SaisonsController {
  constructor(private svc: SaisonsService, private acces: AccesService) {}

  // Lecture : un educateur restreint ne voit que les saisons qui lui sont ouvertes.
  @Get() async findAll(@Acces() ctx: ContexteAcces) {
    return ctx.filtrerSaison(await this.svc.findAll(), (s) => s.id);
  }
  @Get("active") async active(@Acces() ctx: ContexteAcces) {
    const s = await this.svc.findActive();
    return s && ctx.voitSaison(s.id) ? s : null;
  }
  @Get(":id") async one(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    const s = await this.svc.findOne(id);
    if (!ctx.voitSaison(s.id)) throw new NotFoundException(`Saison ${id} introuvable`);
    return s;
  }

  // Creer, modifier, activer ou supprimer une saison change tout pour tout le monde : reserve a l'administrateur.
  @Post() create(@Acces() ctx: ContexteAcces, @Body() dto: CreateSaisonDto) {
    this.acces.exigerAdmin(ctx);
    return this.svc.create(dto);
  }
  @Patch(":id") update(@Acces() ctx: ContexteAcces, @Param("id") id: string, @Body() dto: UpdateSaisonDto) {
    this.acces.exigerAdmin(ctx);
    return this.svc.update(id, dto);
  }
  @Patch(":id/activer") activer(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    this.acces.exigerAdmin(ctx);
    return this.svc.activer(id);
  }
  /**
   * Trigger manuel du clone d'equipes depuis la saison anterieure.
   * Utile si la saison a ete creee avant que l'auto-clone existe,
   * ou pour rejouer le clone apres suppression d'equipes.
   *
   * Idempotent : ne re-cree pas ce qui existe deja. Un compte non admin ne clone que pour SON club
   * (sans `clubId`, c'est son club ; l'administrateur, lui, peut cloner pour tous).
   */
  @Post(":id/auto-clone")
  async autoClone(
    @Acces() ctx: ContexteAcces,
    @Param("id") id: string,
    @Query("clubId") clubId?: string,
  ) {
    const s = await this.svc.findOne(id);
    if (!ctx.voitSaison(s.id)) throw new NotFoundException(`Saison ${id} introuvable`);
    if (!ctx.admin) {
      if (clubId) this.acces.exigerClub(ctx, clubId);
      else if (!ctx.clubId) this.acces.exigerClub(ctx, null);
    }
    return this.svc.autoCloneEquipesFromPreviousSaison(s, ctx.admin ? clubId : (clubId ?? ctx.clubId ?? undefined));
  }
  @Delete(":id") remove(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    this.acces.exigerAdmin(ctx);
    return this.svc.remove(id);
  }
}
