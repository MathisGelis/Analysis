// src/features/analyse-jeu/analyse-jeu.module.ts

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AccesModule } from "@/features/acces/acces.module";
import { EvenementDirect } from "@/features/direct/evenement-direct.entity";
import { EvenementMatch } from "@/features/matchs/evenement-match.entity";

import { AnalyseJeuController } from "./analyse-jeu.controller";
import { AnalyseJeuService } from "./analyse-jeu.service";

@Module({
  imports: [AccesModule, TypeOrmModule.forFeature([EvenementDirect, EvenementMatch])],
  controllers: [AnalyseJeuController],
  providers: [AnalyseJeuService],
  exports: [AnalyseJeuService],
})
export class AnalyseJeuModule {}
