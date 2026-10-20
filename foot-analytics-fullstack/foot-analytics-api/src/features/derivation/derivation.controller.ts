// src/features/derivation/derivation.controller.ts

import { Controller, Get, HttpCode, NotFoundException, Param, Post, Query, UseGuards } from "@nestjs/common";

import { AdminGuard } from "@/features/auth/auth.guards";

import { DerivationService } from "./derivation.service";
import { ReconstructionTacheService } from "./reconstruction-tache.service";

@Controller("derivation")
export class DerivationController {
  constructor(private svc: DerivationService, private taches: ReconstructionTacheService) {}

  // Reconstruit effectifs (tous clubs) + classement depuis les matchs, en attendant la fin (scripts, tests). L'ecran
  // passe par la tache de fond ci-dessous : derriere le relais Vercel, une requete de plus de 2 minutes est coupee (502).
  @Post("rebuild")
  rebuild() {
    return this.svc.rebuildAll();
  }

  // Lance la reconstruction en tache de fond (ou rejoint celle en cours) : 202 et l'etat de la tache, a suivre ci-dessous.
  @Post("rebuild/tache")
  @HttpCode(202)
  lancerReconstruction() {
    return this.taches.lancer();
  }

  @Get("rebuild/tache/:id")
  etatReconstruction(@Param("id") id: string) {
    const etat = this.taches.etat(id);
    if (!etat) throw new NotFoundException("Reconstruction inconnue (l'API a peut-etre redemarre) : relance-la.");
    return etat;
  }

  @Post("joueurs")
  joueurs() {
    return this.svc.recomputeJoueurs();
  }

  @Post("classement")
  classement() {
    return this.svc.rebuildClassement();
  }

  // Maintenance (admin) : simulation par defaut, ?appliquer=true pour reclasser les cartons verts.
  @Post("maintenance/cartons-verts") @UseGuards(AdminGuard)
  cartonsVerts(@Query("appliquer") appliquer?: string) {
    return this.svc.reclasserCartonsVerts(appliquer === "true");
  }

  // Maintenance (admin) : efface les dispositifs "4-4-2 / 4-2-3-1" inventes par l'ancien import. Simulation par defaut.
  @Post("maintenance/formations-inventees") @UseGuards(AdminGuard)
  formationsInventees(@Query("appliquer") appliquer?: string) {
    return this.svc.effacerFormationsInventees(appliquer === "true");
  }
}
