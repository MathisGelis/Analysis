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

export const etatDe = (d: Direct): EtatChrono => ({
  statut: d.statut, periode: d.periode, accumuleMs: d.accumuleMs, demarreLe: d.demarreLe, dureePeriodeMin: d.dureePeriodeMin,
});

/** De quel cote est MON equipe ? Mon club seul des deux, sinon le cote qui a une equipe ; l'administrateur voit les deux : domicile. */
export function monCote(ctx: Pick<ContexteAcces, "gereClub">, m: Pick<Match, "clubDom" | "clubExt">): "dom" | "ext" {
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
    const nousCote = monCote(ctx, m);
    const equipeId = nousCote === "dom" ? m.equipeDomId : m.equipeExtId;
    const [dom, ext] = await Promise.all([this.clubs.findOne({ where: { id: m.clubDom } }), this.clubs.findOne({ where: { id: m.clubExt } })]);
    const etat = etatDe(d);
    return {
      match: {
        id: m.id, clubDom: m.clubDom, clubExt: m.clubExt, nomDom: dom?.nom ?? "Domicile", nomExt: ext?.nom ?? "Exterieur",
        equipeDomId: m.equipeDomId ?? null, equipeExtId: m.equipeExtId ?? null, date: m.date ?? null, heure: m.heure ?? null,
        journee: m.journee ?? null, competition: m.competition ?? null, numeroFmi: m.numeroFmi ?? null, statut: m.statut,
      },
      nousCote,
      chrono: { ...etat, minute: minuteDe(etat, maintenant), clotureLe: d.clotureLe, serveurMs: maintenant },
      evenements: evs.map((e) => ({ ...e, minuteAffichee: libelleMinute(e.minute, e.periode, d.dureePeriodeMin) })),
      score: scoreDirect(evs),
      compteurs: compteurs(evs),
      joueurs: equipeId ? await this.joueursDe(equipeId, matchId) : [],
    };
  }

  /** L'effectif de mon equipe, les titulaires du plan de jeu (celui du match, sinon le plan courant) en tete. */
  async joueursDe(equipeId: string, matchId: string) {
    const [effectif, planMatch, planCourant] = await Promise.all([
      this.effectifs.effectif(equipeId),
      this.plans.findOne({ where: { equipeId, matchId } }),
      this.plans.findOne({ where: { equipeId, matchId: IsNull() } }),
    ]);
    const plan = planMatch ?? planCourant;
    const titulaires = new Set((plan?.titulaires ?? []).filter(Boolean));
    const remplacants = new Set(plan?.remplacants ?? []);
    return effectif
      .filter((j) => !!j.id)
      .map((j) => ({
        id: j.id as string, nom: j.nom as string, prenom: (j.prenom ?? null) as string | null, poste: (j.poste ?? null) as string | null,
        numero: (j.numeroFavori ?? null) as number | null,
        role: titulaires.has(j.id) ? "titulaire" : remplacants.has(j.id) ? "remplacant" : "groupe",
      }));
  }

  /** Une action sur le chrono : coup d'envoi, pause, mi-temps, reprise, fin, ou recalage sur une minute. */
  async chrono(ctx: ContexteAcces, matchId: string, dto: ActionChronoDto, maintenant = Date.now()) {
    const m = await this.acces.matchGere(ctx, matchId);
    const d = await this.direct(matchId);
    this.exigerOuvert(d);
    let suivant: EtatChrono;
    try { suivant = appliquerChrono(etatDe(d), dto.action as ActionChrono, maintenant, dto.minute); }
    catch (e) { if (e instanceof TransitionChronoInvalide) throw new ConflictException(e.message); throw e; }
    Object.assign(d, suivant);
    await this.directs.save(d);
    await this.noter(ctx, m, "direct.chrono", { action: dto.action, statut: suivant.statut, periode: suivant.periode }, maintenant);
    return this.etat(ctx, matchId, maintenant);
  }

  /**
   * Creer ou remplacer l'evenement `id` (celui que l'appareil a fabrique). Rejouer la meme requete ne change rien ; un evenement
   * supprime qu'on renvoie est restaure. Un identifiant deja pris par un autre match est refuse.
   */
  async enregistrer(ctx: ContexteAcces, matchId: string, id: string, dto: EvenementDirectDto, maintenant = Date.now()) {
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
    const e = await this.evenements.save(this.evenements.create({ ...(existant ?? { id, matchId, auteurId: ctx.compte.id }), ...champs }));
    // Un ajout porte deja son auteur et sa date ; le journal garde ce qui change apres coup (et reste ainsi lisible).
    if (existant) await this.noter(ctx, m, "direct.evenement_modifie", { evenement: id, type: dto.type }, maintenant);
    return e;
  }

  /** Annuler un evenement : il ne compte plus, mais la trace reste (et il peut revenir en renvoyant la meme saisie). */
  async supprimer(ctx: ContexteAcces, matchId: string, id: string, maintenant = Date.now()) {
    const m = await this.acces.matchGere(ctx, matchId);
    this.exigerOuvert(await this.direct(matchId));
    const e = await this.evenements.findOne({ where: { id, matchId } });
    if (!e) throw new NotFoundException("Evenement introuvable.");
    if (!e.supprimeLe) {
      e.supprimeLe = new Date(maintenant).toISOString();
      await this.evenements.save(e);
      await this.noter(ctx, m, "direct.evenement_supprime", { evenement: id, type: e.type }, maintenant);
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

  private noter(ctx: ContexteAcces, m: Match, action: string, details: Record<string, unknown>, maintenant: number) {
    return this.journal.noter(action, { acteur: ctx.compte, cible: `match:${m.id}`, cibleClubId: ctx.gereClub(m.clubDom) ? m.clubDom : m.clubExt, details }, new Date(maintenant));
  }
}
