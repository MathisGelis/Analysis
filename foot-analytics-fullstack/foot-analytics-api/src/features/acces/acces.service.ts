// src/features/acces/acces.service.ts
//
// Applique la politique d'acces (features/acces/contexte-acces.ts) a chaque requete. Le perimetre du compte (role, club, equipes
// attribuees, saisons ouvertes) est lu EN BASE a chaque appel, jamais dans le jeton : une restriction posee par un
// gestionnaire joue immediatement, et un compte supprime perd l'acces avant l'expiration de son jeton.
//
//   - AccesGuard (global, apres JwtAuthGuard) pose `req.acces` ;
//   - `@Acces()` le donne aux controleurs ;
//   - AccesService : les verifications reutilisables ("cette equipe est-elle a moi ?", "ce match est-il consultable ?").
//
// Une ressource d'une saison fermee est "introuvable" (404, on ne revele pas qu'elle existe) ; une ressource ouverte mais
// hors du club ou des equipes du compte est interdite (403).

import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { Equipe } from "@/features/equipes/equipe.entity";
import { Joueur } from "@/features/joueurs/joueur.entity";
import { Match } from "@/features/matchs/match.entity";
import { Saison } from "@/features/saisons/saison.entity";
import { Utilisateur } from "@/features/utilisateurs/utilisateur.entity";

import { ContexteAcces } from "./contexte-acces";

@Injectable()
export class AccesService {
  constructor(
    @InjectRepository(Utilisateur) private users: Repository<Utilisateur>,
    @InjectRepository(Equipe) private equipes: Repository<Equipe>,
    @InjectRepository(Saison) private saisons: Repository<Saison>,
    @InjectRepository(Match) private matchs: Repository<Match>,
    @InjectRepository(Joueur) private joueurs: Repository<Joueur>,
  ) {}

  /** Le perimetre du compte, d'apres la base. */
  async contexte(userId: string): Promise<ContexteAcces> {
    const u = await this.users.findOne({ where: { id: userId } });
    if (!u) throw new UnauthorizedException("Compte inconnu ou supprime");
    const equipeIds = u.equipeIds ?? [];
    const restreint = u.role === "user" && u.toutesSaisons === false;
    const [attribuees, saisons] = await Promise.all([
      u.role === "user" && equipeIds.length > 0 ? this.equipes.find({ where: { id: In(equipeIds) } }) : Promise.resolve([] as Equipe[]),
      restreint ? this.saisons.find() : Promise.resolve([] as Saison[]),
    ]);
    return new ContexteAcces({
      id: u.id, role: u.role, clubId: u.clubId ?? null, equipeIds,
      toutesSaisons: u.toutesSaisons !== false, saisonIds: u.saisonIds ?? [],
    }, attribuees, saisons);
  }

  exigerAdmin(ctx: ContexteAcces): void {
    if (!ctx.admin) throw new ForbiddenException("Operation reservee aux administrateurs.");
  }

  /** Le club est celui du compte (ou le compte est admin). */
  exigerClub(ctx: ContexteAcces, clubId: string | null | undefined, message = "Cette ressource n'est pas de ton club."): void {
    if (!ctx.gereClub(clubId)) throw new ForbiddenException(message);
  }

  /** Une equipe consultable : saison ouverte et, dans mon club, attribuee. Sinon 404. */
  async equipe(ctx: ContexteAcces, id: string): Promise<Equipe> {
    const e = await this.equipes.findOne({ where: { id } });
    if (!e || !ctx.voitEquipe(e)) throw new NotFoundException(`Equipe ${id} introuvable`);
    return e;
  }

  /** Une equipe que le compte gere (privee a son club) : 404 si absente ou de saison fermee, 403 si elle n'est pas a lui. */
  async equipeGeree(ctx: ContexteAcces, id: string): Promise<Equipe> {
    const e = await this.equipes.findOne({ where: { id } });
    if (!e || !ctx.voitSaison(e.saisonId)) throw new NotFoundException(`Equipe ${id} introuvable`);
    if (!ctx.gereEquipe(e)) throw new ForbiddenException("Cette equipe n'est pas dans ton perimetre.");
    return e;
  }

  /**
   * La portee (equipe, saison) d'une analyse ou d'un bilan : l'equipe doit etre consultable, la saison ouverte (404 sinon).
   * Sans precision, un compte aux saisons restreintes obtient la saison actuelle plutot que toutes les saisons melangees.
   */
  async portee(
    ctx: ContexteAcces, demande: { equipeId?: string | null; saisonId?: string | null },
  ): Promise<{ equipeId?: string; saisonId?: string }> {
    const equipeId = demande.equipeId || undefined;
    let saisonId = demande.saisonId || undefined;
    if (equipeId) await this.equipe(ctx, equipeId);
    if (saisonId && !ctx.voitSaison(saisonId)) throw new NotFoundException(`Saison ${saisonId} introuvable`);
    if (!saisonId && !equipeId && ctx.saisonActuelleId) saisonId = ctx.saisonActuelleId;
    return { equipeId, saisonId };
  }

