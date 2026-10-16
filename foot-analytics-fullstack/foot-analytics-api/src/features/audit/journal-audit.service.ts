// src/features/audit/journal-audit.service.ts
//
// Journal d'audit (voir journal-audit.entity.ts) : connexions, gestion des comptes, lectures et ecritures de donnees
// medicales, exports, consultations de fiches de joueurs d'autres clubs, imports de feuilles de match.
//
//   - `noter` n'echoue jamais (une trace manquee ne doit pas casser l'operation) et ne fait qu'ajouter des lignes ;
//   - `lister` sert la page d'administration ;
//   - `purger` supprime les traces de plus de AUDIT_RETENTION_MOIS mois (entretien quotidien). Sur Postgres, par la
//     fonction purger_journal_audit (SECURITY DEFINER) : un role applicatif restreint n'a pas le droit DELETE sur la
//     table (voir sql/role-application.sql) ;
//   - apres chaque trace surveillee, les regles d'alerte (alertes.ts) sont evaluees.

import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, FindOptionsWhere, IsNull, LessThan, Like, MoreThanOrEqual, Repository } from "typeorm";

import { debutFenetre, RegleAlerte, reglesPour } from "./alertes";
import { JournalAudit } from "./journal-audit.entity";

export const AUDIT_RETENTION_MOIS = Math.max(1, Number(process.env.AUDIT_RETENTION_MOIS) || 12);

/** Le compte a l'origine d'une action (ContexteAcces.compte, Utilisateur...). */
export interface ActeurAudit { id: string; role?: string | null; clubId?: string | null }

export interface TraceAudit {
  acteur?: ActeurAudit | null;
  cible?: string | null;
  cibleClubId?: string | null;
  details?: Record<string, unknown> | null;
  ip?: string | null;
}

export interface FiltreJournal {
  action?: string;
  utilisateurId?: string;
  depuis?: string;
  jusqua?: string;
  page?: number;
  parPage?: number;
}

@Injectable()
export class JournalAuditService {
  private readonly log = new Logger(JournalAuditService.name);

  constructor(@InjectRepository(JournalAudit) private repo: Repository<JournalAudit>) {}

  async noter(action: string, trace: TraceAudit = {}, maintenant = new Date()): Promise<void> {
    try {
      await this.repo.save(this.repo.create({
        le: maintenant.toISOString(), action,
        utilisateurId: trace.acteur?.id ?? null, role: trace.acteur?.role ?? null, clubId: trace.acteur?.clubId ?? null,
        cible: trace.cible ?? null, cibleClubId: trace.cibleClubId ?? null,
        details: trace.details ?? null, ip: trace.ip ?? null,
      }));
      for (const regle of reglesPour(action)) await this.evaluer(regle, trace.acteur?.id ?? null, maintenant);
    } catch (e) {
      this.log.error(`Trace d'audit non enregistree (${action}) : ${(e as Error).message}`);
    }
  }

  /** Seuil atteint dans la fenetre, et pas d'alerte du meme type deja levee dans cette fenetre : nouvelle alerte. */
  private async evaluer(regle: RegleAlerte, utilisateurId: string | null, maintenant: Date): Promise<void> {
    if (regle.parCompte && !utilisateurId) return;
    const debut = debutFenetre(regle, maintenant);
    const qui = regle.parCompte ? { utilisateurId: utilisateurId as string } : {};
    let n = 0;
    for (const action of regle.surveille) n += await this.repo.count({ where: { action, le: MoreThanOrEqual(debut), ...qui } });
    if (n < regle.seuil) return;
    const deja = await this.repo.count({ where: { action: regle.alerte, le: MoreThanOrEqual(debut), ...(regle.parCompte ? qui : { utilisateurId: IsNull() }) } });
    if (deja > 0) return;
    await this.repo.save(this.repo.create({
      le: maintenant.toISOString(), action: regle.alerte, utilisateurId: regle.parCompte ? utilisateurId : null,
      details: { nombre: n, fenetreMin: regle.fenetreMin, seuil: regle.seuil },
    }));
    // Journal du serveur : le type et les nombres, sans identifiant de compte (le detail est dans le journal d'audit).
    this.log.warn(`Alerte : ${regle.libelle} (${n} en ${regle.fenetreMin} min, seuil ${regle.seuil})`);
    await this.prevenir(regle, n, maintenant);
  }

  /** Webhook optionnel (ALERTE_WEBHOOK_URL) : type et nombres seulement. */
  private async prevenir(regle: RegleAlerte, n: number, maintenant: Date): Promise<void> {
    const url = process.env.ALERTE_WEBHOOK_URL;
    if (!url) return;
    try {
      await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `[Foot Analytics] Alerte : ${regle.libelle} (${n} en ${regle.fenetreMin} min). Voir Administration > Journal.`,
          alerte: regle.alerte, nombre: n, fenetreMin: regle.fenetreMin, le: maintenant.toISOString(),
        }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (e) {
      this.log.warn(`Webhook d'alerte injoignable : ${(e as Error).message}`);
    }
  }

  async lister(f: FiltreJournal): Promise<{ total: number; page: number; parPage: number; items: JournalAudit[] }> {
    const parPage = Math.min(Math.max(1, Math.floor(f.parPage ?? 50)), 100);
    const page = Math.max(1, Math.floor(f.page ?? 1));
    const where: FindOptionsWhere<JournalAudit> = {};
    if (f.action) where.action = f.action.endsWith("*") ? Like(`${f.action.slice(0, -1)}%`) : f.action;
    if (f.utilisateurId) where.utilisateurId = f.utilisateurId;
    if (f.depuis || f.jusqua) where.le = Between(f.depuis ?? "0000", f.jusqua ?? "9999");
    const [items, total] = await this.repo.findAndCount({ where, order: { le: "DESC" }, skip: (page - 1) * parPage, take: parPage });
    return { total, page, parPage, items };
  }

  /** Supprime les traces plus anciennes que la duree de conservation ; renvoie leur nombre. */
  async purger(maintenant = new Date(), mois = AUDIT_RETENTION_MOIS): Promise<number> {
    const limite = new Date(maintenant.getTime());
    limite.setUTCMonth(limite.getUTCMonth() - mois);
    const avant = limite.toISOString();
    if (this.repo.manager.connection.options.type === "postgres") {
      try {
        const [r] = await this.repo.query(`SELECT purger_journal_audit($1) AS n`, [avant]);
        return Number(r?.n ?? 0);
      } catch { /* fonction absente (base de test synchronisee sans migrations) : suppression directe */ }
    }
    return (await this.repo.delete({ le: LessThan(avant) })).affected ?? 0;
  }
}
