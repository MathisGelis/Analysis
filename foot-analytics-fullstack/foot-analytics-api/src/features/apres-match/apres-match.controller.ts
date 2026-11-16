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

  @Put("bilan")
  bilan(@Acces() ctx: ContexteAcces, @Param("matchId") matchId: string, @Body() dto: BilanDto) { return this.svc.enregistrerBilan(ctx, matchId, dto); }
}
