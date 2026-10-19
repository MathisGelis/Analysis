// src/features/acces/acces.guard.ts

import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { IS_PUBLIC_KEY } from "@/features/auth/public.decorator";
import { AVANT_CHANGEMENT_KEY } from "@/features/auth/avant-changement.decorator";

import { AccesService } from "./acces.service";

/**
 * Garde global : charge le compte authentifie et son contexte d'acces. Les routes @Public() sont epargnees.
 * Refuse un jeton revoque (version de jeton depassee), un compte desactive, et tout ce qui n'est pas
 * @AvantNouveauMotDePasse() tant que le mot de passe temporaire n'a pas ete change.
 */
@Injectable()
export class AccesGuard implements CanActivate {
  constructor(private reflector: Reflector, private acces: AccesService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const cibles = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, cibles)) return true;
    const req = ctx.switchToHttp().getRequest();
    if (!req.user?.sub) throw new UnauthorizedException("Token absent");
    const u = await this.acces.compte(req.user);
    if (u.mustChangePassword && !this.reflector.getAllAndOverride<boolean>(AVANT_CHANGEMENT_KEY, cibles)) {
      throw new ForbiddenException({
        statusCode: 403, code: "MOT_DE_PASSE_A_CHANGER",
        message: "Choisis d'abord ton nouveau mot de passe (le mot de passe temporaire ne sert qu'a ca).",
      });
    }
    req.acces = await this.acces.contexteDe(u);
    return true;
  }
}
