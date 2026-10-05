// src/features/ia/ia.controller.ts
//
// Routes de l'IA : reservees a l'administrateur (entrainer, consulter, activer un modele).

import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";

import { AdministrateurGuard } from "@/features/acces/administrateur.guard";

import { LancerEntrainementDto } from "./ia.dto";
import { IaService } from "./ia.service";

@UseGuards(AdministrateurGuard)
@Controller("ia")
export class IaController {
  constructor(private readonly svc: IaService) {}

  /** Modele actif, entrainement en cours, dernier entrainement, donnees disponibles. */
  @Get("etat") etat() { return this.svc.etat(); }

  /** Lance un entrainement en arriere-plan (409 s'il y en a deja un) ; suivre sa progression avec `resume`. */
  @Post("entrainements") lancer(@Req() req: { user: { sub: string } }, @Body() dto: LancerEntrainementDto) {
    return this.svc.lancer(req.user.sub, dto);
  }
  @Get("entrainements") liste() { return this.svc.liste(); }
  @Get("entrainements/:id") detail(@Param("id") id: string) { return this.svc.detail(id); }
  /** Progression et statut, sans le resultat detaille : fait pour etre interroge regulierement. */
  @Get("entrainements/:id/resume") resume(@Param("id") id: string) { return this.svc.resume(id); }
  @Post("entrainements/:id/annuler") @HttpCode(200) annuler(@Param("id") id: string) { return this.svc.annuler(id); }

  @Get("modeles") modeles() { return this.svc.listeModeles(); }
  /** Retire le modele actif : l'application reprend son moteur a regles. */
  @Post("modeles/desactiver") @HttpCode(204) async desactiver() { await this.svc.desactiver(); }
  @Post("modeles/:id/activer") @HttpCode(204) async activer(@Param("id") id: string) { await this.svc.activer(id); }
  @Delete("modeles/:id") @HttpCode(204) async supprimer(@Param("id") id: string) { await this.svc.supprimerModele(id); }
}
