// src/features/direct/direct.service.ts
//
// Le direct d'un match de MON equipe : chrono, evenements, score. Tout passe par `matchGere` (le match doit etre celui de mon
// club, d'une saison ouverte, et d'une equipe qui m'est attribuee). La feuille de match officielle (FMI) fait foi pour le
// score, les buteurs et les cartons une fois importee : le direct ne la modifie jamais, il complete (minutes precises, zones).

import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";

import { ContexteAcces } from "@/features/acces/contexte-acces";
import { AccesService } from "@/features/acces/acces.service";
import { JournalAuditService } from "@/features/audit/journal-audit.service";
import { Club } from "@/features/clubs/club.entity";
import { Equipe } from "@/features/equipes/equipe.entity";
import { Joueur } from "@/features/joueurs/joueur.entity";
import { JoueursService } from "@/features/joueurs/joueurs.service";
import { Match } from "@/features/matchs/match.entity";
import { Tactique } from "@/features/tactiques/tactique.entity";

import {
  ActionChrono, appliquerChrono, EtatChrono, etatInitial, libelleMinute, minuteDe, TransitionChronoInvalide,
} from "./chrono";
import { ActionChronoDto, EvenementDirectDto } from "./direct.dto";
import { Direct } from "./direct.entity";
import { EvenementDirect } from "./evenement-direct.entity";
import { compteurs, scoreDirect } from "./stats-direct";
import { RESULTATS_PAR_TYPE } from "./types";

/** Qui agit quand ce n'est pas un compte : un saisisseur invite par lien (voir invitations.service.ts). */
export interface Origine { auteurId: string; invite: string }

export const etatDe = (d: Direct): EtatChrono => ({
  statut: d.statut, periode: d.periode, accumuleMs: d.accumuleMs, demarreLe: d.demarreLe, dureePeriodeMin: d.dureePeriodeMin,
});

/** De quel cote est MON equipe ? Mon club seul des deux, sinon le cote qui a une equipe ; l'administrateur voit les deux : domicile. */
export function monCote(ctx: Pick<ContexteAcces, "gereClub"> & { compte?: { clubId: string | null } }, m: Pick<Match, "clubDom" | "clubExt">): "dom" | "ext" {
  // Le club du compte d'abord : un administrateur gere les deux clubs, il ne doit pas tomber sur l'adversaire.
  const mien = ctx.compte?.clubId;
  if (mien && mien !== m.clubDom && mien === m.clubExt) return "ext";
  if (mien && mien === m.clubDom && mien !== m.clubExt) return "dom";
  const dom = ctx.gereClub(m.clubDom), ext = ctx.gereClub(m.clubExt);
  return ext && !dom ? "ext" : "dom";
}

@Injectable()
export class DirectService {
  constructor(
    @InjectRepository(Direct) private directs: Repository<Direct>,
    @InjectRepository(EvenementDirect) private evenements: Repository<EvenementDirect>,
    @InjectRepository(Club) private clubs: Repository<Club>,
    @InjectRepository(Tactique) private plans: Repository<Tactique>,
    @InjectRepository(Joueur) private joueurs: Repository<Joueur>,
    @InjectRepository(Equipe) private equipes: Repository<Equipe>,
    private effectifs: JoueursService,
    private acces: AccesService,
    private journal: JournalAuditService,
  ) {}

  private async direct(matchId: string): Promise<Direct> {
    return (await this.directs.findOne({ where: { matchId } })) ?? this.directs.save(this.directs.create({ matchId, ...etatInitial() }));
  }

