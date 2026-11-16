// src/features/analyse-jeu/analyse-jeu.controller.ts

import { Controller, Get, Param } from "@nestjs/common";

import { Acces } from "@/features/acces/acces.decorator";
import { ContexteAcces } from "@/features/acces/contexte-acces";

import { AnalyseJeuService } from "./analyse-jeu.service";

@Controller("analyse-jeu")
export class AnalyseJeuController {
  constructor(private svc: AnalyseJeuService) {}

  @Get("matchs/:matchId/resume") resume(@Acces() ctx: ContexteAcces, @Param("matchId") matchId: string) { return this.svc.resume(ctx, matchId); }
}
