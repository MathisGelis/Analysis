// src/features/auth/entretien-comptes.service.ts
//
// Entretien quotidien des comptes (une minute apres le demarrage, puis toutes les 24 h) :
//   - desactive les comptes educateur et referent sans connexion depuis INACTIVITE_MOIS mois (12 par defaut) ; un
//     gestionnaire (admin, ou referent pour ses educateurs) peut les reactiver. Les administrateurs ne sont jamais
//     desactives automatiquement : ce sont eux qui reactivent ;
//   - supprime les sessions expirees ou revoquees, et les traces d'audit de plus de 12 mois (AUDIT_RETENTION_MOIS).
// ENTRETIEN_AUTO=false coupe la planification (tests) ; `entretenir()` reste appelable a la main.
// Le journal ne contient que des nombres, aucune donnee personnelle.

import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Repository } from "typeorm";

import { Utilisateur } from "@/features/utilisateurs/utilisateur.entity";
import { JournalAuditService } from "@/features/audit/journal-audit.service";

import { AuthService, revoquerSessions } from "./auth.service";
import { Session } from "./session.entity";

export const INACTIVITE_MOIS = Math.max(1, Number(process.env.INACTIVITE_MOIS) || 12);
const JOUR_MS = 86_400_000;

/** Date limite : un compte sans activite depuis avant cette date est inactif. */
export function limiteInactivite(maintenant: Date, mois = INACTIVITE_MOIS): string {
  const d = new Date(maintenant.getTime());
  d.setUTCMonth(d.getUTCMonth() - mois);
  return d.toISOString();
}

/** Derniere activite connue : derniere connexion ou reactivation, sinon la creation du compte. */
export function derniereActiviteDe(u: Pick<Utilisateur, "derniereActivite" | "createdAt">): string {
  if (u.derniereActivite) return u.derniereActivite;
  const cree = u.createdAt instanceof Date ? u.createdAt : new Date(u.createdAt as unknown as string);
  return Number.isNaN(cree.getTime()) ? new Date(0).toISOString() : cree.toISOString();
}

@Injectable()
export class EntretienComptesService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(EntretienComptesService.name);
  private premier?: NodeJS.Timeout;
  private quotidien?: NodeJS.Timeout;

  constructor(
    @InjectRepository(Utilisateur) private users: Repository<Utilisateur>,
    @InjectRepository(Session) private sessions: Repository<Session>,
    private auth: AuthService,
    private journal: JournalAuditService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.ENTRETIEN_AUTO === "false") return;
    const lancer = () => { this.entretenir().catch((e) => this.log.error(`Entretien des comptes : ${(e as Error).message}`)); };
    this.premier = setTimeout(lancer, 60_000);
    this.premier.unref();
    this.quotidien = setInterval(lancer, JOUR_MS);
    this.quotidien.unref();
  }

  onModuleDestroy() {
    if (this.premier) clearTimeout(this.premier);
    if (this.quotidien) clearInterval(this.quotidien);
  }

  async entretenir(maintenant = new Date()): Promise<{ desactives: number; sessionsPurgees: number; tracesPurgees: number }> {
    const desactives = await this.desactiverInactifs(maintenant);
    const sessionsPurgees = await this.auth.purgerSessions(maintenant);
    const tracesPurgees = await this.journal.purger(maintenant);
    if (desactives || sessionsPurgees || tracesPurgees) {
      this.log.log(
        `Entretien des comptes : ${desactives} compte(s) desactive(s) pour inactivite, ${sessionsPurgees} session(s) ` +
        `et ${tracesPurgees} trace(s) d'audit purgee(s)`,
      );
    }
    return { desactives, sessionsPurgees, tracesPurgees };
  }

  /** Desactive les educateurs et referents inactifs ; renvoie leur nombre. */
  async desactiverInactifs(maintenant = new Date()): Promise<number> {
    const limite = limiteInactivite(maintenant);
    const actifs = await this.users.find({ where: { desactiveLe: IsNull(), role: In(["user", "referent"]) } });
    const inactifs = actifs.filter((u) => derniereActiviteDe(u) < limite);
    for (const u of inactifs) {
      await this.users.update(u.id, { desactiveLe: maintenant.toISOString(), versionJeton: (u.versionJeton ?? 0) + 1 });
      await revoquerSessions(this.sessions, u.id);
      await this.journal.noter("compte.desactivation_inactivite", {
        cible: `utilisateur:${u.id}`, cibleClubId: u.clubId, details: { derniereActivite: derniereActiviteDe(u) },
      }, maintenant);
    }
    return inactifs.length;
  }
}
