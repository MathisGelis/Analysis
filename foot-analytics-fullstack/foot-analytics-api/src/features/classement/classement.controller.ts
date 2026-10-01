// src/features/classement/classement.controller.ts

import { Controller, Get } from "@nestjs/common";

import { Acces } from "@/features/acces/acces.decorator";
import { ContexteAcces } from "@/features/acces/contexte-acces";

import { ClassementService } from "./classement.service";

@Controller("classement")
export class ClassementController {
  constructor(private svc: ClassementService) {}
  // Les classements des saisons fermees au compte ne sont pas renvoyes.
  @Get() async list(@Acces() ctx: ContexteAcces) { return ctx.filtrerSaison(await this.svc.findAll(), (l) => l.saisonId); }
}
