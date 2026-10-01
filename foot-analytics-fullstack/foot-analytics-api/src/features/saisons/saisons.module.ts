// src/features/saisons/saisons.module.ts
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { EquipesModule } from "@/features/equipes/equipes.module";
import { AccesModule } from "@/features/acces/acces.module";

import { Saison } from "./saison.entity";
import { SaisonsService } from "./saisons.service";
import { SaisonsController } from "./saisons.controller";
import { BootstrapService } from "./bootstrap.service";

@Module({
  imports: [
    AccesModule,
    TypeOrmModule.forFeature([Saison]),
    EquipesModule,
  ],
  controllers: [SaisonsController],
  providers: [SaisonsService, BootstrapService],
  exports: [SaisonsService, BootstrapService],
})
export class SaisonsModule {}
