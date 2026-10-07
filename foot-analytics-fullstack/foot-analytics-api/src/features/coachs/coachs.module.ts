// src/features/coachs/coachs.module.ts

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AccesModule } from "@/features/acces/acces.module";

import { Coach } from "./coach.entity";
import { StaffMatch } from "./staff-match.entity";
import { CoachsService } from "./coachs.service";
import { CoachsController } from "./coachs.controller";

@Module({
  imports: [AccesModule, TypeOrmModule.forFeature([Coach, StaffMatch])],
  controllers: [CoachsController],
  providers: [CoachsService],
  exports: [CoachsService],
})
export class CoachsModule {}