  /** Tout ce qu'il faut a l'ecran du direct, en une lecture. */
  async etat(ctx: ContexteAcces, matchId: string, maintenant = Date.now()) {
    const m = await this.acces.matchGere(ctx, matchId);
    const d = await this.direct(matchId);
    const evs = await this.evenements.find({ where: { matchId, supprimeLe: IsNull() }, order: { creeLe: "ASC" } });
    const { cote: nousCote, equipeId } = await this.nous(ctx, m);
    const [dom, ext] = await Promise.all([this.clubs.findOne({ where: { id: m.clubDom } }), this.clubs.findOne({ where: { id: m.clubExt } })]);
    const etat = etatDe(d);
    return {
      match: {
        id: m.id, clubDom: m.clubDom, clubExt: m.clubExt, nomDom: dom?.nom ?? "Domicile", nomExt: ext?.nom ?? "Exterieur",
        equipeDomId: m.equipeDomId ?? null, equipeExtId: m.equipeExtId ?? null, date: m.date ?? null, heure: m.heure ?? null,
        journee: m.journee ?? null, competition: m.competition ?? null, numeroFmi: m.numeroFmi ?? null, statut: m.statut,
        saisonId: m.saisonId ?? null,
      },
      nousCote,
      /** L'equipe dont on saisit le match (celle du match, sinon, a defaut, celle de mon club qui a un effectif). */
      equipeNousId: equipeId,
      chrono: { ...etat, minute: minuteDe(etat, maintenant), clotureLe: d.clotureLe, serveurMs: maintenant },
      evenements: evs.map((e) => ({ ...e, minuteAffichee: libelleMinute(e.minute, e.periode, d.dureePeriodeMin) })),
      score: scoreDirect(evs),
      compteurs: compteurs(evs),
      joueurs: equipeId ? await this.joueursDe(equipeId, matchId) : [],
      /** L'avant-match de CE match est-il fait ? (le front renvoie vers l'avant-match tant que non). */
      avantMatch: { ...DirectService.avantMatchPret(await this.planDuMatch(equipeId, matchId)), possible: !!equipeId },
    };
  }

  /**
   * Notre cote et notre equipe pour ce match : la meme reponse partout (direct, apres-match, resume). L'avant-match enregistre pour ce match
   * fait foi (equipe et cote choisis) ; sinon le club du compte, puis l'equipe de ce club qui a un effectif.
   */
  async nous(ctx: ContexteAcces, m: Match): Promise<{ cote: "dom" | "ext"; equipeId: string | null }> {
    const choisie = await this.equipeDuPlan(ctx, m);
    const cote = choisie?.cote ?? monCote(ctx, m);
    return { cote, equipeId: choisie?.equipeId ?? (await this.equipeDeNous(ctx, m, cote)) };
  }

  /** L'equipe du plan de jeu enregistre pour ce match, si c'est une equipe que je gere et de l'un des deux clubs du match. */
  private async equipeDuPlan(ctx: ContexteAcces, m: Match): Promise<{ equipeId: string; cote: "dom" | "ext" } | null> {
    const trouvees = (await Promise.all((await this.plans.find({ where: { matchId: m.id } })).map((p) => this.equipes.findOne({ where: { id: p.equipeId } }))))
      .filter((e): e is Equipe => !!e && ctx.gereEquipe(e) && (e.clubId === m.clubDom || e.clubId === m.clubExt))
      .sort((a, b) => Number(b.clubId === ctx.compte.clubId) - Number(a.clubId === ctx.compte.clubId));    // mon club d'abord
    const e = trouvees[0];
    return e ? { equipeId: e.id, cote: e.clubId === m.clubDom ? "dom" : "ext" } : null;
  }

  /**
   * L'equipe dont on saisit le match. Celle du match quand elle a des joueurs ; sinon (match cree sans equipe, ou rattache a une equipe
   * d'une autre saison, sans effectif) une equipe de mon club, de meme categorie, qui en a un : l'avant-match ne dit plus "effectif vide"
   * quand la page Effectif montre des joueurs.
   */
  private async equipeDeNous(ctx: ContexteAcces, m: Match, cote: "dom" | "ext"): Promise<string | null> {
    const directe = (cote === "dom" ? m.equipeDomId : m.equipeExtId) ?? null;
    if (directe && (await this.effectifs.effectif(directe).catch(() => [])).some((j) => !!j.id)) return directe;
    const clubId = cote === "dom" ? m.clubDom : m.clubExt;
    const reference = directe ? await this.equipes.findOne({ where: { id: directe } }) : null;
    const candidates = (await this.equipes.find({ where: { clubId } }))
      .filter((e) => e.id !== directe && ctx.gereEquipe(e) && (!reference?.categorie || e.categorie === reference.categorie))
      .sort((a, b) => Number(b.saisonId === m.saisonId) - Number(a.saisonId === m.saisonId));
    for (const e of candidates) if ((await this.effectifs.effectif(e.id).catch(() => [])).some((j) => !!j.id)) return e.id;
    return directe;
  }

