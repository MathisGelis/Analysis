// src/features/stats/stats.controller.ts

import { Controller, Get, Param, Query } from "@nestjs/common";

import { Acces } from "@/features/acces/acces.decorator";
import { AccesService } from "@/features/acces/acces.service";
import { ContexteAcces } from "@/features/acces/contexte-acces";

import { StatsService } from "./stats.service";

@Controller("stats")
export class StatsController {
  constructor(private svc: StatsService, private acces: AccesService) {}
  // Equipe consultable et saison ouverte ; sans precision, un compte aux saisons restreintes obtient la saison actuelle.
  @Get("bilan/:clubId") async bilan(
    @Acces() ctx: ContexteAcces,
    @Param("clubId") id: string,
    @Query("equipeId") equipeId?: string,
    @Query("saisonId") saisonId?: string,
  ) {
    return this.svc.bilanClub(id, await this.acces.portee(ctx, { equipeId, saisonId }));
  }
}
