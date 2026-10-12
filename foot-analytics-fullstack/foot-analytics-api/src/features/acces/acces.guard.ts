// src/features/acces/acces.guard.ts

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { IS_PUBLIC_KEY } from "@/features/auth/public.decorator";

import { AccesService } from "./acces.service";

/** Garde global : charge le contexte d'acces du compte authentifie. Les routes @Public() sont epargnees. */
@Injectable()
export class AccesGuard implements CanActivate {
  constructor(private reflector: Reflector, private acces: AccesService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    if (!req.user?.sub) throw new UnauthorizedException("Token absent");
    req.acces = await this.acces.contexte(req.user.sub);
    return true;
  }
}
