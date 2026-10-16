// src/features/auth/auth.controller.ts
//
// Authentification (voir auth.service.ts pour les jetons) :
//   POST /auth/login            -> public : jeton d'acces (15 min) + jeton de rafraichissement + profil
//   POST /auth/refresh          -> public : rotation du jeton de rafraichissement, nouveau jeton d'acces
//   POST /auth/logout           -> public : revoque la session du jeton de rafraichissement fourni
//   POST /auth/logout-all       -> deconnexion de tous les appareils (jetons d'acces deja emis compris)
//   POST /auth/change-password  -> politique appliquee ; ferme les autres sessions, renvoie de nouveaux jetons
//   POST /auth/cgu              -> acceptation des conditions d'utilisation (version)
//   GET  /auth/me               -> l'utilisateur courant
//
// Le navigateur ne voit jamais ces jetons : le serveur Next (BFF) les range dans des cookies HttpOnly.

import { Body, Controller, Get, NotFoundException, Post, Req } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Utilisateur } from "@/features/utilisateurs/utilisateur.entity";
import { LimiteConnexion } from "@/features/limites/limites.module";
import { ipClient } from "@/features/limites/ip-client";

import { Public } from "./public.decorator";
import { AvantNouveauMotDePasse } from "./avant-changement.decorator";
import { AuthService, profilUtilisateur } from "./auth.service";
import { CguDto, ChangePasswordDto, LoginDto, RefreshDto } from "./auth.dto";

@Controller("auth")
export class AuthController {
  constructor(
    private svc: AuthService,
    @InjectRepository(Utilisateur) private repo: Repository<Utilisateur>,
  ) {}

  @Public()
  @LimiteConnexion()
  @Post("login")
  async login(@Req() req: any, @Body() dto: LoginDto) {
    const u = await this.svc.validate(dto.login, dto.password, ipClient(req));
    return { ...(await this.svc.ouvrirSession(u)), user: profilUtilisateur(u) };
  }

  @Public()
  @Post("refresh")
  async refresh(@Body() dto: RefreshDto) {
    return this.svc.rafraichir(dto.refreshToken);
  }

  // Public : se deconnecter doit marcher meme avec un jeton d'acces expire.
  @Public()
  @Post("logout")
  async logout(@Body() dto: RefreshDto) {
    await this.svc.fermerSession(dto.refreshToken);
    return { ok: true };
  }

  @AvantNouveauMotDePasse()
  @Post("logout-all")
  async logoutAll(@Req() req: any) {
    await this.svc.fermerToutesSessions(req.user.sub);
    return { ok: true };
  }

  @AvantNouveauMotDePasse()
  @Get("me")
  async me(@Req() req: any) {
    const u = await this.repo.findOne({ where: { id: req.user.sub } });
    if (!u) throw new NotFoundException("Utilisateur introuvable");
    return profilUtilisateur(u);
  }

  @AvantNouveauMotDePasse()
  @Post("change-password")
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    const { u, jetons } = await this.svc.changerMotDePasse(req.user.sub, dto.oldPassword, dto.newPassword);
    return { ok: true, ...jetons, user: profilUtilisateur(u) };
  }

  @AvantNouveauMotDePasse()
  @Post("cgu")
  async cgu(@Req() req: any, @Body() dto: CguDto) {
    return profilUtilisateur(await this.svc.accepterCgu(req.user.sub, dto.version));
  }
}
