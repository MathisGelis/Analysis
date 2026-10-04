// src/features/analyse/prematch.service.ts
//
// Rapport PRE-MATCH : tout ce qu'il faut savoir sur l'adversaire avant le coup d'envoi, en une
// reponse (chiffres compares des deux equipes, face-a-face, constats, joueurs a surveiller, arbitre,
// pistes pour le match). Il assemble des briques qui existent deja (rapport d'equipe, classement,
// profils d'arbitres) : aucune donnee n'est inventee, chaque piste cite son chiffre.
//
//   GET /api/analyse/prematch?equipeId=&adversaireId=[&matchId=]
//   equipeId : MON equipe (donc la saison et le championnat) ; adversaireId : le CLUB adverse.

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { Arbitre } from "@/features/arbitres/arbitre.entity";
import { Club } from "@/features/clubs/club.entity";
import { Equipe } from "@/features/equipes/equipe.entity";
import { LigneClassement } from "@/features/classement/ligne-classement.entity";
import { Match } from "@/features/matchs/match.entity";
import { Saison } from "@/features/saisons/saison.entity";
import { parseDateFlexible, trierChronologiquement } from "@/common/dates";
import { PredictionSysteme } from "@/features/matchs/systeme";
import { estMatchJoue } from "@/features/matchs/match-joue";

import { Insight, MatchTendance } from "./tendances";
import {
  BilanLieu, bilanParLieu, faceAFace, MatchRecent, Piste, pistesPrematch, profilEquipe, ProfilEquipe, Rencontre,
} from "./prematch";
import { AnalyseNumeros } from "./compo-numeros";
import { contenuRapport, PageRapport } from "./rapport-pptx-contenu";
import { genererRapportPptx, lireModele } from "./rapport-pptx";
import { fusionnerSystemes, SystemeProbable } from "./systeme-probable";
import { systemeDe } from "./situation-equipe";
import { Projection, projectionResultat } from "./projection";
import { AnalyseService } from "./analyse.service";

const norm = (s?: string | null) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Match du point de vue d'une equipe, pour les profils chiffres (scores seuls). */
function versTendance(m: Match, equipeId: string): MatchTendance {
  const dom = m.equipeDomId === equipeId;
  return {
    matchId: m.id, date: m.date ?? null, journee: m.journee ?? null, domicile: dom,
    adversaireId: dom ? m.clubExt : m.clubDom, adversaireEquipeId: dom ? m.equipeExtId : m.equipeDomId,
    bp: dom ? m.scoreDom : m.scoreExt, bc: dom ? m.scoreExt : m.scoreDom,
    cartonsJaunes: 0, cartonsRouges: 0, minutesCartons: [], minutesButsPour: [], minutesButsContre: [], titulaires: null,
  };
}

/** Bilan de saison d'une equipe : la ligne du classement quand elle existe, sinon le cumul de ses matchs joues. */
export interface BilanSaison extends BilanLieu {
  pts: number | null; rang: number | null; source: "classement" | "matchs";
}

/** Bilan de saison, par lieu, et derniers matchs d'une equipe (les memes pour mon equipe et pour l'adversaire). */
export interface ResumeSaison {
  /** V-N-D, buts et points de la saison. */
  bilan: BilanSaison;
  /** Bilan a domicile et a l'exterieur (scores des matchs joues). */
  lieux: { domicile: BilanLieu; exterieur: BilanLieu };
  /** Ses cinq derniers matchs joues, le plus recent d'abord. */
  derniersMatchs: MatchRecent[];
}

