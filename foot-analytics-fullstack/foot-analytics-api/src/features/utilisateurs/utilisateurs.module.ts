// src/features/utilisateurs/utilisateurs.module.ts

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Equipe } from "@/features/equipes/equipe.entity";
import { Saison } from "@/features/saisons/saison.entity";
import { AuthModule } from "@/features/auth/auth.module";

import { Utilisateur } from "./utilisateur.entity";
import { UtilisateursService } from "./utilisateurs.service";
import { UtilisateursController } from "./utilisateurs.controller";

@Module({
  imports: [TypeOrmModule.forFeature([Utilisateur, Equipe, Saison]), AuthModule],
  controllers: [UtilisateursController],
  providers: [UtilisateursService],
  exports: [UtilisateursService],
})
export class UtilisateursModule {}
