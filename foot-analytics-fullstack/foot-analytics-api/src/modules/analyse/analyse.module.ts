// src/modules/analyse/analyse.module.ts
//
// Analyse approfondie d'un club : presence/absence et impact, joueurs cles,
// dependance, rotation, faiblesses, partnerships gagnants, minute moyenne
// des changements, scores de danger et de chaos.
//
// Deux endpoints :
//   GET /api/analyse/club/:clubId[?equipeId=&saisonId=]  rapport d'une equipe
//   GET /api/analyse/poule?equipeId=                     dynamique de toute la poule
// Les reponses sont des objets self-contenus, consommes tels quels par le front.
// Les TENDANCES (dynamique recente, series, domicile/exterieur, discipline,
// rotation, niveau des adversaires) sont calculees par common/tendances.ts.
//
// Perimetre : sans parametre, tous les matchs du club (toutes equipes, toutes
// saisons melangees : a eviter). `equipeId` restreint a UNE equipe (donc une
// saison), `saisonId` a une saison. Un rapport de "Seniors D2 2025-2026" ne doit
// pas etre pollue par les U20 ou par la saison suivante.

import {
  Controller, Get, Injectable, Module, NotFoundException, Param, Query,
} from "@nestjs/common";
import { InjectRepository, TypeOrmModule } from "@nestjs/typeorm";
import { In, IsNull, Repository } from "typeorm";
import {
  Club, Coach, Composition, Entrainement, Equipe, EvenementMatch, Joueur, LigneClassement,
  Match, Saison, StaffMatch,
} from "@/entities";
import {
  calculerTendances, dynamiqueForme, issueDe, MatchTendance, series as seriesDe, Issue, SensTendance,
  Tendances, trierChronologiquement,
} from "@/common/tendances";