export interface RapportPrematch {
  genereLe: string;
  monEquipe: ProfilEquipe & ResumeSaison & { equipeId: string; equipeNom: string; clubId: string; clubNom: string };
  adversaire: ProfilEquipe & ResumeSaison & { equipeId: string | null; clubId: string; clubNom: string };
  championnat: { competition: string | null; poule: string | null; saisonNom: string | null; saisonActive: boolean };
  /** Le match concerne, s'il est programme ; null pour un rapport "a froid". */
  match: {
    id: string; date: string | null; heure: string | null; journee: string | null; terrain: string | null; domicile: boolean;
    /** Arbitre designe tel qu'il est saisi, meme sans profil connu. */
    arbitre: string | null;
  } | null;
  faceAFace: ReturnType<typeof faceAFace>;
  /** Rapport detaille de l'adversaire ; null s'aucun de ses matchs n'a ete analyse. */
  analyse: null | {
    matchsAnalyses: number;
    scoreDanger: number;
    scoreChaos: number;
    fatigueMoy: number | null;
    entraineur: string | null;
    /** Fiche du coach (lien vers /coachs/:id). */
    entraineurId: string | null;
    insights: Insight[];
    compoProbable: { poste: string; numero?: number; nom: string; matchsJoues: number }[];
    joueursCles: { joueurId: string | null; nom: string; prenom?: string; poste?: string; delta: number; matchsAvec: number; titularisations: number }[];
    faiblesses: { niveau: string; titre: string; detail: string }[];
    avertis: { nom: string; jaunes: number; rouges: number }[];
    /** Ses meilleurs buteurs sur le perimetre (hors contre son camp). */
    buteurs: { nom: string; buts: number }[];
    discipline: { jaunes: number; rouges: number; jaunesParMatch: number; partFinDeMatch: number | null };
    changementsMoyenne: number;
  };
  arbitre: null | { nom: string; profil: string | null; matchsPrincipal: number; cartonsJaunes: number; cartonsRouges: number; cartonsParMatch: number; motifsTop: string | null };
  /**
   * Systeme de jeu de l'adversaire. `prediction` : d'apres les dispositifs RENSEIGNES sur ses matchs (la FMI n'en
   * contient aucun), `observes` sur `matchs` joues ; `probable` : cette prediction fusionnee avec ce que disent les
   * numeros de maillot (voir systeme-probable.ts), c'est ce qu'il faut afficher ; `dernierMatchId` : ou saisir un dispositif.
   */
  systemeAdverse: {
    prediction: PredictionSysteme | null; observes: number; matchs: number; dernierMatchId: string | null;
    probable: SystemeProbable | null;
  };
  /** Lecture des numeros de maillot de l'adversaire (postes, polyvalence, indices) ; null s'aucun de ses matchs n'a ete analyse. */
  numeros: AnalyseNumeros | null;
  /** Projection de resultat (modele de Poisson sur les moyennes de buts) ; null si l'echantillon est trop petit. */
  projection: Projection | null;
  pistes: Piste[];
}

@Injectable()
export class PrematchService {
  constructor(
    private analyse: AnalyseService,
    @InjectRepository(Match) private matchs: Repository<Match>,
    @InjectRepository(Equipe) private equipes: Repository<Equipe>,
    @InjectRepository(Club) private clubs: Repository<Club>,
    @InjectRepository(LigneClassement) private classement: Repository<LigneClassement>,
    @InjectRepository(Saison) private saisons: Repository<Saison>,
    @InjectRepository(Arbitre) private arbitres: Repository<Arbitre>,
  ) {}

