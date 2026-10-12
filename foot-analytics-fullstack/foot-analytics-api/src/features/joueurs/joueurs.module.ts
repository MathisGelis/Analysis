// src/features/joueurs/joueurs.module.ts

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Composition } from "@/features/matchs/composition.entity";
import { Equipe } from "@/features/equipes/equipe.entity";
import { EvenementMatch } from "@/features/matchs/evenement-match.entity";
import { Match } from "@/features/matchs/match.entity";
import { Saison } from "@/features/saisons/saison.entity";
import { AccesModule } from "@/features/acces/acces.module";

import { Joueur } from "./joueur.entity";
import { StatJoueurEquipe } from "./stat-joueur-equipe.entity";
import { JoueursService } from "./joueurs.service";
import { JoueursController } from "./joueurs.controller";

@Module({
  imports: [AccesModule, TypeOrmModule.forFeature([Joueur, Composition, Match, EvenementMatch, Equipe, Saison, StatJoueurEquipe])],
  controllers: [JoueursController],
  providers: [JoueursService],
  exports: [JoueursService],
})
export class JoueursModule {}
