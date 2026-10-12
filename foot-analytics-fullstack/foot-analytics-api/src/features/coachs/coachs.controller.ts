// src/features/coachs/coachs.controller.ts

import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query } from "@nestjs/common";

import { Acces } from "@/features/acces/acces.decorator";
import { AccesService } from "@/features/acces/acces.service";
import { ContexteAcces } from "@/features/acces/contexte-acces";

import { CreateCoachDto, UpdateCoachDto, CreateStaffMatchDto } from "./coachs.dto";
import { CoachsService } from "./coachs.service";

@Controller("coachs")
export class CoachsController {
  constructor(private svc: CoachsService, private acces: AccesService) {}

  /** Un entraineur de mon club (404 s'il n'existe pas ; 403 sinon). Un entraineur sans club ne regarde que l'admin. */
  private async exigerCoachDuClub(ctx: ContexteAcces, id: string) {
    const c = await this.svc.findOne(id);
    this.acces.exigerClub(ctx, c.clubId, "Cet entraineur n'est pas de ton club.");
    return c;
  }

  // Les entraineurs sont une donnee de championnat : lisibles par tous, hors matchs des saisons fermees au compte.
  @Get() find(@Query("clubId") clubId?: string, @Query("q") q?: string) {
    return this.svc.findAll(clubId, q);
  }
  @Get("recherche") recherche(@Query("q") q?: string) { return this.svc.rechercher(q ?? ""); }
  @Get(":id") async one(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    const c = await this.svc.findOne(id);
    return ctx.saisonsRestreintes ? { ...c, participations: (c.participations ?? []).filter((p) => ctx.voitSaison(p.match?.saisonId)) } : c;
  }
  // GET /coachs/:id/fiche[?saisonId=...] : bilans, parcours et matchs du coach.
  @Get(":id/fiche") fiche(@Acces() ctx: ContexteAcces, @Param("id") id: string, @Query("saisonId") saisonId?: string) {
    if (saisonId && !ctx.voitSaison(saisonId)) throw new NotFoundException(`Saison ${saisonId} introuvable`);
    return this.svc.fiche(id, saisonId, (s) => ctx.voitSaison(s));
  }
  @Post() create(@Acces() ctx: ContexteAcces, @Body() dto: CreateCoachDto) {
    this.acces.exigerClub(ctx, dto.clubId);
    return this.svc.create(dto);
  }
  @Patch(":id") async update(@Acces() ctx: ContexteAcces, @Param("id") id: string, @Body() dto: UpdateCoachDto) {
    await this.exigerCoachDuClub(ctx, id);
    if (dto.clubId !== undefined) this.acces.exigerClub(ctx, dto.clubId);
    return this.svc.update(id, dto);
  }
  @Delete(":id") async remove(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    await this.exigerCoachDuClub(ctx, id);
    return this.svc.remove(id);
  }

  @Get("match/:matchId") async byMatch(@Acces() ctx: ContexteAcces, @Param("matchId") matchId: string) {
    await this.acces.match(ctx, matchId);
    return this.svc.listForMatch(matchId);
  }
  @Post("link") async link(@Acces() ctx: ContexteAcces, @Body() dto: CreateStaffMatchDto) {
    await this.acces.matchGere(ctx, dto.matchId);
    return this.svc.addToMatch(dto);
  }
  @Delete("link/:id") async deleteLink(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    await this.acces.matchGere(ctx, (await this.svc.lien(id)).matchId);
    return this.svc.removeJoin(id);
  }
}
