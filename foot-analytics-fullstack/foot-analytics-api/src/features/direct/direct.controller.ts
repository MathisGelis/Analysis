// src/features/direct/direct.controller.ts

import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from "@nestjs/common";

import { Acces } from "@/features/acces/acces.decorator";
import { ContexteAcces } from "@/features/acces/contexte-acces";

import { ActionChronoDto, EvenementDirectDto, ID_CLIENT } from "./direct.dto";
import { DirectService } from "./direct.service";

const idValide = (id: string) => { if (!ID_CLIENT.test(id)) throw new BadRequestException("Identifiant d'evenement invalide."); return id; };

@Controller("direct/matchs/:matchId")
export class DirectController {
  constructor(private svc: DirectService) {}

  /** L'ecran du direct en une lecture : match, chrono (avec l'heure du serveur), evenements, score, effectif. */
  @Get() etat(@Acces() ctx: ContexteAcces, @Param("matchId") matchId: string) { return this.svc.etat(ctx, matchId); }

  @Post("chrono") @HttpCode(200)
  chrono(@Acces() ctx: ContexteAcces, @Param("matchId") matchId: string, @Body() dto: ActionChronoDto) { return this.svc.chrono(ctx, matchId, dto); }

  /** Idempotent : l'identifiant est celui que l'appareil a fabrique ; rejouer la requete ne cree jamais de doublon. */
  @Put("evenements/:id")
  enregistrer(@Acces() ctx: ContexteAcces, @Param("matchId") matchId: string, @Param("id") id: string, @Body() dto: EvenementDirectDto) {
    return this.svc.enregistrer(ctx, matchId, idValide(id), dto);
  }

  @Delete("evenements/:id") @HttpCode(204)
  async supprimer(@Acces() ctx: ContexteAcces, @Param("matchId") matchId: string, @Param("id") id: string) {
    await this.svc.supprimer(ctx, matchId, idValide(id));
  }

  @Post("cloture") @HttpCode(200)
  cloturer(@Acces() ctx: ContexteAcces, @Param("matchId") matchId: string) { return this.svc.cloturer(ctx, matchId); }

  @Post("reouverture") @HttpCode(200)
  rouvrir(@Acces() ctx: ContexteAcces, @Param("matchId") matchId: string) { return this.svc.rouvrir(ctx, matchId); }
}