  /** Un match d'une saison ouverte (404 sinon). */
  async match(ctx: ContexteAcces, id: string): Promise<Match> {
    const m = await this.matchs.findOne({ where: { id } });
    if (!m || !ctx.voitSaison(m.saisonId)) throw new NotFoundException(`Match ${id} introuvable`);
    return m;
  }

  /**
   * Un match que le compte peut modifier : l'un des deux clubs est le sien et, cote equipe, celle qui lui est attribuee.
   * 404 si la saison est fermee, 403 sinon.
   */
  async matchGere(ctx: ContexteAcces, id: string): Promise<Match> {
    const m = await this.match(ctx, id);
    if (ctx.admin) return m;
    const mienDom = ctx.gereClub(m.clubDom);
    const mienExt = ctx.gereClub(m.clubExt);
    if (!mienDom && !mienExt) throw new ForbiddenException("Ce match ne concerne pas ton club.");
    await this.exigerEquipesDuMatch(ctx, m);
    return m;
  }

  /** Les equipes citees par ces matchs, par identifiant (une seule requete). */
  private async equipesDesMatchs(matchs: Pick<Match, "equipeDomId" | "equipeExtId">[]): Promise<Map<string, Equipe>> {
    const ids = [...new Set(matchs.flatMap((m) => [m.equipeDomId, m.equipeExtId]).filter((x): x is string => !!x))];
    return new Map((ids.length ? await this.equipes.find({ where: { id: In(ids) } }) : []).map((e) => [e.id, e]));
  }

  /**
   * Le meme verdict que `matchGere`, en booleen : le front sait ainsi s'il faut proposer de modifier ou de supprimer
   * le match, au lieu de laisser cliquer sur un bouton que l'API refusera.
   */
  async peutModifierMatch(ctx: ContexteAcces, m: Match): Promise<boolean> {
    if (ctx.admin) return true;
    return ctx.peutModifierMatch(m, await this.equipesDesMatchs([m]));
  }

  /** Les identifiants des matchs que le compte peut modifier, pour une liste entiere (une seule requete d'equipes). */
  async matchsModifiables(ctx: ContexteAcces, matchs: Match[]): Promise<Set<string>> {
    if (ctx.admin) return new Set(matchs.map((m) => m.id));
    const equipes = await this.equipesDesMatchs(matchs);
    return new Set(matchs.filter((m) => ctx.peutModifierMatch(m, equipes)).map((m) => m.id));
  }

  /** Les equipes de MON cote d'un match doivent etre de mon perimetre : 403 sinon. */
  async exigerEquipesDuMatch(
    ctx: ContexteAcces,
    m: Pick<Match, "equipeDomId" | "equipeExtId" | "clubDom" | "clubExt">,
  ): Promise<void> {
    if (!ctx.equipesDuMatchGerees(m, await this.equipesDesMatchs([m]))) {
      throw new ForbiddenException("Cette equipe n'est pas dans ton perimetre : ce match concerne une equipe de ton club qui ne t'est pas attribuee.");
    }
  }

  /** Un joueur de mon club (404 s'il n'existe pas, 403 sinon). */
  async joueurDuClub(ctx: ContexteAcces, id: string): Promise<Joueur> {
    const j = await this.joueurs.findOne({ where: { id } });
    if (!j) throw new NotFoundException(`Joueur ${id} introuvable`);
    this.exigerClub(ctx, j.clubId, "Ce joueur n'est pas de ton club.");
    return j;
  }

  /** Ids des joueurs de mon club (null pour un admin : tous). La portee des donnees privees d'un joueur (blessures...). */
  async idsJoueursDuClub(ctx: ContexteAcces): Promise<Set<string> | null> {
    if (ctx.admin) return null;
    if (!ctx.clubId) return new Set();
    return new Set((await this.joueurs.find({ where: { clubId: ctx.clubId }, select: { id: true } })).map((j) => j.id));
  }

  /** Ids des equipes de mon club que je gere (saisons ouvertes) : la portee des donnees privees (seances...). */
  async equipesGerees(ctx: ContexteAcces): Promise<Equipe[]> {
    if (ctx.admin) return this.equipes.find();
    if (!ctx.clubId) return [];
    return (await this.equipes.find({ where: { clubId: ctx.clubId } })).filter((e) => ctx.gereEquipe(e));
  }
}
