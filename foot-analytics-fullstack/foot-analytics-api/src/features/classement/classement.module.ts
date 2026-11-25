// src/features/classement/classement.module.ts

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Equipe } from "@/features/equipes/equipe.entity";
import { IaModule } from "@/features/ia/ia.module";
import { Match } from "@/features/matchs/match.entity";

import { LigneClassement } from "./ligne-classement.entity";
import { ClassementService } from "./classement.service";
import { ClassementController } from "./classement.controller";

@Module({
  imports: [TypeOrmModule.forFeature([LigneClassement, Match, Equipe]), IaModule],
  controllers: [ClassementController],
  providers: [ClassementService],
  exports: [ClassementService],
})
export class ClassementModule {}
