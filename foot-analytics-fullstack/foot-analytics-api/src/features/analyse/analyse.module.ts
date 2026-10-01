// src/features/analyse/analyse.module.ts

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Arbitre } from "@/features/arbitres/arbitre.entity";
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
import { AccesModule } from "@/features/acces/acces.module";

import { PrematchService } from "./prematch.service";
import { SituationService } from "./situation.service";
import { AnalyseService } from "./analyse.service";
import { AnalyseController } from "./analyse.controller";

@Module({
  imports: [
    AccesModule,
    TypeOrmModule.forFeature([
      Club, Match, Joueur, Composition, EvenementMatch, Entrainement,
      Coach, StaffMatch, Equipe, LigneClassement, Saison, Arbitre,
    ]),
  ],
  controllers: [AnalyseController],
  providers: [AnalyseService, PrematchService, SituationService],
  exports: [AnalyseService],
})
export class AnalyseModule {}
