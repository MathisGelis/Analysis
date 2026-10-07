// src/features/auth/auth.guards.ts

import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { IS_PUBLIC_KEY } from "./public.decorator";
import { AuthService } from "./auth.service";

/**
 * Guard standard : exige un Authorization: Bearer <token> valide. Place
 * le payload dans req.user.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private auth: AuthService,
    private reflector: Reflector,
  ) {}
  canActivate(ctx: ExecutionContext): boolean {
    // Routes marquees @Public() : pas de check de token (ex: /auth/login).
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (isPublic) return true;
    const req = ctx.switchToHttp().getRequest();
    const h = (req.headers["authorization"] ?? "") as string;
    const m = h.match(/^Bearer\s+(.+)$/i);
    if (!m) throw new UnauthorizedException("Token absent");
    req.user = this.auth.verify(m[1]);
    return true;
  }
}

/**
 * Guard admin : extend Jwt. Refuse si role != "admin".
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private auth: AuthService) {}
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const h = (req.headers["authorization"] ?? "") as string;
    const m = h.match(/^Bearer\s+(.+)$/i);
    if (!m) throw new UnauthorizedException("Token absent");
    const payload = this.auth.verify(m[1]);
    if (payload.role !== "admin") {
      throw new UnauthorizedException("Acces reserve aux administrateurs");
    }
    req.user = payload;
    return true;
  }
}

/**
 * Guard de gestion des comptes : un administrateur ou un referent de club. Le perimetre exact (quels comptes) est
 * verifie par le service, a partir de la base et non du jeton.
 */
@Injectable()
export class GestionnaireGuard implements CanActivate {
  constructor(private auth: AuthService) {}
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const h = (req.headers["authorization"] ?? "") as string;
    const m = h.match(/^Bearer\s+(.+)$/i);
    if (!m) throw new UnauthorizedException("Token absent");
    const payload = this.auth.verify(m[1]);
    if (payload.role !== "admin" && payload.role !== "referent") {
      throw new ForbiddenException("Acces reserve aux administrateurs et aux referents de club");
    }
    req.user = payload;
    return true;
  }
}
