// src/modules/auth/auth.module.ts
//
// Authentification par JWT + bcrypt. Endpoints publics :
//   POST /auth/login            -> renvoie token + info user
//   POST /auth/change-password  -> requiert auth, force mustChangePassword=false
//   GET  /auth/me               -> renvoie l'utilisateur courant
//
// Le secret JWT est lu dans process.env.JWT_SECRET, fallback "dev-secret".
// Les guards JwtAuthGuard et AdminGuard sont exportes pour usage dans
// les autres modules (UtilisateursModule, et plus tard pour le
// filtrage des donnees par club/equipe).

import {
  BadRequestException, Body, CanActivate, Controller, ExecutionContext, ForbiddenException,
  Get, Injectable, Logger, Module, NotFoundException, Post, Req, SetMetadata,
  UnauthorizedException, UseGuards,
} from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { InjectRepository, TypeOrmModule } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcryptjs";
import * as jwt from "jsonwebtoken";
import { IsString, MinLength } from "class-validator";
import { Utilisateur } from "@/entities";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-foot-analytics-change-me";
const JWT_EXPIRES = "7d";

/**
 * Decorator @Public() : marque une route comme accessible sans token.
 * Utilise sur POST /auth/login pour pouvoir se connecter.
 */
export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Payload encode dans le token JWT. */
export interface JwtPayload {
  sub: string;        // user id
  login: string;
  role: string;       // "admin" | "referent" | "user"
  clubId?: string;
  equipeIds?: string[];
  /** Absents : toutes les saisons. Presents (educateur restreint) : la saison actuelle + ces saisons passees. */
  toutesSaisons?: false;
  saisonIds?: string[];
}

/** Construit le login canonique a partir du prenom + nom (UPPER). */
export function buildLogin(prenom: string, nom: string): string {
  const p = (prenom ?? "").trim();
  const n = (nom ?? "").trim();
  if (!p || !n) throw new BadRequestException("Prenom et nom requis");
  return (p[0] + n).replace(/\s+/g, "").toUpperCase();
}

class LoginDto {
  @IsString() login: string;
  @IsString() password: string;
}
class ChangePasswordDto {
  @IsString() oldPassword: string;
  @IsString() @MinLength(6) newPassword: string;
}

/**
 * Service d'auth. La logique de creation d'utilisateur reste dans
 * UtilisateursService (admin) ; ici on ne fait que valider les
 * credentials et emettre/lire les tokens.
 */
@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);

  constructor(
    @InjectRepository(Utilisateur) private repo: Repository<Utilisateur>,
  ) {}

  async validate(login: string, password: string): Promise<Utilisateur> {
    const u = await this.repo.findOne({ where: { login: (login ?? "").toUpperCase() } });
    if (!u) throw new UnauthorizedException("Login ou mot de passe invalide");
    const ok = await bcrypt.compare(password, u.passwordHash);
    if (!ok) throw new UnauthorizedException("Login ou mot de passe invalide");
    return u;
  }

  sign(u: Utilisateur): string {
    const payload: JwtPayload = {
      sub: u.id, login: u.login, role: u.role,
      clubId: u.clubId ?? undefined,
      equipeIds: u.equipeIds ?? undefined,
      ...(u.toutesSaisons === false ? { toutesSaisons: false as const, saisonIds: u.saisonIds ?? [] } : {}),
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  }

  verify(token: string): JwtPayload {
    try { return jwt.verify(token, JWT_SECRET) as JwtPayload; }
    catch { throw new UnauthorizedException("Token invalide ou expire"); }
  }

  /** Genere un mot de passe par defaut. Doit etre change a la 1ere connexion. */
  static defaultPassword(): string {
    // Choix simple : "Bienvenue1" (assez memorable a transmettre verbalement,
    // et l'utilisateur DOIT le changer immediatement). Pour quelque chose
    // de plus sec on pourrait randomiser 8 caracteres ici.
    return "Bienvenue1";
  }

  static async hash(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  /**
   * Au demarrage, on cree un compte admin par defaut s'il n'existe
   * aucun utilisateur en base. Login = "AADMIN", mdp = defaultPassword.
   */
  async bootstrapAdmin(): Promise<void> {
    const count = await this.repo.count();
    if (count > 0) return;
    const passwordHash = await AuthService.hash(AuthService.defaultPassword());
    const u = this.repo.create({
      login: "AADMIN",
      prenom: "Admin",
      nom: "Admin",
      passwordHash,
      mustChangePassword: true,
      role: "admin",
    });
    await this.repo.save(u);
    this.log.log(
      `Compte admin par defaut cree : login="AADMIN" / mdp="${AuthService.defaultPassword()}" — A CHANGER A LA 1ere CONNEXION`,
    );
  }
}

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

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([Utilisateur])],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, AdminGuard, GestionnaireGuard],
  exports: [AuthService, JwtAuthGuard, AdminGuard, GestionnaireGuard],
})
export class AuthModule {}
