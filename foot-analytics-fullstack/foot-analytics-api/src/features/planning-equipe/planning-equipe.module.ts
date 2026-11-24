// src/features/planning-equipe/planning-equipe.module.ts

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AccesModule } from "@/features/acces/acces.module";

import { PlanningEquipeController } from "./planning-equipe.controller";
import { EvenementEquipe, PlanningEquipe } from "./planning-equipe.entity";
import { PlanningEquipeService } from "./planning-equipe.service";

@Module({
  imports: [AccesModule, TypeOrmModule.forFeature([PlanningEquipe, EvenementEquipe])],
  controllers: [PlanningEquipeController],
  providers: [PlanningEquipeService],
})
export class PlanningEquipeModule {}