  async rapport(equipeId: string, adversaireClubId: string, matchId?: string | null): Promise<RapportPrematch> {
    const monEquipe = await this.equipes.findOne({ where: { id: equipeId } });
    if (!monEquipe) throw new NotFoundException(`Equipe ${equipeId} introuvable`);
    const [monClub, advClub] = await Promise.all([
      this.clubs.findOne({ where: { id: monEquipe.clubId } }),
      this.clubs.findOne({ where: { id: adversaireClubId } }),
    ]);
    if (!monClub) throw new NotFoundException(`Club ${monEquipe.clubId} introuvable`);
    if (!advClub) throw new NotFoundException(`Club ${adversaireClubId} introuvable`);
    if (advClub.id === monClub.id) throw new BadRequestException("L'adversaire doit etre un autre club que le votre.");

    // Championnat : l'equipe adverse est celle du meme club dans ma poule.
    const poule = await this.analyse.equipesDuChampionnat(monEquipe);
    const advEquipe = poule.find((e) => e.clubId === advClub.id) ?? null;
    const saison = monEquipe.saisonId ? await this.saisons.findOne({ where: { id: monEquipe.saisonId } }) : null;

    // Match concerne : celui demande, sinon le prochain programme entre les deux clubs.
    const match = await this.matchConcerne(monEquipe, advClub.id, matchId);

    // Resultats et classement des deux equipes.
    const ids = [monEquipe.id, advEquipe?.id].filter((x): x is string => !!x);
    const [matchsEquipes, lignes] = await Promise.all([
      this.matchs.find({ where: ids.flatMap((id) => [{ equipeDomId: id }, { equipeExtId: id }]) }),
      this.classement.find({ where: { equipeId: In(ids) } }),
    ]);
    const joues = matchsEquipes.filter(estMatchJoue);
    const ligneDe = (id?: string | null) => lignes.find((l) => l.equipeId === id);
    const profil = (equipe: Equipe | null, nom: string): ProfilEquipe => {
      const l = ligneDe(equipe?.id);
      return profilEquipe(
        nom, equipe ? joues.filter((m) => m.equipeDomId === equipe.id || m.equipeExtId === equipe.id).map((m) => versTendance(m, equipe.id)) : [],
        { rang: l?.rang ?? null, pts: l?.pts ?? null },
      );
    };
    const matchsMoi = joues.filter((m) => m.equipeDomId === monEquipe.id || m.equipeExtId === monEquipe.id);
    const moi = {
      ...profil(monEquipe, monClub.nom), equipeId: monEquipe.id, equipeNom: monEquipe.nom, clubId: monClub.id, clubNom: monClub.nom,
      ...(await this.resumeSaison(monEquipe, matchsMoi, ligneDe(monEquipe.id))),
    };
    const matchsAdv = advEquipe ? joues.filter((m) => m.equipeDomId === advEquipe.id || m.equipeExtId === advEquipe.id) : [];
    const adv = {
      ...profil(advEquipe, advClub.nom), equipeId: advEquipe?.id ?? null, clubId: advClub.id, clubNom: advClub.nom,
      ...(await this.resumeSaison(advEquipe, matchsAdv, ligneDe(advEquipe?.id))),
    };

    const face = await this.historiqueFace(monEquipe, advClub.id);

    // Rapport detaille de l'adversaire (sur ma saison, et son equipe de ma poule si on la connait).
    const rap = await this.analyse.rapportClub(advClub.id, { equipeId: advEquipe?.id, saisonId: monEquipe.saisonId ?? undefined });
    const analyse: RapportPrematch["analyse"] = rap.matchsAnalyses === 0 ? null : {
      matchsAnalyses: rap.matchsAnalyses,
      scoreDanger: rap.scoreDanger, scoreChaos: rap.scoreChaos, fatigueMoy: rap.fatigueMoy,
      ...(() => {
        const coach = rap.coachs.filter((c) => c.fonctionPrincipale === "Entraineur").sort((a, b) => b.matchsPresent - a.matchsPresent)[0];
        return { entraineur: coach ? `${coach.prenom ?? ""} ${coach.nom}`.trim() : null, entraineurId: coach?.coachId ?? null };
      })(),
      insights: rap.tendances.insights.slice(0, 6),
      compoProbable: rap.compoProbable,
      joueursCles: rap.joueursCles.slice(0, 5).map((j) => ({
        joueurId: j.joueurId, nom: j.nom, prenom: j.prenom, poste: j.poste, delta: j.delta, matchsAvec: j.matchsAvec, titularisations: j.titularisations,
      })),
      faiblesses: rap.faiblesses.filter((f) => f.niveau !== "info"),
      avertis: rap.avertis,
      buteurs: rap.buteurs,
      discipline: {
        jaunes: rap.tendances.discipline.jaunes, rouges: rap.tendances.discipline.rouges,
        jaunesParMatch: rap.tendances.discipline.jaunesParMatch, partFinDeMatch: rap.tendances.discipline.partFinDeMatch,
      },
      changementsMoyenne: rap.changementsMoy.moyenne,
    };

    const arbitre = await this.arbitreDuMatch(match);
    const domicile = match ? match.equipeDomId === monEquipe.id || (!match.equipeDomId && match.clubDom === monClub.id) : null;

    // Systeme de l'adversaire : ses matchs joues, vus de son cote, avec le dispositif quand le staff l'a renseigne.
    const situation = systemeDe(matchsAdv, { clubId: advClub.id, equipeId: advEquipe?.id ?? null });
    const numeros = rap.matchsAnalyses === 0 ? null : rap.numeros;
    const probable = fusionnerSystemes(situation.prediction, numeros);
    const systemeAdverse = { ...situation, probable };
    const projection = projectionResultat({
      moi: { matchs: moi.matchs, bpm: moi.bpm, bcm: moi.bcm }, adv: { matchs: adv.matchs, bpm: adv.bpm, bcm: adv.bcm }, domicileMoi: domicile,
    });

    const pistes = pistesPrematch({
      moi, adv,
      advJoue: domicile === null ? null : domicile ? "exterieur" : "domicile",
      advRapport: analyse && rap ? {
        scoreChaos: analyse.scoreChaos, fatigueMoy: analyse.fatigueMoy,
        cartonsAvecMinute: rap.tendances.discipline.cartonsAvecMinute, partFinDeMatch: rap.tendances.discipline.partFinDeMatch,
        matchsSerres: rap.tendances.profil.matchsSerres, matchsAnalyses: rap.tendances.profil.matchs,
        faiblesses: rap.faiblesses,
      } : null,
      arbitre: arbitre ? { nom: arbitre.nom, profil: arbitre.profil, matchsPrincipal: arbitre.matchsPrincipal, cartonsParMatch: arbitre.cartonsParMatch } : null,
      systeme: probable && {
        systeme: probable.systeme, confiance: probable.confiance, observations: probable.observations, fiabilite: probable.fiabilite,
        source: probable.source, matchsNumeros: probable.matchsNumeros,
      },
      faceAFace: {
        joues: face.bilan.joues, v: face.bilan.v, n: face.bilan.n, d: face.bilan.d,
        derniere: face.rencontres[0] ? { bp: face.rencontres[0].bp, bc: face.rencontres[0].bc, domicile: face.rencontres[0].domicile, issue: face.rencontres[0].issue } : null,
      },
    });

    return {
      genereLe: new Date().toISOString(),
      monEquipe: moi, adversaire: adv,
      championnat: { competition: monEquipe.competitionLibelle ?? null, poule: monEquipe.poule ?? null, saisonNom: saison?.nom ?? null, saisonActive: !!saison?.actif },
      match: match ? {
        id: match.id, date: match.date ?? null, heure: match.heure ?? null, journee: match.journee ?? null,
        terrain: match.terrain ?? null, domicile: !!domicile, arbitre: match.arbitre?.trim() || null,
      } : null,
      faceAFace: face, analyse, arbitre, systemeAdverse, numeros, projection, pistes,
    };
  }

