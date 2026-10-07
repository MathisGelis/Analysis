// src/features/acces/acces.module.ts

import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Equipe } from "@/features/equipes/equipe.entity";
import { Joueur } from "@/features/joueurs/joueur.entity";
import { Match } from "@/features/matchs/match.entity";
import { Saison } from "@/features/saisons/saison.entity";
import { Utilisateur } from "@/features/utilisateurs/utilisateur.entity";

import { AccesService } from "./acces.service";

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Utilisateur, Equipe, Saison, Match, Joueur])],
  providers: [AccesService],
  exports: [AccesService],
})
export class AccesModule {}