/* ---------- helpers ---------- */
function norm(s?: string): string {
  return (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}
// Permet de retrouver le joueur depuis un evenement nomme ("nom prenom").
function eventReferenceComp(evtName: string | undefined, comp: Composition): boolean {
  const n = norm(evtName);
  const s = norm(comp.nom);
  return s.length > 1 && n.includes(s);
}
function avg(arr: number[]): number {
  return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
}
function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = avg(arr);
  return Math.sqrt(avg(arr.map((x) => (x - m) ** 2)));
}
// Le rang de ligne d'un poste : 0 = gardien, 1 = defense, 2 = milieu, 3 = attaque
function ligneOf(poste: string | undefined): "GB" | "DEF" | "MIL" | "ATT" {
  const p = (poste ?? "").toUpperCase();
  if (p === "GB") return "GB";
  if (/^D/.test(p)) return "DEF";
  if (/^A/.test(p) || p === "BU") return "ATT";
  return "MIL";
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/* ---------- types de sortie (consommes tels quels cote front) ---------- */
interface RapportEquipe {
  clubId: string;
  clubNom: string;
  matchsAnalyses: number;
  // KPI haut de page
  scoreDanger: number;        // 0-100, plus haut = equipe dangereuse
  scoreChaos: number;         // 0-100, plus haut = equipe instable
  formeMoy: number | null;    // moyenne des scoreForme des titulaires types ; null hors saison active
  // Ce que le rapport couvre (equipe, saison, poule) : la page l'affiche en en-tete.
  perimetre: {
    equipeId: string | null; equipeNom: string | null;
    saisonId: string | null; saisonNom: string | null; saisonActive: boolean;
    competition: string | null; poule: string | null;
  };
  // Tendances : dynamique recente, series, lieux, profil, discipline, rotation, constats.
  tendances: Tendances;
  // Impact / joueurs cles
  impacts: ImpactJoueur[];    // un par joueur, trie par impact decroissant
  joueursCles: ImpactJoueur[];// top par impactPondere, min 50% des matchs
  impactsFaibles: ImpactJoueur[]; // joueurs reguliers a faible impact
  // Stabilite par ligne et global
  stabilite: {
    global: number;
    parLigne: { ligne: string; stabilite: number; effectifUtilise: number; rotations: number }[];
  };
  // Faiblesses identifiees
  faiblesses: Faiblesse[];
  // Compo probable
  compoProbable: { poste: string; numero?: number; nom: string; matchsJoues: number }[];
  // Partnerships (combinaisons recurrentes)
  partnerships: Partnership[];
  // Minute moyenne des changements
  changementsMoy: {
    moyenne: number;
    parTypeMatch: { type: "victoire" | "nul" | "defaite"; moyenne: number; nbChangements: number }[];
    nbChangementsAvant60: number;
  };
  // Stats sur le staff (coachs / dirigeants) presents sur les FMI.
  coachs: CoachStat[];
  changementsCoach: { date: string; journee?: string; avant: string; apres: string }[];
}

interface CoachStat {
  coachId: string;
  nom: string;
  prenom?: string;
  licence?: string;
  matchsPresent: number;
  v: number; n: number; d: number;
  txReussite: number;
  cartonsJaunes: number;
  cartonsRouges: number;
  fonctions: string;             // "E (5) · D (1)"
  fonctionPrincipale: string | null;  // "Entraineur", "Adjoint", "Medecin", "Dirigeant"
  premierMatch: string | null;
  dernierMatch: string | null;
}
interface ImpactJoueur {
  joueurId: string | null;
  nom: string;
  prenom?: string;
  poste?: string;
  matchsAvec: number;
  matchsSans: number;
  pointsParMatchAvec: number;
  pointsParMatchSans: number;
  delta: number;           // ppm avec - ppm sans
  // Impact pondere par le nombre de matchs joues : ainsi un joueur qui
  // n'a joue qu'un seul match victorieux ne ressort pas comme "cle" alors
  // qu'il a un delta enorme mais sur 1 seul echantillon.
  impactPondere: number;
  diffParMatchAvec: number;
  diffParMatchSans: number;
  titularisations: number;
}
interface Faiblesse {
  niveau: "info" | "alerte" | "critique";
  titre: string;
  detail: string;
}
interface Partnership {
  type: "defense" | "milieu" | "attaque";
  joueurs: string[];
  matchsEnsemble: number;
  v: number; n: number; d: number;
  txReussite: number;       // % victoires
  bp: number; bc: number;
}

@Injectable()
export class AnalyseService {
  constructor(
    @InjectRepository(Club) private clubs: Repository<Club>,
    @InjectRepository(Match) private matchs: Repository<Match>,
    @InjectRepository(Joueur) private joueurs: Repository<Joueur>,
    @InjectRepository(Composition) private compos: Repository<Composition>,
    @InjectRepository(EvenementMatch) private evts: Repository<EvenementMatch>,
    @InjectRepository(Entrainement) private trainings: Repository<Entrainement>,
    @InjectRepository(Coach) private coachsRepo: Repository<Coach>,
    @InjectRepository(StaffMatch) private staffMatchsRepo: Repository<StaffMatch>,
    @InjectRepository(Equipe) private equipesRepo: Repository<Equipe>,
    @InjectRepository(LigneClassement) private classementRepo: Repository<LigneClassement>,
    @InjectRepository(Saison) private saisonsRepo: Repository<Saison>,
  ) {}

  async rapportClub(
    clubId: string, portee: { equipeId?: string; saisonId?: string } = {},
  ): Promise<RapportEquipe> {
    const club = await this.clubs.findOne({ where: { id: clubId } });
    if (!club) throw new NotFoundException(`Club ${clubId} introuvable`);

    // Uniquement les matchs du club (et de la saison demandee), pas toute la base.
    const filtreSaison = portee.saisonId ? { saisonId: portee.saisonId } : {};
    const matchs = await this.matchs.find({
      where: [{ ...filtreSaison, clubDom: clubId }, { ...filtreSaison, clubExt: clubId }],
      relations: ["compositions", "evenements"],
    });
    const dansPortee = (m: Match) => !portee.equipeId
      || m.equipeDomId === portee.equipeId || m.equipeExtId === portee.equipeId;
    const matchsClub = matchs.filter(
      (m) => dansPortee(m) && (m as any).statut !== "annule" && (m as any).statut !== "reporte",
    );
    const joueurs = await this.joueurs.find({ where: { clubId } });
    const joueursById = new Map(joueurs.map((j) => [j.id, j]));

    // Helper : pour chaque match, donner les points obtenus par le club, la
    // composition de ses 11 titulaires, le banc, et la diff de buts.
    type MatchInfo = {
      m: Match;
      dom: boolean;
      pts: number;          // 0 / 1 / 3
      diff: number;         // bp - bc cote club
      titulaires: Composition[];
      bancs: Composition[];
      issue: "victoire" | "nul" | "defaite";
    };
    const infos: MatchInfo[] = matchsClub.map((m) => {
      const dom = m.clubDom === clubId;
      const bp = dom ? m.scoreDom : m.scoreExt;
      const bc = dom ? m.scoreExt : m.scoreDom;
      const pts = bp > bc ? 3 : bp === bc ? 1 : 0;
      const issue = bp > bc ? "victoire" : bp === bc ? "nul" : "defaite";
      const all = (m.compositions ?? []).filter((c) => (c as any).cote === (dom ? "dom" : "ext"));
      return {
        m, dom, pts, diff: bp - bc,
        titulaires: all.filter((c) => c.titulaire),
        bancs: all.filter((c) => !c.titulaire),
        issue,
      };
    });

    /* ============ Contexte : equipe, saison, poule, classement ============ */
    const plusFrequent = <T,>(xs: (T | null | undefined)[]): T | null => {
      const c = new Map<T, number>();
      for (const x of xs) if (x != null) c.set(x, (c.get(x) ?? 0) + 1);
      return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    };
    const equipeRefId = portee.equipeId
      ?? plusFrequent(infos.map((i) => (i.dom ? i.m.equipeDomId : i.m.equipeExtId)));
    const equipeRef = equipeRefId ? await this.equipesRepo.findOne({ where: { id: equipeRefId } }) : null;
    const saisonId = portee.saisonId ?? equipeRef?.saisonId ?? plusFrequent(infos.map((i) => i.m.saisonId));
    const saison = saisonId ? await this.saisonsRepo.findOne({ where: { id: saisonId } }) : null;
    // Rang de chaque equipe du championnat (pour situer les adversaires : haut / milieu / bas).
    const equipesPoule = equipeRef ? await this.equipesDuChampionnat(equipeRef) : [];
    const lignesPoule = equipesPoule.length === 0 ? [] : await this.classementRepo.find({
      where: { equipeId: In(equipesPoule.map((e) => e.id)) },
    });
    const rangParEquipe = new Map(lignesPoule.map((l) => [l.equipeId, l.rang]));
    const rangParClub = new Map(lignesPoule.map((l) => [l.clubId, l.rang]));

    /* ============ Impact par joueur ============ */
    // Pour chaque joueur connu de la base, on calcule ppm avec vs sans.
    // Definition "avec" : titulaire ou rentre en cours (donc dans la compo).
    const totalMatchs = infos.length;
    const impacts: ImpactJoueur[] = joueurs.map((j) => {
      const matchsAvec: MatchInfo[] = [];
      const matchsSans: MatchInfo[] = [];
      let titu = 0;
      for (const info of infos) {
        const present = [...info.titulaires, ...info.bancs].some(
          (c) => norm(c.nom) === norm(j.nom) &&
            (c.prenom ? norm(c.prenom) === norm(j.prenom) : true),
        );
        if (present) {
          matchsAvec.push(info);
          if (info.titulaires.some((c) => norm(c.nom) === norm(j.nom))) titu++;
        } else {
          matchsSans.push(info);
        }
      }
      const ppmA = matchsAvec.length ? avg(matchsAvec.map((i) => i.pts)) : 0;
      const ppmS = matchsSans.length ? avg(matchsSans.map((i) => i.pts)) : 0;
      const diffA = matchsAvec.length ? avg(matchsAvec.map((i) => i.diff)) : 0;
      const diffS = matchsSans.length ? avg(matchsSans.map((i) => i.diff)) : 0;
      const delta = ppmA - ppmS;
      // Confiance = min(matchsAvec, matchsSans) / 3, capee a 1. Un joueur
      // qui a joue 1 match a une confiance 0.33, 3 matchs -> 1.0.
      const conf = Math.min(1, Math.min(matchsAvec.length, matchsSans.length) / 3);
      // L'impact pondere prend en compte le volume de participation : un
      // joueur qui n'a joue qu'un match (meme victorieux) ne ressortira pas
      // au top, alors qu'un titulaire regulier oui.
      const participation = totalMatchs > 0 ? matchsAvec.length / totalMatchs : 0;
      const impactPondere = +(delta * conf * Math.sqrt(participation) * 10).toFixed(2);
      return {
        joueurId: j.id, nom: j.nom, prenom: j.prenom, poste: j.poste,
        matchsAvec: matchsAvec.length, matchsSans: matchsSans.length,
        pointsParMatchAvec: +ppmA.toFixed(2),
        pointsParMatchSans: +ppmS.toFixed(2),
        delta: +delta.toFixed(2),
        impactPondere,
        diffParMatchAvec: +diffA.toFixed(2),
        diffParMatchSans: +diffS.toFixed(2),
        titularisations: titu,
      };
    });
    // Joueurs cles : il faut avoir joue AU MOINS LA MOITIE des matchs,
    // avoir un impact positif, et au moins 1 match sans pour avoir une
    // base de comparaison.
    const seuilCles = Math.max(1, Math.ceil(totalMatchs / 2));
    const joueursCles = [...impacts]
      .filter((i) => i.matchsAvec >= seuilCles && i.matchsSans >= 1 && i.impactPondere > 0)
      .sort((a, b) => b.impactPondere - a.impactPondere)
      .slice(0, 5);
    // Maillons faibles : titulaires reguliers (>= moitie des matchs) dont
    // l'equipe perd des points quand ils sont la (impact pondere negatif).
    const impactsFaibles = [...impacts]
      .filter((i) => i.matchsAvec >= seuilCles && i.matchsSans >= 1 && i.impactPondere < 0)
      .sort((a, b) => a.impactPondere - b.impactPondere)
      .slice(0, 5);
    // Les joueurs du club absents de tous les matchs du perimetre n'ont rien a faire dans le tableau.
    impacts.splice(0, impacts.length, ...impacts.filter((i) => i.matchsAvec > 0));
    impacts.sort((a, b) => b.impactPondere - a.impactPondere);

    /* ============ Stabilite (rotations) ============ */
    // Pour chaque poste : combien de joueurs differents l'ont occupe
    // (matchs ou poste joue / nb joueurs distincts).
    type LigneStat = { ligne: string; effectifUtilise: number; rotations: number; stabilite: number };
    const groupes: Record<string, Set<string>> = { GB: new Set(), DEF: new Set(), MIL: new Set(), ATT: new Set() };
    const rotations: Record<string, number> = { GB: 0, DEF: 0, MIL: 0, ATT: 0 };
    // On compte combien de fois on a vu une "nouvelle face" sur la ligne
    // d'un match a l'autre.
    let prevTitu: Record<string, Set<string>> | null = null;
    // Dates en jj/mm/aaaa : trier les chaines melangeait les mois (15/03 avant 27/09).
    const infosChrono = trierChronologiquement(infos.map((i) => ({ i, date: i.m.date ?? null, journee: i.m.journee ?? null })))
      .map((x) => x.i);
    for (const info of infosChrono) {
      const titParLigne: Record<string, Set<string>> = { GB: new Set(), DEF: new Set(), MIL: new Set(), ATT: new Set() };
      for (const c of info.titulaires) {
        const k = norm(`${c.nom} ${c.prenom ?? ""}`);
        // On essaie de remonter au joueur officiel via le nom pour avoir son poste.
        const joueur = joueurs.find(
          (j) => norm(j.nom) === norm(c.nom) && (c.prenom ? norm(j.prenom) === norm(c.prenom) : true),
        );
        const lig = ligneOf(joueur?.poste);
        titParLigne[lig].add(k);
        groupes[lig].add(k);
      }
      if (prevTitu) {
        for (const lig of Object.keys(titParLigne)) {
          for (const id of titParLigne[lig]) {
            if (!prevTitu[lig].has(id)) rotations[lig]++;
          }
        }
      }
      prevTitu = titParLigne;
    }
    const totalTitMatchs = infos.length;
    const stabPerLigne: LigneStat[] = Object.keys(groupes).map((lig) => {
      const nbDistincts = groupes[lig].size;
      const totalRot = rotations[lig];
      // Stabilite : combien la composition est inchangee d'un match a
      // l'autre. Mesure normalisee par le nombre de matchs analyses.
      //
      // Le nombre maximal de "nouvelles faces" possibles = postes par ligne
      // × (matchs - 1) — c'est le pire cas absolu. On compare a ca.
      const postesParLigne =
        lig === "GB" ? 1 : lig === "ATT" ? 3 : lig === "DEF" ? 4 : 4;
      const maxRotations = postesParLigne * Math.max(1, totalTitMatchs - 1);
      const tauxRotation = maxRotations > 0 ? totalRot / maxRotations : 0;
      // Stabilite : 100 = jamais aucun changement. On utilise une echelle
      // douce : taux 0% -> 100, taux 30% -> 60, taux 60% -> 20.
      const stabilite = clamp(100 - tauxRotation * 130, 0, 100);
      return {
        ligne: lig, effectifUtilise: nbDistincts, rotations: totalRot,
        stabilite: Math.round(stabilite),
      };
    });
    const stabGlobal = Math.round(avg(stabPerLigne.map((s) => s.stabilite)));

    /* ============ Faiblesses ============ */
    const faiblesses: Faiblesse[] = [];
    // 1) Une ligne tres instable : stabilite < 40 sur >= 4 matchs.
    for (const s of stabPerLigne) {
      if (totalTitMatchs >= 4 && s.stabilite < 40) {
        faiblesses.push({
          niveau: "alerte",
          titre: `Ligne ${labelLigne(s.ligne)} instable`,
          detail: `Stabilite ${s.stabilite}/100 — ${s.effectifUtilise} joueurs differents utilises pour ${totalTitMatchs} matchs, ${s.rotations} changements de face. Suggere un manque de titulaire fixe sur ce secteur.`,
        });
      }
    }
    // 2) Bilan a domicile / exterieur deficitaire
    const matchsDom = infos.filter((i) => i.dom);
    const matchsExt = infos.filter((i) => !i.dom);
    const ppmDom = avg(matchsDom.map((i) => i.pts));
    const ppmExt = avg(matchsExt.map((i) => i.pts));
    if (matchsDom.length >= 3 && ppmDom < 1.0) {
      faiblesses.push({
        niveau: "critique",
        titre: "Performance a domicile faible",
        detail: `Seulement ${ppmDom.toFixed(2)} pts/match a domicile sur ${matchsDom.length} reception(s).`,
      });
    }
    if (matchsExt.length >= 3 && ppmExt < 0.8) {
      faiblesses.push({
        niveau: "alerte",
        titre: "Difficultes a l'exterieur",
        detail: `${ppmExt.toFixed(2)} pts/match en deplacement sur ${matchsExt.length} match(s).`,
      });
    }
    // 3) Surdependance a un joueur (delta tres eleve)
    const dependance = impacts.find(
      (i) => i.matchsSans >= 2 && i.matchsAvec >= 3 && i.delta >= 1.5,
    );
    if (dependance) {
      faiblesses.push({
        niveau: "alerte",
        titre: `Forte dependance a ${dependance.prenom ?? ""} ${dependance.nom}`,
        detail: `Sans lui : ${dependance.pointsParMatchSans.toFixed(2)} pts/match. Avec lui : ${dependance.pointsParMatchAvec.toFixed(2)} pts/match. Ecart ${dependance.delta.toFixed(2)} pts.`,
      });
    }
    // 4) Faible attaque / defense
    const bpAvg = avg(matchsClub.map((m) => m.clubDom === clubId ? m.scoreDom : m.scoreExt));
    const bcAvg = avg(matchsClub.map((m) => m.clubDom === clubId ? m.scoreExt : m.scoreDom));
    if (totalTitMatchs >= 3 && bpAvg < 1.0) {
      faiblesses.push({
        niveau: "alerte",
        titre: "Manque d'efficacite offensive",
        detail: `Moyenne de ${bpAvg.toFixed(2)} but(s) marque(s) par match.`,
      });
    }
    if (totalTitMatchs >= 3 && bcAvg > 2.0) {
      faiblesses.push({
        niveau: "alerte",
        titre: "Defense permeable",
        detail: `${bcAvg.toFixed(2)} but(s) encaisse(s) par match.`,
      });
    }
    // 5) Position particuliere instable : si un meme dossard (numero) est
    //    porte par >= 3 joueurs differents
    const dossardOccup: Record<number, Set<string>> = {};
    for (const info of infos) {
      for (const c of info.titulaires) {
        if (c.numero == null) continue;
        if (!dossardOccup[c.numero]) dossardOccup[c.numero] = new Set();
        dossardOccup[c.numero].add(norm(c.nom));
      }
    }
    for (const [num, set] of Object.entries(dossardOccup)) {
      // On flag uniquement si l'instabilite est forte : un nouveau joueur
      // tous les 4 matchs ou moins. Sur 4 matchs : >=2 differents. Sur 20
      // matchs : >=5 differents. Au moins 4 matchs analyses pour activer.
      const seuil = Math.max(2, Math.ceil(totalTitMatchs / 4));
      if (set.size >= seuil && totalTitMatchs >= 4) {
        faiblesses.push({
          niveau: "info",
          titre: `Numero ${num} : pas de titulaire fixe`,
          detail: `${set.size} joueurs differents ont porte ce numero comme titulaire sur ${totalTitMatchs} matchs — peut-etre une zone d'incertitude.`,
        });
      }
    }

    /* ============ Compo probable ============ */
    // Pour chaque poste theorique, prendre le joueur qui y a ete le plus
    // souvent titulaire.
    type PosteScore = { poste: string; numero?: number; nom: string; matchsJoues: number };
    const titsParJoueur = new Map<string, { poste: string; numero?: number; nom: string; titularisations: number }>();
    for (const info of infos) {
      for (const c of info.titulaires) {
        const k = norm(`${c.nom}-${c.prenom ?? ""}`);
        const j = joueurs.find(
          (j) => norm(j.nom) === norm(c.nom) && (c.prenom ? norm(j.prenom) === norm(c.prenom) : true),
        );
        const cur = titsParJoueur.get(k) ?? {
          poste: j?.poste ?? "MIL",
          numero: j?.numeroFavori ?? c.numero, nom: `${c.prenom ?? ""} ${c.nom}`.trim(),
          titularisations: 0,
        };
        cur.titularisations++;
        titsParJoueur.set(k, cur);
      }
    }
    // On prend les 11 plus titularises tous postes confondus (simplification).
    const compoProbable: PosteScore[] = [...titsParJoueur.values()]
      .sort((a, b) => b.titularisations - a.titularisations)
      .slice(0, 11)
      .map((j) => ({ poste: j.poste, numero: j.numero, nom: j.nom, matchsJoues: j.titularisations }));

    /* ============ Partnerships ============ */
    // Pour chaque match, on identifie un trio defense (3 DEF), un duo
    // milieu axial, une attaque. On agrege les resultats des trios.
    type Combo = { type: "defense" | "milieu" | "attaque"; key: string; noms: string[]; v: number; n: number; d: number; bp: number; bc: number };
    const combos = new Map<string, Combo>();
    function add(type: Combo["type"], noms: string[], info: MatchInfo) {
      if (noms.length < 2) return;
      const sorted = [...noms].sort();
      const key = `${type}:${sorted.join("|")}`;
      const cur = combos.get(key) ?? { type, key, noms: sorted, v: 0, n: 0, d: 0, bp: 0, bc: 0 };
      if (info.issue === "victoire") cur.v++;
      else if (info.issue === "nul") cur.n++;
      else cur.d++;
      cur.bp += info.dom ? info.m.scoreDom : info.m.scoreExt;
      cur.bc += info.dom ? info.m.scoreExt : info.m.scoreDom;
      combos.set(key, cur);
    }
    for (const info of infos) {
      const titsParLigne: Record<string, string[]> = { GB: [], DEF: [], MIL: [], ATT: [] };
      for (const c of info.titulaires) {
        const j = joueurs.find((j) => norm(j.nom) === norm(c.nom));
        titsParLigne[ligneOf(j?.poste)].push(c.nom);
      }
      add("defense", titsParLigne.DEF, info);
      add("milieu", titsParLigne.MIL, info);
      add("attaque", titsParLigne.ATT, info);
    }
    const partnerships: Partnership[] = [...combos.values()]
      .map((c) => {
        const total = c.v + c.n + c.d;
        return {
          type: c.type, joueurs: c.noms,
          matchsEnsemble: total, v: c.v, n: c.n, d: c.d,
          bp: c.bp, bc: c.bc,
          txReussite: total ? Math.round((c.v / total) * 100) : 0,
        };
      })
      .filter((p) => p.matchsEnsemble >= 2)
      .sort((a, b) => b.txReussite - a.txReussite || b.matchsEnsemble - a.matchsEnsemble)
      .slice(0, 12);

    /* ============ Minute moyenne des changements ============ */
    const minutesChgts: number[] = [];
    const parTypeMatch: Record<string, number[]> = { victoire: [], nul: [], defaite: [] };
    let chgtsAvant60 = 0;
    for (const info of infos) {
      for (const e of info.m.evenements ?? []) {
        if (e.type !== "remplacement") continue;
        // On regarde si c'est SON club (cote dom/ext correspond).
        const cote = (e as any).equipe;
        if ((info.dom && cote !== "dom") || (!info.dom && cote !== "ext")) continue;
        if (e.minute == null) continue;
        minutesChgts.push(e.minute);
        parTypeMatch[info.issue].push(e.minute);
        if (e.minute < 60) chgtsAvant60++;
      }
    }
    const changementsMoy = {
      moyenne: minutesChgts.length ? +avg(minutesChgts).toFixed(1) : 0,
      parTypeMatch: (["victoire", "nul", "defaite"] as const).map((t) => ({
        type: t,
        moyenne: parTypeMatch[t].length ? +avg(parTypeMatch[t]).toFixed(1) : 0,
        nbChangements: parTypeMatch[t].length,
      })),
      nbChangementsAvant60: chgtsAvant60,
    };

    /* ============ Score de danger ============ */
    // Combinaison de : buts marques, stabilite, forme des titulaires types.
    const titulairesPresumes = compoProbable
      .map((c) => joueurs.find((j) =>
        norm(`${j.prenom ?? ""} ${j.nom}`.trim()) === norm(c.nom),
      ))
      .filter(Boolean) as Joueur[];
    // La forme (scoreForme) est une mesure du moment : sur une saison passee ou a venir elle
    // n'a pas de sens, on ne la montre pas et elle ne pese pas dans le score de danger.
    const formeMoy = saison?.actif
      ? +avg(titulairesPresumes.map((j) => j.scoreForme ?? 50)).toFixed(0)
      : null;
    const scoreDanger = Math.round(clamp(
      40
      + bpAvg * 15            // attaque qui marque
      + (stabGlobal - 50) * 0.3
      + ((formeMoy ?? 50) - 50) * 0.4
      - bcAvg * 5              // defense qui encaisse penalise
      + matchsClub.filter((m) => {
          const bp = m.clubDom === clubId ? m.scoreDom : m.scoreExt;
          const bc = m.clubDom === clubId ? m.scoreExt : m.scoreDom;
          return bp > bc;
        }).length * 2,
      0, 100,
    ));

    /* ============ Score de chaos ============ */
    // Toutes les composantes sont desormais ramenees a une echelle 0..100
    // avant d'etre pondereees. Plus de saturation involontaire a 100.
    const ptsSerie = infos.map((i) => i.pts);
    const ecartType = stdDev(ptsSerie);
    // ecart-type max theorique des points (entre 0/3) ~= 1.5, donc on
    // normalise sur 1.5 pour avoir un score 0..100.
    const composanteIrregularite = clamp((ecartType / 1.5) * 100, 0, 100);
    // Instabilite globale = 100 - stabilite.
    const composanteInstabilite = 100 - stabGlobal;
    // Changements precoces : ratio sur le total des changements (et non
    // sur les matchs, qui faisait exploser le score).
    const totalChgts = matchsClub.reduce(
      (s, m) => s + (m.evenements ?? []).filter((e) => e.type === "remplacement").length, 0,
    );
    const composanteChangementsTot = totalChgts > 0
      ? clamp((changementsMoy.nbChangementsAvant60 / totalChgts) * 100, 0, 100)
      : 0;
    const scoreChaos = Math.round(clamp(
      composanteInstabilite * 0.45
      + composanteIrregularite * 0.35
      + composanteChangementsTot * 0.20,
      0, 100,
    ));

    /* ============ Stats coachs ============ */
    // On charge les staff_matchs pour les matchs du club, et on agrege par
    // coach les V/N/D et fonctions.
    const matchIds = new Set(matchsClub.map((m) => m.id));
    const allStaffMatchs = matchIds.size === 0 ? [] : await this.staffMatchsRepo.find({
      where: { matchId: In([...matchIds]) }, relations: ["coach"],
    });
    type CoachAcc = {
      coachId: string; nom: string; prenom?: string; licence?: string;
      matchsPresent: number; v: number; n: number; d: number;
      cartonsJaunes: number; cartonsRouges: number;
      fonctionsCounts: Record<string, number>; categorie: string | null;
      premierMatch: string | null; dernierMatch: string | null;
    };
    const coachsAcc = new Map<string, CoachAcc>();
    for (const sm of allStaffMatchs) {
      if (!matchIds.has(sm.matchId)) continue;
      const m = matchsClub.find((x) => x.id === sm.matchId);
      if (!m) continue;
      const isThisClub = (sm.cote === "dom" && m.clubDom === clubId)
        || (sm.cote === "ext" && m.clubExt === clubId);
      if (!isThisClub) continue;
      const fonctions = (sm.fonctions ?? "").split("/").map((f) => f.trim().toUpperCase());
      const fctValides = fonctions.filter((f) => f && f !== "DR");
      if (fctValides.length === 0) continue;
      const cur = coachsAcc.get(sm.coachId) ?? {
        coachId: sm.coachId,
        nom: sm.coach?.nom ?? "", prenom: sm.coach?.prenom, licence: sm.coach?.licence,
        matchsPresent: 0, v: 0, n: 0, d: 0,
        cartonsJaunes: sm.coach?.cartonsJaunes ?? 0,
        cartonsRouges: sm.coach?.cartonsRouges ?? 0,
        fonctionsCounts: {}, categorie: sm.coach?.categorie ?? null,
        premierMatch: null, dernierMatch: null,
      };
      cur.matchsPresent++;
      for (const f of fctValides) {
        cur.fonctionsCounts[f] = (cur.fonctionsCounts[f] ?? 0) + 1;
      }
      const bp = sm.cote === "dom" ? m.scoreDom : m.scoreExt;
      const bc = sm.cote === "dom" ? m.scoreExt : m.scoreDom;
      if (bp > bc) cur.v++;
      else if (bp < bc) cur.d++;
      else cur.n++;
      if (m.date) {
        if (!cur.premierMatch || m.date < cur.premierMatch) cur.premierMatch = m.date;
        if (!cur.dernierMatch || m.date > cur.dernierMatch) cur.dernierMatch = m.date;
      }
      coachsAcc.set(sm.coachId, cur);
    }
    const coachsStats = [...coachsAcc.values()].map((c) => {
      const total = c.v + c.n + c.d;
      const fctMaj = Object.entries(c.fonctionsCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
      const fctLabel: Record<string, string> = {
        E: "Entraineur", A: "Adjoint", M: "Medecin", D: "Dirigeant",
      };
      return {
        coachId: c.coachId, nom: c.nom, prenom: c.prenom, licence: c.licence,
        matchsPresent: c.matchsPresent, v: c.v, n: c.n, d: c.d,
        txReussite: total ? Math.round((c.v / total) * 100) : 0,
        cartonsJaunes: c.cartonsJaunes, cartonsRouges: c.cartonsRouges,
        fonctions: Object.entries(c.fonctionsCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([f, n]) => `${f} (${n})`).join(" · "),
        fonctionPrincipale: fctMaj ? (fctLabel[fctMaj] ?? fctMaj) : null,
        premierMatch: c.premierMatch, dernierMatch: c.dernierMatch,
      };
    }).sort((a, b) => b.matchsPresent - a.matchsPresent);

    // Detection des changements de coach E sur ce club, par ordre chrono.
    // Un changement est confirme UNIQUEMENT si le nouveau coach reste au
    // moins 2 matchs consecutifs (sinon : absence ponctuelle = pas un
    // changement, par exemple s'il etait suspendu ou absent ce jour-la).
    const matchsChrono = trierChronologiquement(
      matchsClub.map((m) => ({ m, date: m.date ?? null, journee: m.journee ?? null })),
    ).map((x) => x.m);
    const staffByMatch = new Map<string, StaffMatch[]>();
    for (const sm of allStaffMatchs) {
      if (!staffByMatch.has(sm.matchId)) staffByMatch.set(sm.matchId, []);
      staffByMatch.get(sm.matchId)!.push(sm);
    }
    // Construire d'abord la liste chronologique des coachs E par match.
    const coachsEParMatch = matchsChrono.map((m) => {
      const cote: "dom" | "ext" = m.clubDom === clubId ? "dom" : "ext";
      const staff = (staffByMatch.get(m.id) ?? []).filter((sm) => sm.cote === cote);
      const principal = staff.find((sm) =>
        (sm.fonctions ?? "").split("/").map((s) => s.trim().toUpperCase()).includes("E"),
      );
      const nom = principal
        ? `${principal.coach?.prenom ?? ""} ${principal.coach?.nom ?? ""}`.trim()
        : null;
      return { match: m, coach: nom };
    });

    const changementsCoach: { date: string; journee?: string; avant: string; apres: string }[] = [];
    let prevCoachE: string | null = null;
    for (let i = 0; i < coachsEParMatch.length; i++) {
      const { match, coach } = coachsEParMatch[i];
      // On ignore les matchs sans coach E identifie (donnee manquante).
      if (!coach) continue;
      if (prevCoachE && coach !== prevCoachE) {
        // Verifier que le nouveau coach reste au moins 2 matchs consecutifs
        // a partir d'ici (= ce match + le suivant non-null qui doit etre
        // le meme coach). Sinon c'est une absence ponctuelle, pas un
        // changement.
        let consecutifs = 1;
        for (let j = i + 1; j < coachsEParMatch.length; j++) {
          const next = coachsEParMatch[j].coach;
          if (next == null) continue;             // donnee manquante, on saute
          if (next === coach) consecutifs++;
          break;                                  // on s'arrete au 1er coach E identifie suivant
        }
        if (consecutifs >= 2) {
          changementsCoach.push({
            date: match.date ?? "—", journee: match.journee ?? undefined,
            avant: prevCoachE, apres: coach,
          });
          prevCoachE = coach;
        }
        // Si pas 2 consecutifs : on ne met PAS a jour prevCoachE, c'est
        // une absence ponctuelle (le titulaire reviendra).
      } else if (!prevCoachE) {
        // Premier coach identifie : on initialise la reference sans
        // enregistrer un changement (c'est le coach de depart).
        prevCoachE = coach;
      }
    }

    /* ============ Tendances ============ */
    const matchsTendance: MatchTendance[] = infosChrono.map((info) => {
      const m = info.m;
      const moi = info.dom ? "dom" : "ext";
      const evts = m.evenements ?? [];
      const miens = evts.filter((e) => (e as any).equipe === moi);
      const cartons = miens.filter((e) => e.type === "carton");
      const minutesDes = (liste: EvenementMatch[]) => liste.filter((e) => e.minute != null).map((e) => e.minute);
      const butsDe = (cote: string) => evts.filter((e) => e.type === "but" && e.sousType !== "csc" && (e as any).equipe === cote);
      return {
        matchId: m.id, date: m.date ?? null, journee: m.journee ?? null,
        domicile: info.dom,
        adversaireId: info.dom ? m.clubExt : m.clubDom,
        adversaireEquipeId: (info.dom ? m.equipeExtId : m.equipeDomId) ?? null,
        bp: info.dom ? m.scoreDom : m.scoreExt,
        bc: info.dom ? m.scoreExt : m.scoreDom,
        cartonsJaunes: cartons.filter((e) => e.sousType === "jaune").length,
        cartonsRouges: cartons.filter((e) => e.sousType === "rouge" || e.sousType === "double_jaune").length,
        minutesCartons: minutesDes(cartons),
        minutesButsPour: minutesDes(butsDe(moi)),
        minutesButsContre: minutesDes(butsDe(info.dom ? "ext" : "dom")),
        titulaires: info.titulaires.length ? info.titulaires.map((c) => norm(`${c.nom} ${c.prenom ?? ""}`)) : null,
      };
    });
    const tendances = calculerTendances(matchsTendance, {
      nbEquipes: lignesPoule.length,
      rangDe: (m) => (m.adversaireEquipeId ? rangParEquipe.get(m.adversaireEquipeId) : undefined)
        ?? (m.adversaireId ? rangParClub.get(m.adversaireId) : undefined) ?? null,
    });

    return {
      clubId, clubNom: club.nom, matchsAnalyses: totalTitMatchs,
      scoreDanger, scoreChaos, formeMoy,
      perimetre: {
        equipeId: equipeRef?.id ?? null, equipeNom: equipeRef?.nom ?? null,
        saisonId: saison?.id ?? null, saisonNom: saison?.nom ?? null, saisonActive: !!saison?.actif,
        competition: equipeRef?.competitionLibelle ?? null, poule: equipeRef?.poule ?? null,
      },
      tendances,
      impacts: impacts.slice(0, 30),
      joueursCles,
      impactsFaibles,
      stabilite: { global: stabGlobal, parLigne: stabPerLigne },
      faiblesses,
      compoProbable,
      partnerships,
      changementsMoy,
      coachs: coachsStats,
      changementsCoach,
    };
  }

  /** Equipes du meme championnat (saison + competition + poule). */
  private equipesDuChampionnat(e: Equipe): Promise<Equipe[]> {
    return this.equipesRepo.find({
      where: {
        saisonId: e.saisonId ? e.saisonId : IsNull(),
        competitionLibelle: e.competitionLibelle ? e.competitionLibelle : IsNull(),
        poule: e.poule ? e.poule : IsNull(),
      },
    });
  }

  /**
   * Dynamique de TOUTES les equipes du championnat de l'equipe donnee : forme recente
   * contre le reste de la saison, serie en cours, sens de l'attaque et de la defense.
   * Sert a voir d'un coup d'oeil qui monte et qui descend dans la poule (scouting).
   * Calcule sur les scores seuls : pas de feuille de match a charger.
   */
  async dynamiquePoule(equipeId: string) {
    const ref = await this.equipesRepo.findOne({ where: { id: equipeId } });
    if (!ref) throw new NotFoundException(`Equipe ${equipeId} introuvable`);
    const equipes = await this.equipesDuChampionnat(ref);
    const ids = equipes.map((e) => e.id);
    const [matchs, lignes] = await Promise.all([
      this.matchs.find({ where: [{ equipeDomId: In(ids) }, { equipeExtId: In(ids) }] }),
      this.classementRepo.find({ where: { equipeId: In(ids) } }),
    ]);
    const ligneDe = new Map(lignes.map((l) => [l.equipeId, l]));

    const lignesSortie: DynamiqueEquipe[] = [];
    for (const eq of equipes) {
      const siens = matchs
        .filter((m) => (m as any).statut !== "annule" && (m as any).statut !== "reporte")
        .filter((m) => m.equipeDomId === eq.id || m.equipeExtId === eq.id)
        .map((m): MatchTendance => {
          const dom = m.equipeDomId === eq.id;
          return {
            matchId: m.id, date: m.date ?? null, journee: m.journee ?? null, domicile: dom,
            adversaireId: dom ? m.clubExt : m.clubDom, adversaireEquipeId: dom ? m.equipeExtId : m.equipeDomId,
            bp: dom ? m.scoreDom : m.scoreExt, bc: dom ? m.scoreExt : m.scoreDom,
            cartonsJaunes: 0, cartonsRouges: 0, minutesCartons: [], minutesButsPour: [], minutesButsContre: [], titulaires: null,
          };
        });
      if (siens.length === 0) continue;
      const ordonnes = trierChronologiquement(siens);
      const f = dynamiqueForme(ordonnes);
      const s = seriesDe(ordonnes).enCours[0];
      const l = ligneDe.get(eq.id);
      lignesSortie.push({
        equipeId: eq.id, clubId: eq.clubId, nom: eq.nom,
        rang: l?.rang ?? null, pts: l?.pts ?? null, joues: ordonnes.length,
        formeRecente: ordonnes.slice(-5).map((m) => issueDe(m.bp, m.bc)),
        ppmSaison: f.saison.ppm, ppmRecent: f.sens === "insuffisant" ? f.saison.ppm : f.recente.ppm,
        ecartPpm: f.ecartPpm, sens: f.sens, attaque: f.attaque, defense: f.defense,
        score: f.score, libelle: f.libelle,
        serie: s ? { type: s.type, longueur: s.longueur } : null,
      });
    }
    // Classement d'abord, puis les equipes sans rang par points par match.
    lignesSortie.sort((a, b) => (a.rang ?? 99) - (b.rang ?? 99) || b.ppmSaison - a.ppmSaison);
    return {
      equipeId: ref.id, saisonId: ref.saisonId ?? null,
      competition: ref.competitionLibelle ?? null, poule: ref.poule ?? null,
      equipes: lignesSortie,
    };
  }
}

/** Une ligne de la dynamique de poule. */
export interface DynamiqueEquipe {
  equipeId: string;
  clubId: string;
  nom: string;
  rang: number | null;
  pts: number | null;
  joues: number;
  /** 5 derniers resultats, du plus ancien au plus recent. */
  formeRecente: Issue[];
  ppmSaison: number;
  ppmRecent: number;
  ecartPpm: number;
  sens: SensTendance;
  attaque: SensTendance;
  defense: SensTendance;
  score: number | null;
  libelle: string;
  serie: { type: string; longueur: number } | null;
}

function labelLigne(l: string): string {
  return l === "GB" ? "gardiens"
    : l === "DEF" ? "defensive"
    : l === "MIL" ? "milieu"
    : "offensive";
}

@Controller("analyse")
class AnalyseController {
  constructor(private svc: AnalyseService) {}
  @Get("club/:clubId")
  rapport(
    @Param("clubId") clubId: string,
    @Query("equipeId") equipeId?: string,
    @Query("saisonId") saisonId?: string,
  ) {
    return this.svc.rapportClub(clubId, { equipeId: equipeId || undefined, saisonId: saisonId || undefined });
  }

  /** Dynamique de toutes les equipes du championnat de `equipeId`. */
  @Get("poule")
  poule(@Query("equipeId") equipeId: string) {
    return this.svc.dynamiquePoule(equipeId);
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Club, Match, Joueur, Composition, EvenementMatch, Entrainement,
      Coach, StaffMatch, Equipe, LigneClassement, Saison,
    ]),
  ],
  controllers: [AnalyseController],
  providers: [AnalyseService],
  exports: [AnalyseService],
})
export class AnalyseModule {}
