// src/features/equipes/equipes.module.ts

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "@/features/auth/auth.module";
import { AccesModule } from "@/features/acces/acces.module";

import { Equipe } from "./equipe.entity";
import { EquipesService } from "./equipes.service";
import { EquipesController } from "./equipes.controller";

@Module({
  imports: [AccesModule, TypeOrmModule.forFeature([Equipe]), AuthModule],
  controllers: [EquipesController],
  providers: [EquipesService],
  exports: [EquipesService],
})
export class EquipesModule {}
