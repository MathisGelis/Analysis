// src/features/scouting/scouting.module.ts

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Saison } from "@/features/saisons/saison.entity";

import { RapportScouting } from "./rapport-scouting.entity";
import { ScoutingService } from "./scouting.service";
import { ScoutingController } from "./scouting.controller";

@Module({
  imports: [TypeOrmModule.forFeature([RapportScouting, Saison])],
  controllers: [ScoutingController],
  providers: [ScoutingService],
})
export class ScoutingModule {}
