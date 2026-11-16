// src/features/direct/direct.module.ts

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AccesModule } from "@/features/acces/acces.module";
import { Club } from "@/features/clubs/club.entity";
import { Joueur } from "@/features/joueurs/joueur.entity";
import { JoueursModule } from "@/features/joueurs/joueurs.module";
import { Tactique } from "@/features/tactiques/tactique.entity";

import { DirectController } from "./direct.controller";
import { Direct } from "./direct.entity";
import { DirectService } from "./direct.service";
import { EvenementDirect } from "./evenement-direct.entity";

@Module({
  imports: [AccesModule, JoueursModule, TypeOrmModule.forFeature([Direct, EvenementDirect, Club, Tactique, Joueur])],
  controllers: [DirectController],
  providers: [DirectService],
  exports: [DirectService],
})
export class DirectModule {}
