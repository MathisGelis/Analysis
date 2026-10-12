// src/features/equipes/equipes.controller.ts

import {
  Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query, UseGuards,
} from "@nestjs/common";

import { AdminGuard } from "@/features/auth/auth.guards";
import { Acces } from "@/features/acces/acces.decorator";
import { AccesService } from "@/features/acces/acces.service";
import { ContexteAcces } from "@/features/acces/contexte-acces";

import { UpsertEquipeDto } from "./equipes.dto";
import { EquipesService } from "./equipes.service";

@Controller("equipes")
export class EquipesController {
  constructor(private svc: EquipesService, private acces: AccesService) {}

  /** Creer, modifier ou supprimer une equipe : l'administrateur, ou le referent du club de l'equipe. */
  private exigerGestionnaire(ctx: ContexteAcces, clubId: string) {
    if (ctx.admin) return;
    if (!ctx.referent) throw new ForbiddenException("Seuls l'administrateur et le referent du club gerent les equipes.");
    this.acces.exigerClub(ctx, clubId);
  }

  // Un educateur ne voit pas les equipes de son club qui ne lui sont pas attribuees, ni celles des saisons fermees.
  @Get() async list(@Acces() ctx: ContexteAcces, @Query("clubId") clubId?: string, @Query("saisonId") saisonId?: string) {
    return (await this.svc.findAll({ clubId, saisonId })).filter((e) => ctx.voitEquipe(e));
  }
  @Get(":id") get(@Acces() ctx: ContexteAcces, @Param("id") id: string) { return this.acces.equipe(ctx, id); }
  @Post() create(@Acces() ctx: ContexteAcces, @Body() dto: UpsertEquipeDto) {
    this.exigerGestionnaire(ctx, dto.clubId);
    return this.svc.create(dto);
  }
  @Patch(":id") async update(@Acces() ctx: ContexteAcces, @Param("id") id: string, @Body() dto: UpsertEquipeDto) {
    this.exigerGestionnaire(ctx, (await this.svc.findOne(id)).clubId);
    if (dto.clubId) this.exigerGestionnaire(ctx, dto.clubId);             // pas de transfert vers un autre club
    return this.svc.update(id, dto);
  }
  @Delete(":id") async remove(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    this.exigerGestionnaire(ctx, (await this.svc.findOne(id)).clubId);
    return this.svc.remove(id);
  }

  // Maintenance (admin) : fusionne les clones provisoires de la saison
  // precedente devenus doublons de la vraie equipe (autre poule). Simulation par
  // defaut ; ?appliquer=true pour fusionner ; ?saisonId= pour limiter a une saison.
  @Post("maintenance/reconcilier") @UseGuards(AdminGuard)
  reconcilier(@Query("appliquer") appliquer?: string, @Query("saisonId") saisonId?: string) {
    return this.svc.reconcilier(appliquer === "true", saisonId);
  }

  // Clone toutes les equipes d'un club d'une saison vers une autre.
  // Usage : preparer la saison 2026-2027 en clonant les equipes engagees
  // en 2025-2026 (effectif vide a remplir manuellement). Admin, ou referent du club.
  @Post("clone-saison")
  cloneSaison(@Acces() ctx: ContexteAcces, @Body() body: { clubId: string; fromSaisonId: string; toSaisonId: string }) {
    this.exigerGestionnaire(ctx, body.clubId);
    if (!ctx.voitSaison(body.fromSaisonId) || !ctx.voitSaison(body.toSaisonId)) throw new NotFoundException("Saison introuvable");
    return this.svc.cloneSaison(body);
  }
}