  /** Le plan de jeu enregistre POUR CE MATCH (jamais le plan courant de l'equipe) : l'avant-match fait. */
  private planDuMatch(equipeId: string | null, matchId: string) {
    return equipeId ? this.plans.findOne({ where: { equipeId, matchId } }) : Promise.resolve(null);
  }

  /** L'avant-match est fait quand le onze du match est enregistre : au moins 7 titulaires (le foot a 8 compris). */
  static avantMatchPret(plan: Tactique | null) {
    const titulaires = (plan?.titulaires ?? []).filter(Boolean).length;
    return { pret: !!plan && titulaires >= 7, titulaires, banc: plan?.remplacants?.length ?? 0 };
  }

  /**
   * Les joueurs que l'on peut saisir : ceux retenus a l'avant-match (titulaires puis remplacants, dans l'ordre du plan), avec le numero
   * choisi pour ce match, sinon leur numero habituel. Tant que l'avant-match n'est pas fait pour ce match, tout l'effectif (de quoi
   * saisir un ancien match sans composition) ; les titulaires du plan courant passent alors en tete.
   */
  async joueursDe(equipeId: string, matchId: string) {
    const [effectif, planMatch, planCourant] = await Promise.all([
      this.effectifs.effectif(equipeId),
      this.plans.findOne({ where: { equipeId, matchId } }),
      this.plans.findOne({ where: { equipeId, matchId: IsNull() } }),
    ]);
    const vus = effectif.filter((j) => !!j.id);
    const fiche = (j: any, role: "titulaire" | "remplacant" | "groupe", numero: number | null) => ({
      id: j.id as string, nom: j.nom as string, prenom: (j.prenom ?? null) as string | null, poste: (j.poste ?? null) as string | null, numero, role,
    });
    if (planMatch) {
      const titulaires = (planMatch.titulaires ?? []).filter(Boolean), remplacants = planMatch.remplacants ?? [];
      const parId = new Map(vus.map((j) => [j.id as string, j]));
      const numero = (j: any) => planMatch.numeros?.[j.id] ?? (j.numeroFavori ?? null);
      return [
        ...titulaires.map((id) => parId.get(id)).filter((j): j is any => !!j).map((j) => fiche(j, "titulaire", numero(j))),
        ...remplacants.map((id) => parId.get(id)).filter((j): j is any => !!j).map((j) => fiche(j, "remplacant", numero(j))),
      ];
    }
    const titulaires = new Set((planCourant?.titulaires ?? []).filter(Boolean));
    const remplacants = new Set(planCourant?.remplacants ?? []);
    const rang = { titulaire: 0, remplacant: 1, groupe: 2 } as const;
    return vus.map((j) => fiche(j, titulaires.has(j.id) ? "titulaire" : remplacants.has(j.id) ? "remplacant" : "groupe", j.numeroFavori ?? null))
      .sort((a, b) => rang[a.role] - rang[b.role]);
  }

  /** Une action sur le chrono : coup d'envoi, pause, mi-temps, reprise, fin, ou recalage sur une minute. */
  async chrono(ctx: ContexteAcces, matchId: string, dto: ActionChronoDto, maintenant = Date.now(), origine?: Origine) {
    const m = await this.acces.matchGere(ctx, matchId);
    const d = await this.direct(matchId);
    this.exigerOuvert(d);
    let suivant: EtatChrono;
    try { suivant = appliquerChrono(etatDe(d), dto.action as ActionChrono, maintenant, dto.minute); }
    catch (e) { if (e instanceof TransitionChronoInvalide) throw new ConflictException(e.message); throw e; }
    Object.assign(d, suivant);
    await this.directs.save(d);
    await this.noter(ctx, m, "direct.chrono", { action: dto.action, statut: suivant.statut, periode: suivant.periode }, maintenant, origine);
    return this.etat(ctx, matchId, maintenant);
  }

