// src/features/apres-match/apres-match.controller.ts

import { Body, Controller, Get, Param, Put } from "@nestjs/common";

import { Acces } from "@/features/acces/acces.decorator";
import { ContexteAcces } from "@/features/acces/contexte-acces";

import { BilanDto, NoteJoueurDto } from "./apres-match.dto";
import { ApresMatchService } from "./apres-match.service";

@Controller("apres-match/matchs/:matchId")
export class ApresMatchController {
  constructor(private svc: ApresMatchService) {}

  @Get() etat(@Acces() ctx: ContexteAcces, @Param("matchId") matchId: string) { return this.svc.etat(ctx, matchId); }

  @Put("joueurs/:joueurId")
  noter(@Acces() ctx: ContexteAcces, @Param("matchId") matchId: string, @Param("joueurId") joueurId: string, @Body() dto: NoteJoueurDto) {
    return this.svc.noterJoueur(ctx, matchId, joueurId, dto);
  }

  @Get("adversaire") adversaire(@Acces() ctx: ContexteAcces, @Param("matchId") matchId: string) { return this.svc.observationsAdversaire(ctx, matchId); }

  @Put("adversaire/:section")
  observer(@Acces() ctx: ContexteAcces, @Param("matchId") matchId: string, @Param("section") section: string, @Body() corps: unknown) {
    return this.svc.enregistrerObservations(ctx, matchId, section, corps);
  }

  @Put("bilan")
  bilan(@Acces() ctx: ContexteAcces, @Param("matchId") matchId: string, @Body() dto: BilanDto) { return this.svc.enregistrerBilan(ctx, matchId, dto); }
}
