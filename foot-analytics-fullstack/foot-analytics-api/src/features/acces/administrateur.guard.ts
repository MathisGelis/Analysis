// src/features/acces/administrateur.guard.ts

import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";

import type { ContexteAcces } from "./contexte-acces";

/**
 * Reserve une route (ou un controleur) a l'administrateur, d'apres le contexte d'acces lu en base par le garde global
 * (et non le seul jeton) : un compte retrograde perd la main tout de suite. 403 pour tout autre compte, comme
 * `AccesService.exigerAdmin`. A declarer avec @UseGuards : il s'execute apres les gardes globaux, qui posent `req.acces`.
 */
@Injectable()
export class AdministrateurGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const acces = ctx.switchToHttp().getRequest().acces as ContexteAcces | undefined;
    if (!acces?.admin) throw new ForbiddenException("Operation reservee aux administrateurs.");
    return true;
  }
}
