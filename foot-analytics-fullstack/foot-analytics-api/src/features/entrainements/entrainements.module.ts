// src/features/entrainements/entrainements.module.ts

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { DerivationModule } from "@/features/derivation/derivation.module";
import { AccesModule } from "@/features/acces/acces.module";

import { Entrainement } from "./entrainement.entity";
import { EntrainementsService } from "./entrainements.service";
import { EntrainementsController } from "./entrainements.controller";

@Module({
  imports: [
    AccesModule,
    TypeOrmModule.forFeature([Entrainement]),
    DerivationModule,
  ],
  controllers: [EntrainementsController],
  providers: [EntrainementsService],
})
export class EntrainementsModule {}