  /** Bilan de saison, bilan par lieu et derniers matchs d'une equipe, d'apres sa ligne de classement et ses matchs joues. */
  private async resumeSaison(equipe: Equipe | null, matchs: Match[], ligne?: LigneClassement) {
    const vus = equipe ? matchs.map((m) => versTendance(m, equipe.id)) : [];
    const { total, domicile, exterieur } = bilanParLieu(vus);
    const bilan: BilanSaison = ligne
      ? { joues: ligne.joues, v: ligne.v, n: ligne.n, d: ligne.d, bp: ligne.bp, bc: ligne.bc, pts: ligne.pts, rang: ligne.rang, source: "classement" }
      : { ...total, pts: null, rang: null, source: "matchs" };
    const recents = trierChronologiquement(vus).slice(-5).reverse();
    const ids = [...new Set(recents.map((m) => m.adversaireId).filter((x): x is string => !!x))];
    const noms = new Map((ids.length ? await this.clubs.find({ where: { id: In(ids) } }) : []).map((c) => [c.id, c.nom]));
    const derniersMatchs: MatchRecent[] = recents.map((m) => ({
      matchId: m.matchId, date: m.date, journee: m.journee, adversaire: (m.adversaireId && noms.get(m.adversaireId)) || "",
      domicile: m.domicile, bp: m.bp, bc: m.bc, issue: m.bp > m.bc ? "V" : m.bp === m.bc ? "N" : "D",
    }));
    return { bilan, lieux: { domicile, exterieur }, derniersMatchs };
  }

  /** Le rapport pre-match au format de la presentation du staff (PowerPoint), limite aux `pages` demandees. */
  async exporterPptx(
    equipeId: string, adversaireClubId: string, matchId: string | null, pages: readonly PageRapport[],
  ): Promise<{ fichier: Uint8Array; nom: string }> {
    const rapport = await this.rapport(equipeId, adversaireClubId, matchId);
    const fichier = genererRapportPptx(lireModele(), contenuRapport(rapport), pages);
    const adversaire = rapport.adversaire.clubNom.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const date = (rapport.match?.date ?? "").replace(/[^0-9A-Za-z]+/g, "-").replace(/^-|-$/g, "");
    return { fichier, nom: `avant-match-${adversaire || "adversaire"}${date ? `-${date}` : ""}.pptx` };
  }

