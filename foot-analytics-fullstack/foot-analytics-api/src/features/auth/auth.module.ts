// src/features/auth/auth.module.ts

import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Utilisateur } from "@/features/utilisateurs/utilisateur.entity";

import { AuthService } from "./auth.service";
import { JwtAuthGuard, AdminGuard, GestionnaireGuard } from "./auth.guards";
import { AuthController } from "./auth.controller";
import { EntretienComptesService } from "./entretien-comptes.service";
import { Session } from "./session.entity";

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([Utilisateur, Session])],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, AdminGuard, GestionnaireGuard, EntretienComptesService],
  exports: [AuthService, JwtAuthGuard, AdminGuard, GestionnaireGuard, EntretienComptesService],
})
export class AuthModule {}