  /**
   * Creer ou remplacer l'evenement `id` (celui que l'appareil a fabrique). Rejouer la meme requete ne change rien ; un evenement
   * supprime qu'on renvoie est restaure. Un identifiant deja pris par un autre match est refuse.
   */
  async enregistrer(ctx: ContexteAcces, matchId: string, id: string, dto: EvenementDirectDto, maintenant = Date.now(), origine?: Origine) {
    const m = await this.acces.matchGere(ctx, matchId);
    this.exigerOuvert(await this.direct(matchId));
    this.valider(dto);
    const existant = await this.evenements.findOne({ where: { id } });
    if (existant && existant.matchId !== matchId) throw new ConflictException("Cet identifiant d'evenement appartient a un autre match.");
    const champs = {
      cote: dto.cote, type: dto.type, resultat: dto.resultat || null, periode: dto.periode, minute: dto.minute,
      joueurNumero: dto.joueurNumero ?? null, joueurNom: dto.joueurNom || null, joueurId: dto.joueurId || null,
      joueur2Numero: dto.joueur2Numero ?? null, joueur2Nom: dto.joueur2Nom || null, joueur2Id: dto.joueur2Id || null,
      zoneTier: dto.zoneTier ?? null, zoneCouloir: dto.zoneCouloir ?? null, zoneCadre: dto.zoneCadre ?? null,
      contextes: [...new Set((dto.contextes ?? []).map((c) => c.trim()).filter(Boolean))], supprimeLe: null,
    };
    const e = await this.evenements.save(this.evenements.create({ ...(existant ?? { id, matchId, auteurId: origine?.auteurId ?? ctx.compte.id }), ...champs }));
    const carton = (x?: EvenementDirect | null) => x?.type === "carton_jaune" || x?.type === "carton_rouge";
    if (carton(e) || carton(existant)) await this.synchroniserCartons(matchId, carton(existant) ? existant! : null, e);
    // Un ajout porte deja son auteur et sa date ; le journal garde ce qui change apres coup (et reste ainsi lisible).
    if (existant) await this.noter(ctx, m, "direct.evenement_modifie", { evenement: id, type: dto.type }, maintenant, origine);
    return e;
  }

  /**
   * Deux cartons jaunes au meme joueur font un rouge : le second jaune entraine tout de suite un carton rouge (« -2j » derriere
   * l'identifiant du jaune), aux memes minute, periode et joueur. Annuler ou deplacer un jaune retire ou recale ce rouge. Un joueur
   * deja expulse a la main n'est pas expulse deux fois.
   */
  private async synchroniserCartons(matchId: string, avant: EvenementDirect | null, apres: EvenementDirect | null) {
    const meme = (a: EvenementDirect, b: EvenementDirect) =>
      a.cote === b.cote && ((!!a.joueurId && a.joueurId === b.joueurId) || (!a.joueurId && !b.joueurId && a.joueurNumero != null && a.joueurNumero === b.joueurNumero));
    const concernes = [avant, apres].filter((x): x is EvenementDirect => !!x && (!!x.joueurId || x.joueurNumero != null));
    const tous = await this.evenements.find({ where: { matchId }, order: { minute: "ASC", creeLe: "ASC" } });
    for (const ref of concernes) {
      const joueur = tous.filter((x) => meme(x, ref));
      const jaunes = joueur.filter((x) => x.type === "carton_jaune" && !x.supprimeLe).sort((a, b) => a.minute - b.minute || a.creeLe.getTime() - b.creeLe.getTime());
      const rougesAuto = joueur.filter((x) => x.type === "carton_rouge" && x.id.endsWith("-2j"));
      const expulseALaMain = joueur.some((x) => x.type === "carton_rouge" && !x.supprimeLe && !x.id.endsWith("-2j"));
      const second = jaunes.length >= 2 && !expulseALaMain ? jaunes[1] : null;
      for (const r of rougesAuto) {
        if (second && r.id === `${second.id}-2j`) {
          Object.assign(r, { cote: second.cote, periode: second.periode, minute: second.minute, joueurId: second.joueurId, joueurNom: second.joueurNom, joueurNumero: second.joueurNumero, supprimeLe: null });
          await this.evenements.save(r);
        } else if (!r.supprimeLe) {
          r.supprimeLe = new Date().toISOString();
          await this.evenements.save(r);
        }
      }
      if (second && !rougesAuto.some((r) => r.id === `${second.id}-2j`)) {
        await this.evenements.save(this.evenements.create({
          id: `${second.id}-2j`, matchId, cote: second.cote, type: "carton_rouge", resultat: null, periode: second.periode, minute: second.minute,
          joueurNumero: second.joueurNumero, joueurNom: second.joueurNom, joueurId: second.joueurId,
          joueur2Numero: null, joueur2Nom: null, joueur2Id: null, zoneTier: null, zoneCouloir: null, zoneCadre: null, contextes: [], auteurId: second.auteurId, supprimeLe: null,
        }));
      }
    }
  }

