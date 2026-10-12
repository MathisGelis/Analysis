// src/features/tactiques/tactiques.module.ts

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Composition } from "@/features/matchs/composition.entity";
import { Equipe } from "@/features/equipes/equipe.entity";
import { EvenementMatch } from "@/features/matchs/evenement-match.entity";
import { Joueur } from "@/features/joueurs/joueur.entity";
import { Match } from "@/features/matchs/match.entity";
import { AccesModule } from "@/features/acces/acces.module";

import { Tactique } from "./tactique.entity";
import { TactiquesService } from "./tactiques.service";
import { TactiquesController } from "./tactiques.controller";

@Module({
  imports: [AccesModule, TypeOrmModule.forFeature([Tactique, Equipe, Joueur, Match, Composition, EvenementMatch])],
  controllers: [TactiquesController],
  providers: [TactiquesService],
  exports: [TactiquesService],
})
export class TactiquesModule {}
