// src/features/direct/invitations.service.ts
//
// Inviter quelqu'un a saisir le direct d'un match, sans compte : lien a usage unique, session liee a l'appareil, perimetre d'un seul match.
//
//   creer      le staff cree l'invitation ; le lien (avec le jeton en clair) n'est montre QU'UNE fois, la base n'en garde que l'empreinte
//   ouvrir     le premier appareil qui ouvre le lien le consomme et recoit une session ; un second appareil trouve un lien deja utilise
//   authentifier  chaque requete d'un invite presente sa session ; l'invitation doit etre valide, non revoquee, et son auteur toujours actif
//   revoquer   le staff coupe l'acces tout de suite

import { createHash, randomBytes, randomUUID } from "node:crypto";

import { ConflictException, ForbiddenException, GoneException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";

import { AccesService } from "@/features/acces/acces.service";
import { ContexteAcces } from "@/features/acces/contexte-acces";
import { JournalAuditService } from "@/features/audit/journal-audit.service";
import { Utilisateur } from "@/features/utilisateurs/utilisateur.entity";

import { InvitationDirect } from "./invitation-direct.entity";

export const DUREE_DEFAUT_H = 12;
export const DUREE_MAX_H = 48;
export const MAX_ACTIVES_PAR_MATCH = 10;
const HEURE_MS = 3_600_000;

export const empreinte = (secret: string) => createHash("sha256").update(secret).digest("hex");
const nouveauSecret = () => randomBytes(32).toString("base64url");
/** Un jeton bien forme : 43 caracteres base64url (256 bits). Evite de chercher en base une valeur manifestement fausse. */
export const JETON_VALIDE = /^[A-Za-z0-9_-]{43}$/;

export interface InvitationVue {
  id: string; libelle: string; peutChrono: boolean; expireLe: string; ouvertLe: string | null; revoqueLe: string | null;
  derniereActiviteLe: string | null; creeLe: Date; etat: "en_attente" | "ouverte" | "expiree" | "revoquee";
}

const etatDe = (i: InvitationDirect, maintenant: number): InvitationVue["etat"] =>
  i.revoqueLe ? "revoquee" : Date.parse(i.expireLe) <= maintenant ? "expiree" : i.ouvertLe ? "ouverte" : "en_attente";
const vue = (i: InvitationDirect, maintenant: number): InvitationVue => ({
  id: i.id, libelle: i.libelle, peutChrono: i.peutChrono, expireLe: i.expireLe, ouvertLe: i.ouvertLe, revoqueLe: i.revoqueLe,
  derniereActiviteLe: i.derniereActiviteLe, creeLe: i.creeLe, etat: etatDe(i, maintenant),
});

@Injectable()
export class InvitationsService {
  constructor(
    @InjectRepository(InvitationDirect) private invitations: Repository<InvitationDirect>,
    @InjectRepository(Utilisateur) private users: Repository<Utilisateur>,
    private acces: AccesService,
    private journal: JournalAuditService,
  ) {}

  /** Cree une invitation pour mon match. Renvoie le jeton en clair : il ne sera plus jamais relisible. */
  async creer(ctx: ContexteAcces, matchId: string, dto: { libelle: string; peutChrono?: boolean; dureeHeures?: number }, maintenant = Date.now()) {
    const m = await this.acces.matchGere(ctx, matchId);
    const libelle = dto.libelle.trim().slice(0, 60);
    if (!libelle) throw new ConflictException("Donne un nom a la personne invitee.");
    const duree = Math.min(DUREE_MAX_H, Math.max(1, dto.dureeHeures ?? DUREE_DEFAUT_H));
    const actives = (await this.invitations.find({ where: { matchId, revoqueLe: IsNull() } })).filter((i) => Date.parse(i.expireLe) > maintenant);
    if (actives.length >= MAX_ACTIVES_PAR_MATCH) throw new ConflictException(`Déjà ${MAX_ACTIVES_PAR_MATCH} invitations actives sur ce match : révoque-en une avant d'en créer une autre.`);
    const jeton = nouveauSecret();
    const i = await this.invitations.save(this.invitations.create({
      id: randomUUID(), matchId, creePar: ctx.compte.id, libelle, peutChrono: !!dto.peutChrono, jetonEmpreinte: empreinte(jeton),
      sessionEmpreinte: null, expireLe: new Date(maintenant + duree * HEURE_MS).toISOString(), ouvertLe: null, revoqueLe: null, derniereActiviteLe: null,
    }));
    await this.journal.noter("direct.invitation_creee", { acteur: ctx.compte, cible: `match:${m.id}`, cibleClubId: ctx.gereClub(m.clubDom) ? m.clubDom : m.clubExt, details: { invite: libelle, chrono: !!dto.peutChrono, heures: duree } }, new Date(maintenant));
    return { invitation: vue(i, maintenant), jeton };
  }

  async lister(ctx: ContexteAcces, matchId: string, maintenant = Date.now()): Promise<InvitationVue[]> {
    await this.acces.matchGere(ctx, matchId);
    return (await this.invitations.find({ where: { matchId }, order: { creeLe: "DESC" } })).map((i) => vue(i, maintenant));
  }

  async revoquer(ctx: ContexteAcces, matchId: string, id: string, maintenant = Date.now()) {
    const m = await this.acces.matchGere(ctx, matchId);
    const i = await this.invitations.findOne({ where: { id, matchId } });
    if (!i) throw new NotFoundException("Invitation introuvable.");
    if (!i.revoqueLe) {
      i.revoqueLe = new Date(maintenant).toISOString();
      await this.invitations.save(i);
      await this.journal.noter("direct.invitation_revoquee", { acteur: ctx.compte, cible: `match:${m.id}`, cibleClubId: ctx.gereClub(m.clubDom) ? m.clubDom : m.clubExt, details: { invite: i.libelle } }, new Date(maintenant));
    }
    return vue(i, maintenant);
  }

  /**
   * Ouvre le lien : le premier appareil le consomme (une seule fois, meme en cas de requetes simultanees) et recoit sa session.
   * Un lien invalide, expire ou revoque donne toujours la meme reponse : on ne dit pas ce qui existe.
   */
  async ouvrir(jeton: string, maintenant = Date.now()) {
    const invalide = () => new NotFoundException("Ce lien n'est pas valide ou a expiré. Demande-en un nouveau.");
    if (!JETON_VALIDE.test(jeton ?? "")) throw invalide();
    const i = await this.invitations.findOne({ where: { jetonEmpreinte: empreinte(jeton) } });
    if (!i || i.revoqueLe || Date.parse(i.expireLe) <= maintenant) throw invalide();
    if (i.ouvertLe) throw new GoneException("Ce lien a déjà été utilisé sur un appareil. Demande-en un nouveau.");
    const session = nouveauSecret();
    // La consommation est atomique : seule la requete qui trouve `ouvertLe` vide gagne.
    const r = await this.invitations.createQueryBuilder().update(InvitationDirect)
      .set({ ouvertLe: new Date(maintenant).toISOString(), sessionEmpreinte: empreinte(session), derniereActiviteLe: new Date(maintenant).toISOString() })
      .where("id = :id AND ouvertLe IS NULL AND revoqueLe IS NULL", { id: i.id }).execute();
    if (!r.affected) throw new GoneException("Ce lien a déjà été utilisé sur un appareil. Demande-en un nouveau.");
    const createur = await this.users.findOne({ where: { id: i.creePar } });
    await this.journal.noter("direct.invitation_ouverte", { acteur: createur ? { id: createur.id, role: createur.role, clubId: createur.clubId ?? null } as any : undefined, cible: `match:${i.matchId}`, cibleClubId: createur?.clubId ?? null, details: { invite: i.libelle } }, new Date(maintenant));
    return { session, expireLe: i.expireLe, libelle: i.libelle, matchId: i.matchId, peutChrono: i.peutChrono };
  }

  /** Identifie l'invite d'apres sa session, et rend le contexte de la personne qui l'a invitee (sans jamais depasser le match de l'invitation). */
  async authentifier(session: string, maintenant = Date.now()): Promise<{ invitation: InvitationDirect; ctx: ContexteAcces; origine: { auteurId: string; invite: string } }> {
    const refus = () => new UnauthorizedException("Invitation invalide, expirée ou révoquée.");
    if (!JETON_VALIDE.test(session ?? "")) throw refus();
    const i = await this.invitations.findOne({ where: { sessionEmpreinte: empreinte(session) } });
    if (!i || i.revoqueLe || Date.parse(i.expireLe) <= maintenant) throw refus();
    const createur = await this.users.findOne({ where: { id: i.creePar } });
    if (!createur || createur.desactiveLe) throw refus();         // le compte qui a invite n'existe plus ou est desactive : plus d'acces
    const ctx = await this.acces.contexteDe(createur);
    // Une trace d'activite, sans ecrire a chaque requete (une fois par minute au plus).
    if (!i.derniereActiviteLe || maintenant - Date.parse(i.derniereActiviteLe) > 60_000) {
      i.derniereActiviteLe = new Date(maintenant).toISOString();
      await this.invitations.update({ id: i.id }, { derniereActiviteLe: i.derniereActiviteLe });
    }
    return { invitation: i, ctx, origine: { auteurId: `invite:${i.id}`, invite: i.libelle } };
  }

  /** Le droit de toucher au chrono : accorde a l'invitation, jamais deduit. */
  exigerChrono(i: InvitationDirect) {
    if (!i.peutChrono) throw new ForbiddenException("Cette invitation ne permet pas de piloter le chrono.");
  }
}
