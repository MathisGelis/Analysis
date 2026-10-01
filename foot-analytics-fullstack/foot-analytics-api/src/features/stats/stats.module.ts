// src/features/stats/stats.module.ts

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Match } from "@/features/matchs/match.entity";
import { AccesModule } from "@/features/acces/acces.module";

import { StatsService } from "./stats.service";
import { StatsController } from "./stats.controller";

@Module({
  imports: [AccesModule, TypeOrmModule.forFeature([Match])],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
