// src/features/planning-equipe/planning-equipe.controller.ts
//
// Le planning est prive a l'equipe : seul un compte qui gere cette equipe (de son club, saison ouverte) le lit ou le modifie.

import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Put } from "@nestjs/common";

import { Acces } from "@/features/acces/acces.decorator";
import { AccesService } from "@/features/acces/acces.service";
import { ContexteAcces } from "@/features/acces/contexte-acces";

import { EvenementEquipeDto, ID_EVENEMENT, PlanningDto } from "./planning-equipe.dto";
import { PlanningEquipeService } from "./planning-equipe.service";

const idValide = (id: string) => { if (!ID_EVENEMENT.test(id)) throw new BadRequestException("Identifiant d'evenement invalide."); return id; };

@Controller("planning-equipe/:equipeId")
export class PlanningEquipeController {
  constructor(private svc: PlanningEquipeService, private acces: AccesService) {}

  @Get() async lire(@Acces() ctx: ContexteAcces, @Param("equipeId") equipeId: string) {
    await this.acces.equipeGeree(ctx, equipeId);
    return this.svc.lire(equipeId);
  }

  @Put("planning") async planning(@Acces() ctx: ContexteAcces, @Param("equipeId") equipeId: string, @Body() dto: PlanningDto) {
    await this.acces.equipeGeree(ctx, equipeId);
    return this.svc.enregistrerPlanning(equipeId, dto);
  }

  @Put("autres/:id") async evenement(@Acces() ctx: ContexteAcces, @Param("equipeId") equipeId: string, @Param("id") id: string, @Body() dto: EvenementEquipeDto) {
    await this.acces.equipeGeree(ctx, equipeId);
    return this.svc.enregistrerEvenement(equipeId, idValide(id), dto);
  }

  @Delete("autres/:id") @HttpCode(204) async supprimer(@Acces() ctx: ContexteAcces, @Param("equipeId") equipeId: string, @Param("id") id: string) {
    await this.acces.equipeGeree(ctx, equipeId);
    await this.svc.supprimerEvenement(equipeId, idValide(id));
  }
}
