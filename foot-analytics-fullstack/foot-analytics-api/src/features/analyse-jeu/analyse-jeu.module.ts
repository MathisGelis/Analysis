// src/features/analyse-jeu/analyse-jeu.module.ts

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AccesModule } from "@/features/acces/acces.module";
import { AnalyseModule } from "@/features/analyse/analyse.module";
import { EvenementDirect } from "@/features/direct/evenement-direct.entity";
import { Entrainement } from "@/features/entrainements/entrainement.entity";
import { Joueur } from "@/features/joueurs/joueur.entity";
import { Composition } from "@/features/matchs/composition.entity";
import { Match } from "@/features/matchs/match.entity";
import { EvenementMatch } from "@/features/matchs/evenement-match.entity";

import { AnalyseJeuController } from "./analyse-jeu.controller";
import { AnalyseJeuService } from "./analyse-jeu.service";

@Module({
  imports: [AccesModule, AnalyseModule, TypeOrmModule.forFeature([EvenementDirect, EvenementMatch, Match, Composition, Entrainement, Joueur])],
  controllers: [AnalyseJeuController],
  providers: [AnalyseJeuService],
  exports: [AnalyseJeuService],
})
export class AnalyseJeuModule {}
