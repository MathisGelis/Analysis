// src/features/auth/auth.service.ts
//
// Connexion, sessions et jetons.
//
//   - Jeton d'acces : JWT court (15 min), porte la version de jeton du compte (`v`). AccesGuard compare cette version a
//     celle de la base a chaque requete : l'incrementer revoque d'un coup tous les jetons d'acces deja emis.
//   - Jeton de rafraichissement : opaque (32 octets aleatoires), 30 jours glissants, stocke en base sous forme
//     d'empreinte (table sessions). Rotation a chaque usage ; le rejeu d'un jeton deja remplace revoque toute la
//     famille (vol presume). Une courte tolerance couvre les rafraichissements simultanes d'un meme navigateur.
//   - Echecs de connexion : verrouillage temporaire du compte apres 5 echecs consecutifs (en plus de la limite de
//     debit par adresse IP et par login, voir limites.ts).
//
// Le secret JWT est lu dans process.env.JWT_SECRET. La creation des comptes reste dans UtilisateursService.

import {
  BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { IsNull, LessThan, Repository } from "typeorm";
import * as bcrypt from "bcryptjs";
import * as jwt from "jsonwebtoken";

import { Utilisateur } from "@/features/utilisateurs/utilisateur.entity";
import { JournalAuditService } from "@/features/audit/journal-audit.service";

import { defautsMotDePasse, messageRefus, motDePasseTemporaire } from "./mots-de-passe";
import { Session } from "./session.entity";

const SECRET_DEV = "dev-secret-foot-analytics-change-me";
const JWT_SECRET = process.env.JWT_SECRET || SECRET_DEV;
// En production, le secret par defaut est public (il est dans le depot) : n'importe qui pourrait forger un jeton admin.
if (process.env.NODE_ENV === "production" && (JWT_SECRET === SECRET_DEV || JWT_SECRET.length < 32)) {
  throw new Error("JWT_SECRET obligatoire en production (32 caracteres minimum). Genere-le avec : openssl rand -hex 32");
}

/** Duree de vie d'un jeton d'acces, en secondes. */
export const DUREE_ACCES_S = 15 * 60;
/** Duree de vie (glissante) d'une session sans activite, en jours. */
export const DUREE_SESSION_JOURS = Math.max(1, Number(process.env.SESSION_JOURS) || 30);
/** Un jeton remplace il y a moins de 60 s est un rafraichissement simultane, pas un rejeu. */
const TOLERANCE_ROTATION_MS = 60_000;
/** Echecs consecutifs avant verrouillage, et duree du verrouillage. */
export const ECHECS_AVANT_VERROU = 5;
export const DUREE_VERROU_MIN = 15;

/** Payload encode dans le jeton d'acces. */
export interface JwtPayload {
  sub: string;        // user id
  login: string;
  role: string;       // "admin" | "referent" | "user"
  clubId?: string;
  equipeIds?: string[];
  /** Version de jeton du compte au moment de l'emission (revocation). */
  v?: number;
  /** Present tant que le mot de passe temporaire n'a pas ete change : le front redirige vers /change-password. */
  doitChanger?: true;
}

/** Ce que recoit le client a la connexion, au rafraichissement et au changement de mot de passe. */
export interface JetonsSession {
  token: string;
  /** Null : rafraichissement simultane, le client garde le jeton de rafraichissement qu'il a deja recu. */
  refreshToken: string | null;
  expiresIn: number;
}

/** Construit le login canonique a partir du prenom + nom (UPPER). */
export function buildLogin(prenom: string, nom: string): string {
  const p = (prenom ?? "").trim();
  const n = (nom ?? "").trim();
  if (!p || !n) throw new BadRequestException("Prenom et nom requis");
  return (p[0] + n).replace(/\s+/g, "").toUpperCase();
}

/** Le compte tel que le front le connait (jamais le hash ni les compteurs internes). */
export function profilUtilisateur(u: Utilisateur) {
  return {
    id: u.id, login: u.login, prenom: u.prenom, nom: u.nom,
    role: u.role, clubId: u.clubId, equipeIds: u.equipeIds,
    toutesSaisons: u.toutesSaisons !== false, saisonIds: u.toutesSaisons === false ? (u.saisonIds ?? []) : [],
    mustChangePassword: u.mustChangePassword,
    cguVersion: u.cguVersion ?? null,
  };
}

export const empreinteJeton = (jeton: string): string => createHash("sha256").update(jeton).digest("hex");
const maintenantIso = () => new Date().toISOString();

/** Revoque toutes les sessions ouvertes d'un compte (mot de passe change, compte desactive ou supprime...). */
export async function revoquerSessions(sessions: Repository<Session>, utilisateurId: string): Promise<void> {
  await sessions.update({ utilisateurId, revoqueeLe: IsNull() }, { revoqueeLe: maintenantIso() });
}

/** L'ancien mot de passe initial, identique pour tous les comptes : refuse (voir validate). */
const ANCIEN_MOT_DE_PASSE_COMMUN = "Bienvenue1";

/** Cout bcrypt des mots de passe. */
const COUT_BCRYPT = 12;

// Hash d'un mot de passe que personne ne connait : un login inconnu coute le meme temps de verification qu'un vrai,
// la duree de la reponse ne revele donc pas quels logins existent.
let hashFictif: string | null = null;
const hashLeurre = () => (hashFictif ??= bcrypt.hashSync(randomBytes(16).toString("hex"), COUT_BCRYPT));

@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);

  constructor(
    @InjectRepository(Utilisateur) private repo: Repository<Utilisateur>,
    @InjectRepository(Session) private sessions: Repository<Session>,
    private journal: JournalAuditService,
  ) {}

  /**
   * Verifie les identifiants. Compte verrouille : 429 ; compte desactive : 403 (seulement avec le bon mot de passe).
   * Chaque tentative laisse une trace d'audit (jamais le login saisi : il peut contenir une faute de frappe... ou le
   * mot de passe).
   */
  async validate(login: string, password: string, ip: string | null = null): Promise<Utilisateur> {
    const u = await this.repo.findOne({ where: { login: (login ?? "").trim().toUpperCase() } });
    const maintenant = Date.now();
    if (u?.verrouilleJusqua && Date.parse(u.verrouilleJusqua) > maintenant) {
      const minutes = Math.max(1, Math.ceil((Date.parse(u.verrouilleJusqua) - maintenant) / 60_000));
      await this.journal.noter("connexion.echec", { cible: `utilisateur:${u.id}`, cibleClubId: u.clubId, details: { motif: "verrouille" }, ip });
      throw new HttpException(
        { statusCode: 429, code: "COMPTE_VERROUILLE", message: `Trop d'essais : reessaie dans ${minutes} min.` },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const ok = await bcrypt.compare(password ?? "", u?.passwordHash ?? hashLeurre());
    if (!u || !ok) {
      if (u) await this.noterEchec(u, ip);
      else await this.journal.noter("connexion.echec", { details: { motif: "login_inconnu" }, ip });
      throw new UnauthorizedException("Login ou mot de passe invalide");
    }
    // L'ancien mot de passe initial commun ("Bienvenue1") etait connu de tous : un compte qui ne l'a jamais change
    // doit etre reinitialise par un gestionnaire (nouveau mot de passe aleatoire). Seul un administrateur passe
    // encore, pour ne pas fermer l'application a son dernier gestionnaire ; il doit le changer avant toute chose.
    if (u.mustChangePassword && password === ANCIEN_MOT_DE_PASSE_COMMUN && u.role !== "admin") {
      await this.journal.noter("connexion.echec", { cible: `utilisateur:${u.id}`, cibleClubId: u.clubId, details: { motif: "mot_de_passe_perime" }, ip });
      throw new UnauthorizedException({
        statusCode: 401, code: "MOT_DE_PASSE_PERIME",
        message: "Ce mot de passe initial n'est plus valable : demande a ton referent ou a l'administrateur de le reinitialiser.",
      });
    }
    if (u.desactiveLe) {
      await this.journal.noter("connexion.echec", { cible: `utilisateur:${u.id}`, cibleClubId: u.clubId, details: { motif: "compte_desactive" }, ip });
      throw new ForbiddenException({
        statusCode: 403, code: "COMPTE_DESACTIVE",
        message: "Compte desactive : demande a ton referent ou a l'administrateur de le reactiver.",
      });
    }
    u.echecsConnexion = 0;
    u.verrouilleJusqua = null;
    u.derniereActivite = maintenantIso();
    await this.repo.update(u.id, { echecsConnexion: 0, verrouilleJusqua: null, derniereActivite: u.derniereActivite });
    await this.journal.noter("connexion.reussie", { acteur: u, ip });
    return u;
  }

  private async noterEchec(u: Utilisateur, ip: string | null): Promise<void> {
    const echecs = (u.echecsConnexion ?? 0) + 1;
    await this.journal.noter("connexion.echec", { cible: `utilisateur:${u.id}`, cibleClubId: u.clubId, details: { motif: "mot_de_passe" }, ip });
    if (echecs >= ECHECS_AVANT_VERROU) {
      const jusqua = new Date(Date.now() + DUREE_VERROU_MIN * 60_000).toISOString();
      await this.repo.update(u.id, { echecsConnexion: 0, verrouilleJusqua: jusqua });
      await this.journal.noter("connexion.verrouillage", { cible: `utilisateur:${u.id}`, cibleClubId: u.clubId, details: { minutes: DUREE_VERROU_MIN }, ip });
      this.log.warn(`Un compte est verrouille ${DUREE_VERROU_MIN} min apres ${ECHECS_AVANT_VERROU} echecs de connexion (voir le journal d'audit)`);
    } else {
      await this.repo.update(u.id, { echecsConnexion: echecs });
    }
  }

  /** Jeton d'acces (court) du compte. */
  sign(u: Utilisateur): string {
    const payload: JwtPayload = {
      sub: u.id, login: u.login, role: u.role,
      clubId: u.clubId ?? undefined,
      equipeIds: u.equipeIds ?? undefined,
      v: u.versionJeton ?? 0,
      ...(u.mustChangePassword ? { doitChanger: true as const } : {}),
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: DUREE_ACCES_S });
  }

  verify(token: string): JwtPayload {
    try { return jwt.verify(token, JWT_SECRET) as JwtPayload; }
    catch { throw new UnauthorizedException("Token invalide ou expire"); }
  }

  /** Nouvelle session (nouvelle famille) apres une connexion. */
  async ouvrirSession(u: Utilisateur): Promise<JetonsSession> {
    return this.emettre(u, randomUUID());
  }

  private async emettre(u: Utilisateur, famille: string): Promise<JetonsSession> {
    const refreshToken = randomBytes(32).toString("base64url");
    const maintenant = Date.now();
    await this.sessions.save(this.sessions.create({
      utilisateurId: u.id, famille, empreinte: empreinteJeton(refreshToken),
      creeeLe: new Date(maintenant).toISOString(),
      expireLe: new Date(maintenant + DUREE_SESSION_JOURS * 86_400_000).toISOString(),
      remplaceeLe: null, revoqueeLe: null,
    }));
    return { token: this.sign(u), refreshToken, expiresIn: DUREE_ACCES_S };
  }

  /** Echange un jeton de rafraichissement contre de nouveaux jetons (rotation). */
  async rafraichir(refreshToken: string): Promise<JetonsSession> {
    const s = refreshToken ? await this.sessions.findOne({ where: { empreinte: empreinteJeton(refreshToken) } }) : null;
    const maintenant = Date.now();
    if (!s || s.revoqueeLe || Date.parse(s.expireLe) <= maintenant) {
      throw new UnauthorizedException("Session expiree : reconnecte-toi.");
    }
    const u = await this.repo.findOne({ where: { id: s.utilisateurId } });
    if (!u || u.desactiveLe) {
      await this.revoquerFamille(s.famille);
      throw new UnauthorizedException("Session expiree : reconnecte-toi.");
    }
    if (s.remplaceeLe) {
      // Deux requetes du meme navigateur ont presente le meme jeton : la seconde recoit un jeton d'acces, sans
      // nouveau jeton de rafraichissement (le navigateur garde celui de la premiere).
      if (maintenant - Date.parse(s.remplaceeLe) <= TOLERANCE_ROTATION_MS) {
        return { token: this.sign(u), refreshToken: null, expiresIn: DUREE_ACCES_S };
      }
      // Rejeu d'un jeton remplace depuis longtemps : il a ete copie. Toute la famille tombe.
      await this.revoquerFamille(s.famille);
      await this.journal.noter("session.rejeu", { acteur: u, details: { famille: s.famille } });
      this.log.warn("Rejeu d'un jeton de rafraichissement : la famille de sessions est revoquee (voir le journal d'audit)");
      throw new UnauthorizedException("Session revoquee : reconnecte-toi.");
    }
    // Remplacement conditionnel : si une requete concurrente vient de le faire, on retombe sur le cas simultane.
    const r = await this.sessions.update({ id: s.id, remplaceeLe: IsNull() }, { remplaceeLe: new Date(maintenant).toISOString() });
    if (r.affected === 0) return { token: this.sign(u), refreshToken: null, expiresIn: DUREE_ACCES_S };
    return this.emettre(u, s.famille);
  }

  private async revoquerFamille(famille: string): Promise<void> {
    await this.sessions.update({ famille, revoqueeLe: IsNull() }, { revoqueeLe: maintenantIso() });
  }

  /** Deconnexion : la session de ce jeton (et toute sa famille) est revoquee. Sans effet sur un jeton inconnu. */
  async fermerSession(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const s = await this.sessions.findOne({ where: { empreinte: empreinteJeton(refreshToken) } });
    if (s) await this.revoquerFamille(s.famille);
  }

  /** Deconnexion de tous les appareils : sessions revoquees et jetons d'acces deja emis invalides. */
  async fermerToutesSessions(utilisateurId: string): Promise<void> {
    await this.repo.increment({ id: utilisateurId }, "versionJeton", 1);
    await revoquerSessions(this.sessions, utilisateurId);
    const u = await this.repo.findOne({ where: { id: utilisateurId } });
    await this.journal.noter("session.deconnexion_partout", { acteur: u ?? { id: utilisateurId } });
  }

  /**
   * Change le mot de passe (politique appliquee) ; toutes les sessions du compte sont fermees, une nouvelle est ouverte
   * pour l'appareil qui a fait le changement.
   */
  async changerMotDePasse(utilisateurId: string, ancien: string, nouveau: string): Promise<{ u: Utilisateur; jetons: JetonsSession }> {
    const u = await this.repo.findOne({ where: { id: utilisateurId } });
    if (!u) throw new UnauthorizedException("Compte inconnu ou supprime");
    if (!(await bcrypt.compare(ancien ?? "", u.passwordHash))) throw new UnauthorizedException("Ancien mot de passe invalide");
    const defauts = defautsMotDePasse(nouveau, u);
    if (nouveau === ancien) defauts.push("different de l'ancien");
    if (defauts.length) throw new BadRequestException({ statusCode: 400, code: "MOT_DE_PASSE_FAIBLE", message: messageRefus(defauts) });
    u.passwordHash = await AuthService.hash(nouveau);
    u.mustChangePassword = false;
    u.versionJeton = (u.versionJeton ?? 0) + 1;
    await this.repo.save(u);
    await revoquerSessions(this.sessions, u.id);
    await this.journal.noter("compte.mot_de_passe_change", { acteur: u, cible: `utilisateur:${u.id}`, cibleClubId: u.clubId });
    return { u, jetons: await this.ouvrirSession(u) };
  }

  /** Enregistre l'acceptation des conditions d'utilisation (version courante). */
  async accepterCgu(utilisateurId: string, version: string): Promise<Utilisateur> {
    const u = await this.repo.findOne({ where: { id: utilisateurId } });
    if (!u) throw new UnauthorizedException("Compte inconnu ou supprime");
    u.cguVersion = version;
    u.cguAccepteesLe = maintenantIso();
    const saved = await this.repo.save(u);
    await this.journal.noter("compte.cgu_acceptees", { acteur: u, details: { version } });
    return saved;
  }

  static async hash(password: string): Promise<string> {
    return bcrypt.hash(password, COUT_BCRYPT);
  }

  /** Sessions expirees, ou revoquees depuis plus d'un jour : plus rien a verifier, on les supprime. */
  async purgerSessions(maintenant = new Date()): Promise<number> {
    const hier = new Date(maintenant.getTime() - 86_400_000).toISOString();
    const expirees = await this.sessions.delete({ expireLe: LessThan(maintenant.toISOString()) });
    const revoquees = await this.sessions.delete({ revoqueeLe: LessThan(hier) });
    return (expirees.affected ?? 0) + (revoquees.affected ?? 0);
  }

  /**
   * Base vide : cree le compte administrateur initial (login AADMIN), a mot de passe a usage unique. Le mot de passe
   * vient de ADMIN_INITIAL_PASSWORD s'il est defini (jamais ecrit dans les journaux) ; sinon il est tire au hasard et
   * affiche une seule fois, faute d'autre canal sur une installation neuve.
   */
  async bootstrapAdmin(): Promise<void> {
    const count = await this.repo.count();
    if (count > 0) return;
    const fourni = process.env.ADMIN_INITIAL_PASSWORD?.trim();
    const motDePasse = fourni || motDePasseTemporaire();
    const u = this.repo.create({
      login: "AADMIN",
      prenom: "Admin",
      nom: "Admin",
      passwordHash: await AuthService.hash(motDePasse),
      mustChangePassword: true,
      role: "admin",
      derniereActivite: maintenantIso(),
    });
    await this.repo.save(u);
    if (fourni) {
      this.log.log("Compte administrateur initial cree (login AADMIN, mot de passe de ADMIN_INITIAL_PASSWORD, a changer a la premiere connexion)");
    } else {
      this.log.warn(
        `Compte administrateur initial cree : login AADMIN, mot de passe a usage unique ${motDePasse} ` +
        "(a changer a la premiere connexion ; definir ADMIN_INITIAL_PASSWORD pour ne pas l'afficher ici)",
      );
    }
  }
}
