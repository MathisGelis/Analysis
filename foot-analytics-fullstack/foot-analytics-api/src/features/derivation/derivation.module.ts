// src/features/derivation/derivation.module.ts

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Arbitre } from "@/features/arbitres/arbitre.entity";
import { ArbitreMatch } from "@/features/arbitres/arbitre-match.entity";
import { Blessure } from "@/features/blessures/blessure.entity";
import { Club } from "@/features/clubs/club.entity";
import { Coach } from "@/features/coachs/coach.entity";
import { Composition } from "@/features/matchs/composition.entity";
import { Entrainement } from "@/features/entrainements/entrainement.entity";
import { Equipe } from "@/features/equipes/equipe.entity";
import { EvenementMatch } from "@/features/matchs/evenement-match.entity";
import { Joueur } from "@/features/joueurs/joueur.entity";
import { LigneClassement } from "@/features/classement/ligne-classement.entity";
import { Match } from "@/features/matchs/match.entity";
import { Saison } from "@/features/saisons/saison.entity";
import { StaffMatch } from "@/features/coachs/staff-match.entity";
import { Tactique } from "@/features/tactiques/tactique.entity";
import { AuthModule } from "@/features/auth/auth.module";

import { DerivationService } from "./derivation.service";
import { DerivationController } from "./derivation.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Joueur, Match, Composition, EvenementMatch, LigneClassement, Club,
      Entrainement, Blessure, Arbitre, ArbitreMatch, Coach, StaffMatch,
      Equipe, Saison, Tactique,
    ]),
    AuthModule,
  ],
  controllers: [DerivationController],
  providers: [DerivationService],
  exports: [DerivationService],
})
export class DerivationModule {}
