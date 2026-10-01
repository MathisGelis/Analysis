// src/features/derivation/derivation.controller.ts

import { Controller, Post, Query, UseGuards } from "@nestjs/common";

import { AdminGuard } from "@/features/auth/auth.guards";

import { DerivationService } from "./derivation.service";

@Controller("derivation")
export class DerivationController {
  constructor(private svc: DerivationService) {}

  // Reconstruit effectifs (tous clubs) + classement depuis les matchs.
  @Post("rebuild")
  rebuild() {
    return this.svc.rebuildAll();
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