  /** Annuler un evenement : il ne compte plus, mais la trace reste (et il peut revenir en renvoyant la meme saisie). */
  async supprimer(ctx: ContexteAcces, matchId: string, id: string, maintenant = Date.now(), origine?: Origine) {
    const m = await this.acces.matchGere(ctx, matchId);
    this.exigerOuvert(await this.direct(matchId));
    const e = await this.evenements.findOne({ where: { id, matchId } });
    if (!e) throw new NotFoundException("Evenement introuvable.");
    if (!e.supprimeLe) {
      e.supprimeLe = new Date(maintenant).toISOString();
      await this.evenements.save(e);
      if ((e.type === "carton_jaune" || e.type === "carton_rouge") && !e.id.endsWith("-2j")) await this.synchroniserCartons(matchId, e, null);   // le rouge automatique s'annule a la main
      await this.noter(ctx, m, "direct.evenement_supprime", { evenement: id, type: e.type }, maintenant, origine);
    }
  }

  /** Cloturer le match (apres le coup de sifflet final) : plus de saisie tant qu'on ne le rouvre pas. */
  async cloturer(ctx: ContexteAcces, matchId: string, maintenant = Date.now()) {
    const m = await this.acces.matchGere(ctx, matchId);
    const d = await this.direct(matchId);
    if (d.statut !== "termine") throw new ConflictException("Le match n'est pas termine : siffle la fin avant de le cloturer.");
    if (!d.clotureLe) {
      d.clotureLe = new Date(maintenant).toISOString();
      d.cloturePar = ctx.compte.id;
      await this.directs.save(d);
      await this.noter(ctx, m, "direct.cloture", {}, maintenant);
    }
    return this.etat(ctx, matchId, maintenant);
  }

  async rouvrir(ctx: ContexteAcces, matchId: string, maintenant = Date.now()) {
    const m = await this.acces.matchGere(ctx, matchId);
    const d = await this.direct(matchId);
    if (d.clotureLe) {
      d.clotureLe = null;
      d.cloturePar = null;
      await this.directs.save(d);
      await this.noter(ctx, m, "direct.reouverture", {}, maintenant);
    }
    return this.etat(ctx, matchId, maintenant);
  }

  private exigerOuvert(d: Direct) {
    if (d.clotureLe) throw new ConflictException("Le match est cloture : rouvre-le pour modifier le direct.");
  }

  /** Un resultat doit etre de la liste du type ; le cadre n'a de sens que pour un tir cadre ou un but. */
  private valider(dto: EvenementDirectDto) {
    const permis = RESULTATS_PAR_TYPE[dto.type as keyof typeof RESULTATS_PAR_TYPE];
    if (dto.resultat && !permis?.includes(dto.resultat)) throw new BadRequestException(`Resultat « ${dto.resultat} » impossible pour ${dto.type}.`);
    if (dto.zoneCadre !== undefined && dto.zoneCadre !== null && !["but", "cadre", "arrete"].includes(dto.resultat ?? "")) {
      throw new BadRequestException("La zone du cadre ne se precise que pour un but ou un tir cadre.");
    }
    if ((dto.zoneTier == null) !== (dto.zoneCouloir == null)) throw new BadRequestException("La zone se donne en entier : tiers et couloir.");
  }

  private noter(ctx: ContexteAcces, m: Match, action: string, details: Record<string, unknown>, maintenant: number, origine?: Origine) {
    return this.journal.noter(action, { acteur: ctx.compte, cible: `match:${m.id}`, cibleClubId: ctx.gereClub(m.clubDom) ? m.clubDom : m.clubExt, details: origine ? { ...details, invite: origine.invite } : details }, new Date(maintenant));
  }
}