  /** Match designe, ou a defaut le prochain match programme entre les deux clubs pour mon equipe. */
  private async matchConcerne(monEquipe: Equipe, advClubId: string, matchId?: string | null): Promise<Match | null> {
    if (matchId) {
      const m = await this.matchs.findOne({ where: { id: matchId } });
      if (!m) throw new NotFoundException(`Match ${matchId} introuvable`);
      const clubs = [m.clubDom, m.clubExt];
      if (!clubs.includes(advClubId) || !clubs.includes(monEquipe.clubId)) {
        throw new BadRequestException("Ce match ne oppose pas ces deux clubs.");
      }
      return m;
    }
    const candidats = (await this.matchs.find({
      where: [
        { equipeDomId: monEquipe.id, clubExt: advClubId },
        { equipeExtId: monEquipe.id, clubDom: advClubId },
      ],
    })).filter((m) => !estMatchJoue(m) && (m.statut ?? "") !== "annule");
    if (candidats.length === 0) return null;
    const auj = Date.now() - 86_400_000;
    const date = (m: Match) => parseDateFlexible(m.date ?? "") ?? Infinity;
    const a_venir = candidats.filter((m) => date(m) >= auj).sort((a, b) => date(a) - date(b));
    return a_venir[0] ?? null;
  }

  /** Rencontres passees entre mon club et l'adversaire, dans ma categorie (Seniors contre Seniors). */
  private async historiqueFace(monEquipe: Equipe, advClubId: string): Promise<ReturnType<typeof faceAFace>> {
    const monClubId = monEquipe.clubId;
    const tous = (await this.matchs.find({
      where: [{ clubDom: monClubId, clubExt: advClubId }, { clubDom: advClubId, clubExt: monClubId }],
    })).filter(estMatchJoue);
    const equipeIds = [...new Set(tous.flatMap((m) => [m.equipeDomId, m.equipeExtId]).filter((x): x is string => !!x))];
    const equipes = equipeIds.length ? await this.equipes.find({ where: { id: In(equipeIds) } }) : [];
    const categorie = new Map(equipes.map((e) => [e.id, e.categorie]));
    const memeCategorie = (m: Match) => {
      const cote = m.clubDom === monClubId ? m.equipeDomId : m.equipeExtId;
      const c = cote ? categorie.get(cote) : undefined;
      // Sans equipe rattachee, on garde le match (ancien import) plutot que de le perdre.
      return !c || !monEquipe.categorie || c === monEquipe.categorie;
    };
    return faceAFace(tous.filter(memeCategorie).map((m): Omit<Rencontre, "issue"> => {
      const dom = m.clubDom === monClubId;
      return {
        matchId: m.id, date: m.date ?? null, journee: m.journee ?? null, saisonId: m.saisonId, domicile: dom,
        bp: dom ? m.scoreDom : m.scoreExt, bc: dom ? m.scoreExt : m.scoreDom,
      };
    }));
  }

  /** Profil de l'arbitre designe sur le match, s'il est connu (nom saisi sur le match ou importe). */
  private async arbitreDuMatch(match: Match | null): Promise<NonNullable<RapportPrematch["arbitre"]> | null> {
    const nom = norm(match?.arbitre);
    if (!nom) return null;
    const tous = await this.arbitres.find();
    const a = tous.find((x) => norm(`${x.nom} ${x.prenom ?? ""}`) === nom || norm(`${x.prenom ?? ""} ${x.nom}`) === nom);
    if (!a) return null;
    const cartons = (a.cartonsJaunesDonnes ?? 0) + (a.cartonsRougesDonnes ?? 0);
    return {
      nom: `${a.prenom ?? ""} ${a.nom}`.trim(), profil: a.profil ?? null, matchsPrincipal: a.matchsPrincipal ?? 0,
      cartonsJaunes: a.cartonsJaunesDonnes ?? 0, cartonsRouges: a.cartonsRougesDonnes ?? 0,
      cartonsParMatch: a.matchsPrincipal ? +(cartons / a.matchsPrincipal).toFixed(2) : 0,
      motifsTop: a.motifsTop ?? null,
    };
  }
}
