// src/features/clubs/clubs.module.ts

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AccesModule } from "@/features/acces/acces.module";

import { Club } from "./club.entity";
import { ClubsService } from "./clubs.service";
import { ClubsController } from "./clubs.controller";

@Module({
  imports: [AccesModule, TypeOrmModule.forFeature([Club])],
  controllers: [ClubsController],
  providers: [ClubsService],
  exports: [ClubsService],
})
export class ClubsModule {}
