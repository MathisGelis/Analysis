// src/features/auth/auth.service.ts
//
// Emission et verification des jetons JWT (bcrypt pour les mots de passe). Le secret est lu dans
// process.env.JWT_SECRET. La creation des comptes reste dans UtilisateursService : ici, on valide les identifiants.

import { BadRequestException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcryptjs";
import * as jwt from "jsonwebtoken";

import { Utilisateur } from "@/features/utilisateurs/utilisateur.entity";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-foot-analytics-change-me";
const JWT_EXPIRES = "7d";

/** Payload encode dans le token JWT. */
export interface JwtPayload {
  sub: string;        // user id
  login: string;
  role: string;       // "admin" | "referent" | "user"
  clubId?: string;
  equipeIds?: string[];
}

/** Construit le login canonique a partir du prenom + nom (UPPER). */
export function buildLogin(prenom: string, nom: string): string {
  const p = (prenom ?? "").trim();
  const n = (nom ?? "").trim();
  if (!p || !n) throw new BadRequestException("Prenom et nom requis");
  return (p[0] + n).replace(/\s+/g, "").toUpperCase();
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
