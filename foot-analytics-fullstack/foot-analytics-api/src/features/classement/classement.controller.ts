// src/features/classement/classement.controller.ts

import { Controller, ForbiddenException, Get, Param } from "@nestjs/common";

import { Acces } from "@/features/acces/acces.decorator";
import { ContexteAcces } from "@/features/acces/contexte-acces";

import { ClassementService } from "./classement.service";

@Controller("classement")
export class ClassementController {
  constructor(private svc: ClassementService) {}
  // Les classements des saisons fermees au compte ne sont pas renvoyes.
  @Get() async list(@Acces() ctx: ContexteAcces) { return ctx.filtrerSaison(await this.svc.findAll(), (l) => l.saisonId); }

  /** Classement final predit du championnat d'une equipe (saison fermee au compte : refuse comme les classements). */
  @Get("predit/:equipeId") async predit(@Acces() ctx: ContexteAcces, @Param("equipeId") equipeId: string) {
    const r = await this.svc.predit(equipeId);
    if (r && ctx.filtrerSaison([r], (x) => x.saisonId).length === 0) throw new ForbiddenException("Saison non accessible");
    return r;
  }
}
