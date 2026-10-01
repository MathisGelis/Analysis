// src/features/auth/auth.controller.ts
//
// Authentification par JWT + bcrypt :
//   POST /auth/login            -> public, renvoie token + info user
//   POST /auth/change-password  -> requiert auth, force mustChangePassword=false
//   GET  /auth/me               -> renvoie l'utilisateur courant

import { Body, Controller, Get, NotFoundException, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcryptjs";

import { Utilisateur } from "@/features/utilisateurs/utilisateur.entity";

import { Public } from "./public.decorator";
import { AuthService } from "./auth.service";
import { LoginDto, ChangePasswordDto } from "./auth.dto";
import { JwtAuthGuard } from "./auth.guards";

@Controller("auth")
export class AuthController {
  constructor(
    private svc: AuthService,
    @InjectRepository(Utilisateur) private repo: Repository<Utilisateur>,
  ) {}

  @Public()
  @Post("login")
  async login(@Body() dto: LoginDto) {
    const u = await this.svc.validate(dto.login, dto.password);
    const token = this.svc.sign(u);
    return {
      token,
      user: {
        id: u.id, login: u.login, prenom: u.prenom, nom: u.nom,
        role: u.role, clubId: u.clubId, equipeIds: u.equipeIds,
        toutesSaisons: u.toutesSaisons !== false, saisonIds: u.toutesSaisons === false ? (u.saisonIds ?? []) : [],
        mustChangePassword: u.mustChangePassword,
      },
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@Req() req: any) {
    const u = await this.repo.findOne({ where: { id: req.user.sub } });
    if (!u) throw new NotFoundException("Utilisateur introuvable");
    return {
      id: u.id, login: u.login, prenom: u.prenom, nom: u.nom,
      role: u.role, clubId: u.clubId, equipeIds: u.equipeIds,
      toutesSaisons: u.toutesSaisons !== false, saisonIds: u.toutesSaisons === false ? (u.saisonIds ?? []) : [],
      mustChangePassword: u.mustChangePassword,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post("change-password")
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    const u = await this.repo.findOne({ where: { id: req.user.sub } });
    if (!u) throw new NotFoundException("Utilisateur introuvable");
    const ok = await bcrypt.compare(dto.oldPassword, u.passwordHash);
    if (!ok) throw new UnauthorizedException("Ancien mot de passe invalide");
    u.passwordHash = await AuthService.hash(dto.newPassword);
    u.mustChangePassword = false;
    await this.repo.save(u);
    return { ok: true };
  }
}
