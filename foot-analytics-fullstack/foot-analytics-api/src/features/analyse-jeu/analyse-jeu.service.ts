// src/features/analyse-jeu/analyse-jeu.service.ts
//
// Les analyses tirees du jeu saisi en direct, jointes a la feuille de match (FMI). Lecture seule : ce module ne modifie rien.

import { ForbiddenException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { parseDateFlexible } from "@/common/dates";
import { AccesService } from "@/features/acces/acces.service";
import { ContexteAcces } from "@/features/acces/contexte-acces";
import { AnalyseService } from "@/features/analyse/analyse.service";
import { monCote } from "@/features/direct/direct.service";
import { EvenementDirect } from "@/features/direct/evenement-direct.entity";
import { Entrainement } from "@/features/entrainements/entrainement.entity";
import { Joueur } from "@/features/joueurs/joueur.entity";
import { Composition } from "@/features/matchs/composition.entity";
import { EvenementMatch } from "@/features/matchs/evenement-match.entity";
import { estMatchJoue } from "@/features/matchs/match-joue";
import { Match } from "@/features/matchs/match.entity";

import { ContexteMatch, croiser } from "./croisements";
import { filtrerMatchs, jeuEquipe, Lieu, MatchJeu } from "./jeu-equipe";
import { resumerMatch } from "./stats-jeu";

export interface FiltresJeu { equipeId?: string; saisonId?: string; lieu: Lieu; derniers: number | null }
const JOUR_MS = 86_400_000;

@Injectable()
export class AnalyseJeuService {
  constructor(
    @InjectRepository(EvenementDirect) private direct: Repository<EvenementDirect>,
    @InjectRepository(EvenementMatch) private fmi: Repository<EvenementMatch>,
    @InjectRepository(Match) private matchs: Repository<Match>,
    @InjectRepository(Composition) private compos: Repository<Composition>,
    @InjectRepository(Entrainement) private seances: Repository<Entrainement>,
    @InjectRepository(Joueur) private joueurs: Repository<Joueur>,
    private analyse: AnalyseService,
    private acces: AccesService,
  ) {}

  /** Les matchs joues d'un club (saison, equipe), avec les evenements du direct et de la feuille de match, tels que `cote` (le club) les vit. */
  private async matchsJeu(clubId: string, p: { equipeId?: string; saisonId?: string }): Promise<{ matchs: MatchJeu[]; bruts: Match[] }> {
    const filtreSaison = p.saisonId ? { saisonId: p.saisonId } : {};
    const tous = await this.matchs.find({ where: [{ ...filtreSaison, clubDom: clubId }, { ...filtreSaison, clubExt: clubId }] });
    const bruts = tous.filter((m) => estMatchJoue(m) && (!p.equipeId || m.equipeDomId === p.equipeId || m.equipeExtId === p.equipeId));
    const ids = bruts.map((m) => m.id);
    const [evs, fmi] = ids.length
      ? await Promise.all([this.direct.find({ where: { matchId: In(ids) } }), this.fmi.find({ where: { matchId: In(ids) } })])
      : [[], []];
    const matchs = bruts.map((m): MatchJeu => {
      const domicile = p.equipeId ? m.equipeDomId === p.equipeId : m.clubDom === clubId;
      return {
        matchId: m.id, date: m.date ?? null, journee: m.journee ?? null, domicile, adversaireId: domicile ? m.clubExt : m.clubDom,
        formation: (domicile ? m.formationDom : m.formationExt) || null, bp: domicile ? m.scoreDom ?? 0 : m.scoreExt ?? 0, bc: domicile ? m.scoreExt ?? 0 : m.scoreDom ?? 0,
        evenements: evs.filter((e) => e.matchId === m.id && !e.supprimeLe),
        fmi: fmi.filter((e) => e.matchId === m.id).map((e) => ({ type: e.type, sousType: e.sousType, minute: e.minute, equipe: e.equipe })),
      };
    });
    return { matchs, bruts };
  }

  private exigerClub(ctx: ContexteAcces, clubId: string) {
    if (!ctx.gereClub(clubId)) throw new ForbiddenException("Le jeu saisi est reserve au staff du club.");
  }

  /** Le jeu de mon equipe sur la saison, filtre par lieu et par nombre de derniers matchs. */
  async jeu(ctx: ContexteAcces, clubId: string, f: FiltresJeu) {
    this.exigerClub(ctx, clubId);
    const portee = await this.acces.portee(ctx, { equipeId: f.equipeId, saisonId: f.saisonId });
    const { matchs } = await this.matchsJeu(clubId, portee);
    const retenus = filtrerMatchs(matchs, f.lieu, f.derniers);
    return { filtres: { ...portee, lieu: f.lieu, derniers: f.derniers }, matchsDeLaSaison: matchs.length, jeu: jeuEquipe(retenus) };
  }

  /** Les croisements entre le jeu saisi et le rapport d'equipe (danger, impact des joueurs, rotation, charge, dispositif). */
  async croisements(ctx: ContexteAcces, clubId: string, f: FiltresJeu) {
    this.exigerClub(ctx, clubId);
    const portee = await this.acces.portee(ctx, { equipeId: f.equipeId, saisonId: f.saisonId });
    const { matchs, bruts } = await this.matchsJeu(clubId, portee);
    const retenus = filtrerMatchs(matchs, f.lieu, f.derniers);
    const jeu = jeuEquipe(retenus);
    const rapport = await this.analyse.rapportClub(clubId, portee, { donneesPrivees: true });

    // Contexte de chaque match : rotation du onze et charge d'entrainement des 7 jours precedents.
    const ordre = filtrerMatchs(matchs, "tous", null);
    const parId = new Map(bruts.map((m) => [m.id, m]));
    const compos = ordre.length ? await this.compos.find({ where: { matchId: In(ordre.map((m) => m.matchId)) } }) : [];
    const onze = (m: MatchJeu) => new Set(compos.filter((c) => c.matchId === m.matchId && c.titulaire && c.cote === (m.domicile ? "dom" : "ext")).map((c) => c.licence || `${c.nom} ${c.prenom ?? ""}`.trim()));
    const equipeIds = [...new Set(ordre.map((m) => { const b = parId.get(m.matchId); return portee.equipeId ?? (m.domicile ? b?.equipeDomId : b?.equipeExtId); }).filter((x): x is string => !!x))];
    const seances = equipeIds.length ? await this.seances.find({ where: { equipeId: In(equipeIds) } }) : [];
    const contextes: ContexteMatch[] = ordre.map((m, i) => {
      const actuel = onze(m), precedent = i > 0 ? onze(ordre[i - 1]) : null;
      const rotation = precedent && actuel.size >= 9 && precedent.size >= 9 ? [...actuel].filter((x) => !precedent.has(x)).length : null;
      const t = parseDateFlexible(m.date);
      const b = parId.get(m.matchId);
      const eq = portee.equipeId ?? (m.domicile ? b?.equipeDomId : b?.equipeExtId);
      const avant = t === null || !eq ? [] : seances.filter((s) => { const d = parseDateFlexible(s.date); return s.equipeId === eq && d !== null && d < t && d >= t - 7 * JOUR_MS; });
      return { matchId: m.matchId, rotation, seancesAvant: t === null || !eq ? null : avant.length, chargeAvant: t === null || !eq ? null : avant.reduce((s, x) => s + (x.charge ?? 0), 0) };
    });

    const ids = rapport.impacts.map((i) => i.joueurId).filter((x): x is string => !!x);
    const noms = new Map((ids.length ? await this.joueurs.find({ where: { id: In(ids) } }) : []).map((j) => [j.id, [j.prenom, j.nom].filter(Boolean).join(" ")]));
    return {
      filtres: { ...portee, lieu: f.lieu, derniers: f.derniers },
      couverture: jeu.couverture,
      croisements: croiser(jeu, { scoreDanger: rapport.scoreDanger, fatigueMoy: rapport.fatigueMoy, impacts: rapport.impacts }, contextes, noms),
      fatigueMoy: rapport.fatigueMoy,
    };
  }

  /** Le jeu de `adversaireId` tel que NOS matchs contre lui l'ont montre (ses tirs, ses zones, ses buts) : seulement ce que nous avons saisi. */
  async adversaire(ctx: ContexteAcces, equipeId: string, adversaireId: string) {
    const equipe = await this.acces.equipe(ctx, equipeId);
    this.exigerClub(ctx, equipe.clubId);
    const tous = await this.matchs.find({ where: [{ clubDom: equipe.clubId, clubExt: adversaireId }, { clubDom: adversaireId, clubExt: equipe.clubId }] });
    const bruts = tous.filter((m) => estMatchJoue(m) && ctx.voitSaison(m.saisonId));
    const ids = bruts.map((m) => m.id);
    const [evs, fmi] = ids.length ? await Promise.all([this.direct.find({ where: { matchId: In(ids) } }), this.fmi.find({ where: { matchId: In(ids) } })]) : [[], []];
    const matchs = bruts.map((m): MatchJeu => {
      const domicile = m.clubDom === adversaireId;            // du point de vue de l'adversaire
      return {
        matchId: m.id, date: m.date ?? null, journee: m.journee ?? null, domicile, adversaireId: equipe.clubId,
        formation: (domicile ? m.formationDom : m.formationExt) || null, bp: domicile ? m.scoreDom ?? 0 : m.scoreExt ?? 0, bc: domicile ? m.scoreExt ?? 0 : m.scoreDom ?? 0,
        evenements: evs.filter((e) => e.matchId === m.id && !e.supprimeLe).map((e) => ({ ...e, joueurId: null, joueur2Id: null })),
        fmi: fmi.filter((e) => e.matchId === m.id).map((e) => ({ type: e.type, sousType: e.sousType, minute: e.minute, equipe: e.equipe })),
      };
    });
    const jeu = jeuEquipe(filtrerMatchs(matchs, "tous", null));
    return { adversaireId, matchsContreNous: matchs.length, jeu: { ...jeu, joueurs: [] } };
  }

  /** Le resume d'un de MES matchs : stats des deux equipes, buts par tranche, carte des tirs, constats. */
  async resume(ctx: ContexteAcces, matchId: string) {
    const m = await this.acces.matchGere(ctx, matchId);
    const [evs, fmi] = await Promise.all([this.direct.find({ where: { matchId } }), this.fmi.find({ where: { matchId } })]);
    return resumerMatch({
      nousCote: monCote(ctx, m),
      evenements: evs.filter((e) => !e.supprimeLe),
      fmi: fmi.map((e) => ({ type: e.type, sousType: e.sousType, minute: e.minute, equipe: e.equipe })),
      scoreDom: m.scoreDom ?? 0, scoreExt: m.scoreExt ?? 0, scoreOfficiel: m.statut === "joue",
    });
  }
}
