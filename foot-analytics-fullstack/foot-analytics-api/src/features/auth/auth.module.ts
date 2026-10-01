// src/features/auth/auth.module.ts

import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Utilisateur } from "@/features/utilisateurs/utilisateur.entity";

import { AuthService } from "./auth.service";
import { JwtAuthGuard, AdminGuard, GestionnaireGuard } from "./auth.guards";
import { AuthController } from "./auth.controller";

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([Utilisateur])],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, AdminGuard, GestionnaireGuard],
  exports: [AuthService, JwtAuthGuard, AdminGuard, GestionnaireGuard],
})
export class AuthModule {}
