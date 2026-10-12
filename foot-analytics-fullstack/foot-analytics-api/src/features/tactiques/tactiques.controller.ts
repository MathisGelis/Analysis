// src/features/tactiques/tactiques.controller.ts

import { Body, Controller, Delete, Get, Put, Query } from "@nestjs/common";

import { Acces } from "@/features/acces/acces.decorator";
import { AccesService } from "@/features/acces/acces.service";
import { ContexteAcces } from "@/features/acces/contexte-acces";

import { EnregistrerTactiqueDto } from "./tactiques.dto";
import { TactiquesService } from "./tactiques.service";

@Controller("tactiques")
export class TactiquesController {
  constructor(private svc: TactiquesService, private acces: AccesService) {}

  /** Un plan de jeu est prive a l'equipe : seul le compte qui gere cette equipe y accede ; le match, s'il est cite, doit etre consultable. */
  private async exiger(ctx: ContexteAcces, equipeId: string, matchId?: string | null) {
    await this.acces.equipeGeree(ctx, equipeId);
    if (matchId) await this.acces.match(ctx, matchId);
  }

  // GET /tactiques?equipeId=...&matchId=... : le plan, ou null.
  @Get() async lire(@Acces() ctx: ContexteAcces, @Query("equipeId") equipeId: string, @Query("matchId") matchId?: string) {
    await this.exiger(ctx, equipeId, matchId);
    return (await this.svc.lire(equipeId, matchId)) ?? null;
  }
  // GET /tactiques/comparaison?equipeId=...[&matchId=...] : plan prepare contre feuille de match jouee.
  @Get("comparaison") async comparer(@Acces() ctx: ContexteAcces, @Query("equipeId") equipeId: string, @Query("matchId") matchId?: string) {
    await this.exiger(ctx, equipeId, matchId);
    return this.svc.comparer(equipeId, matchId);
  }
  @Put() async enregistrer(@Acces() ctx: ContexteAcces, @Body() dto: EnregistrerTactiqueDto) {
    await this.exiger(ctx, dto.equipeId, dto.matchId);
    return this.svc.enregistrer(dto);
  }
  @Delete() async supprimer(@Acces() ctx: ContexteAcces, @Query("equipeId") equipeId: string, @Query("matchId") matchId?: string) {
    await this.exiger(ctx, equipeId, matchId);
    return this.svc.supprimer(equipeId, matchId);
  }
}
