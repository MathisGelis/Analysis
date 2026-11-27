// src/features/analyse-jeu/analyse-jeu.service.ts
//
// Les analyses tirees du jeu saisi en direct, jointes a la feuille de match (FMI). Lecture seule : ce module ne modifie rien.

import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { parseDateFlexible } from "@/common/dates";
import { AccesService } from "@/features/acces/acces.service";
import { ContexteAcces } from "@/features/acces/contexte-acces";
import { AnalyseService } from "@/features/analyse/analyse.service";
import { DirectService } from "@/features/direct/direct.service";
import { EvenementDirect } from "@/features/direct/evenement-direct.entity";
import { Entrainement } from "@/features/entrainements/entrainement.entity";
import { Joueur } from "@/features/joueurs/joueur.entity";
import { Composition } from "@/features/matchs/composition.entity";
import { EvenementMatch } from "@/features/matchs/evenement-match.entity";
import { estMatchJoue } from "@/features/matchs/match-joue";
import { Match } from "@/features/matchs/match.entity";

import { Club } from "@/features/clubs/club.entity";
import { Tactique } from "@/features/tactiques/tactique.entity";

import { ContexteMatch, croiser } from "./croisements";
import { segmentsDeSysteme, systemesRenseignes } from "@/features/matchs/systeme";

