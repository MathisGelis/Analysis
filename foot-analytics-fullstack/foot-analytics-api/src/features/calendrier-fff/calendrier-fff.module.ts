// src/features/calendrier-fff/calendrier-fff.module.ts

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AccesModule } from "@/features/acces/acces.module";
import { AuthModule } from "@/features/auth/auth.module";
import { Club } from "@/features/clubs/club.entity";
import { Equipe } from "@/features/equipes/equipe.entity";
import { Match } from "@/features/matchs/match.entity";
import { Saison } from "@/features/saisons/saison.entity";

import { CalendrierFffController } from "./calendrier-fff.controller";
import { CalendrierFffPlanificateur } from "./calendrier-fff.planificateur";
import { CalendrierFffService } from "./calendrier-fff.service";

@Module({
  imports: [AccesModule, AuthModule, TypeOrmModule.forFeature([Equipe, Match, Club, Saison])],
  controllers: [CalendrierFffController],
  providers: [CalendrierFffService, CalendrierFffPlanificateur],
  exports: [CalendrierFffService],
})
export class CalendrierFffModule {}
