// src/features/ia/ia.module.ts

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Club } from "@/features/clubs/club.entity";
import { Composition } from "@/features/matchs/composition.entity";
import { Equipe } from "@/features/equipes/equipe.entity";
import { Match } from "@/features/matchs/match.entity";
import { Saison } from "@/features/saisons/saison.entity";

import { IaEntrainement } from "./ia-entrainement.entity";
import { IaModele } from "./ia-modele.entity";
import { IaController } from "./ia.controller";
import { IaService } from "./ia.service";

@Module({
  imports: [TypeOrmModule.forFeature([Match, Equipe, Club, Composition, Saison, IaEntrainement, IaModele])],
  controllers: [IaController],
  providers: [IaService],
  exports: [IaService],
})
export class IaModule {}