import { analyserHub, MatchHub } from "./analyses-hub";
import { dataHub, rangsDansEffectif, statsJoueur } from "./data-hub";
import { presencesDuJoueur } from "./minutes-joueur";
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
    private directSvc: DirectService,
  ) {}

  /** Les matchs joues d'un club (saison, equipe), avec les evenements du direct et de la feuille de match, tels que `cote` (le club) les vit. */
  private async matchsJeu(clubId: string, p: { equipeId?: string; saisonId?: string }): Promise<{ matchs: MatchJeu[]; bruts: Match[] }> {
    const filtreSaison = p.saisonId ? { saisonId: p.saisonId } : {};
    const tous = await this.matchs.find({ where: [{ ...filtreSaison, clubDom: clubId }, { ...filtreSaison, clubExt: clubId }] });
    const bruts = tous.filter((m) => estMatchJoue(m) && (!p.equipeId || m.equipeDomId === p.equipeId || m.equipeExtId === p.equipeId));
    const ids = bruts.map((m) => m.id);
    const [evs, fmi, plans] = ids.length
      ? await Promise.all([
        this.direct.find({ where: { matchId: In(ids) } }), this.fmi.find({ where: { matchId: In(ids) } }),
        this.direct.manager.getRepository(Tactique).find({ where: { matchId: In(ids) } }),
      ])
      : [[], [], []];
    const matchs = bruts.map((m): MatchHub => {
      const domicile = p.equipeId ? m.equipeDomId === p.equipeId : m.clubDom === clubId;
      // Les dispositifs tels que le staff les a SAISIS (ou observes en apres-match) : jamais une valeur par defaut.
      const sys = systemesRenseignes(m);
      // Le gardien de depart : le premier du onze enregistre a l'avant-match pour l'equipe de mon club dans ce match.
      const equipeDuMatch = domicile ? m.equipeDomId : m.equipeExtId;
      const plan = plans.find((x) => x.matchId === m.id && (!equipeDuMatch || x.equipeId === equipeDuMatch));
      // Les dispositifs au fil du match : celui du coup d'envoi, puis chaque changement saisi en direct (les stats se repartissent au prorata).
      const evsMatch = evs.filter((e) => e.matchId === m.id && !e.supprimeLe);
      const changements = (cote: "dom" | "ext") => evsMatch.filter((e) => e.type === "systeme" && e.cote === cote && !!e.resultat).map((e) => ({ minute: e.minute, formation: e.resultat as string }));
      const dureeMin = Math.max(90, ...evsMatch.map((e) => e.minute));
      const mien = domicile ? "dom" : "ext", leur = domicile ? "ext" : "dom";
      return {
        formationSaisie: domicile ? sys.dom : sys.ext, formationAdverse: domicile ? sys.ext : sys.dom,
        dureeMin, segmentsSaisie: segmentsDeSysteme(domicile ? sys.dom : sys.ext, changements(mien), dureeMin),
        segmentsAdverse: segmentsDeSysteme(domicile ? sys.ext : sys.dom, changements(leur), dureeMin),
        segments: segmentsDeSysteme(domicile ? m.formationDom : m.formationExt, changements(mien), dureeMin),
        gardien: plan?.titulaires?.[0] || null,
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

  /** Les noms des clubs adverses, par identifiant. */
  private async nomsDesClubs(ids: (string | null)[]): Promise<Map<string, string>> {
    const uniques = [...new Set(ids.filter((x): x is string => !!x))];
    if (uniques.length === 0) return new Map();
    return new Map((await this.matchs.manager.getRepository(Club).find({ where: { id: In(uniques) }, select: { id: true, nom: true } })).map((c) => [c.id, c.nom]));
  }

  /** Le Data Hub de mon equipe : resultats, attaque, defense, coups de pied arretes, discipline, joueurs, tendance. Reserve au staff du club. */
  async dataHub(ctx: ContexteAcces, clubId: string, f: FiltresJeu) {
    this.exigerClub(ctx, clubId);
    const portee = await this.acces.portee(ctx, { equipeId: f.equipeId, saisonId: f.saisonId });
    const { matchs } = await this.matchsJeu(clubId, portee);
    const retenus = filtrerMatchs(matchs, f.lieu, f.derniers);
    const hub = dataHub(retenus);
    const analyses = analyserHub(retenus);
    const idsAnalyses = [...analyses.creation.reseau.flatMap((l) => [l.passeurId, l.tireurId]), analyses.dependances?.buteur?.joueurId, analyses.dependances?.passeur?.joueurId].filter((x): x is string => !!x);
    const ids = [...new Set([...hub.joueurs.map((j) => j.joueurId), ...idsAnalyses])];
    const fiches = ids.length ? await this.joueurs.find({ where: { id: In(ids) } }) : [];
    const fiche = new Map(fiches.map((j) => [j.id, j]));
    const clubs = await this.nomsDesClubs(hub.parMatch.map((m) => m.adversaireId));
    return {
      filtres: { ...portee, lieu: f.lieu, derniers: f.derniers }, matchsDeLaSaison: matchs.length, hub: {
        ...hub,
        // Les joueurs sont nommes (et rejoints a ce que l'app sait deja : minutes, note, fatigue).
        joueurs: hub.joueurs.map((j) => {
          const x = fiche.get(j.joueurId);
          return { ...j, nom: x ? [x.prenom, x.nom].filter(Boolean).join(" ") : "Joueur", poste: x?.poste ?? null, minutes: x?.minutes ?? null, noteMoyenne: x?.noteMoyenne ?? null, scoreFatigue: x?.scoreFatigue ?? null };
        }),
        parMatch: hub.parMatch.map((m) => ({ ...m, adversaire: (m.adversaireId && clubs.get(m.adversaireId)) || "Adversaire" })),
        analyses,
        noms: Object.fromEntries(idsAnalyses.map((id) => { const x = fiche.get(id); return [id, x ? [x.prenom, x.nom].filter(Boolean).join(" ") : "Joueur"]; })),
      },
    };
  }

  /** Les stats d'un joueur de mon club d'apres les evenements saisis en direct (tirs, passes, arrets, cartons...). Reserve au staff du club. */
  async statsDuJoueur(ctx: ContexteAcces, joueurId: string, saisonId?: string) {
    const joueur = await this.joueurs.findOne({ where: { id: joueurId } });
    if (!joueur?.clubId) throw new NotFoundException(`Joueur ${joueurId} introuvable`);
    this.exigerClub(ctx, joueur.clubId);
    const portee = await this.acces.portee(ctx, { saisonId });
    const { matchs } = await this.matchsJeu(joueur.clubId, { saisonId: portee.saisonId });
    // Ses minutes dans les matchs saisis (feuille de match) : de quoi rapporter ses actions a 90 minutes.
    const saisis = matchs.filter((m) => m.evenements.length > 0);
    const ids = saisis.map((m) => m.matchId);
    const [lignes, evtFmi] = ids.length
      ? await Promise.all([this.compos.find({ where: { matchId: In(ids) } }), this.fmi.find({ where: { matchId: In(ids) } })])
      : [[], []];
    const cotes = new Map(saisis.map((m) => [m.matchId, (m.domicile ? "dom" : "ext") as "dom" | "ext"]));
    const presences = presencesDuJoueur(joueur, lignes, evtFmi, cotes);
    const stats = statsJoueur(matchs, joueurId, presences);
    const rangs = rangsDansEffectif(matchs, joueurId);
    const clubs = await this.nomsDesClubs(stats.parMatch.map((m) => m.adversaireId));
    return {
      saisonId: portee.saisonId ?? null, matchsDeLaSaison: matchs.length, matchsSaisis: matchs.filter((m) => m.evenements.length > 0).length,
      stats: { ...stats, parMatch: stats.parMatch.map((m) => ({ ...m, adversaire: (m.adversaireId && clubs.get(m.adversaireId)) || "Adversaire" })) },
      rangs,
    };
  }

  /** Le resume d'un de MES matchs : stats des deux equipes, buts par tranche, carte des tirs, constats. */
  async resume(ctx: ContexteAcces, matchId: string) {
    const m = await this.acces.matchGere(ctx, matchId);
    const [evs, fmi] = await Promise.all([this.direct.find({ where: { matchId } }), this.fmi.find({ where: { matchId } })]);
    return resumerMatch({
      nousCote: (await this.directSvc.nous(ctx, m)).cote,
      evenements: evs.filter((e) => !e.supprimeLe),
      fmi: fmi.map((e) => ({ type: e.type, sousType: e.sousType, minute: e.minute, equipe: e.equipe })),
      scoreDom: m.scoreDom ?? 0, scoreExt: m.scoreExt ?? 0, scoreOfficiel: m.statut === "joue",
    });
  }
}
