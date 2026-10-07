// src/features/ia/ia-donnees.ts
//
// DONNEES D'ENTRAINEMENT : toutes les feuilles de match (FMI) de la base, classees par date et regroupees par semaine.
//
// Chaque match donne DEUX feuilles d'equipe (celle des recevants, celle des visiteurs). Une equipe est identifiee d'une
// saison a l'autre (club + categorie, et division quand un club aligne plusieurs equipes : la poule change d'une saison a l'autre), pour que le
// premier match d'une saison puisse s'appuyer sur la fin de la precedente. Les semaines jouent le role des "journees" :
// toutes les rencontres d'un meme week-end forment une etape, que l'entrainement prediit d'un bloc avant de la decouvrir.
// Fonctions pures.

import { parseDateFlexible } from "@/common/dates";
import { normaliser } from "@/common/fuzzy";
import { lignesDeFeuille } from "@/features/analyse/compo-numeros";
import { estMatchJoue } from "@/features/matchs/match-joue";
import { systemesRenseignes } from "@/features/matchs/systeme";

const JOUR = 86_400_000;

/** Un joueur sur une feuille d'equipe. */
export interface LigneJoueur {
  /** Cle stable : licence, sinon nom normalise (les feuilles ne portent pas d'identifiant joueur). */
  joueur: string;
  nom: string;
  numero: number;
  titulaire: boolean;
  minutes: number;
}

/** La feuille d'UNE equipe sur UN match. */
export interface FeuilleEquipe {
  matchId: string;
  /** Identite de l'equipe, stable d'une saison a l'autre. */
  equipe: string;
  libelleEquipe: string;
  adversaire: string;
  date: string;
  /** Date en millisecondes (UTC), pour l'ordre. */
  temps: number;
  journee: string | null;
  saisonId: string | null;
  domicile: boolean;
  lignes: LigneJoueur[];
  /** Le dispositif SAISI par le staff pour cette equipe sur ce match (jamais une valeur par defaut), sinon null. */
  formation: string | null;
}

/** Une semaine de matchs : le modele la predit en entier avant de la decouvrir. */
export interface Etape {
  indice: number;
  /** Lundi de la semaine (ms UTC). */
  debut: number;
  libelle: string;
  /** Les journees de championnat qui s'y jouent le plus ("J7"), pour s'y retrouver. */
  journees: string;
  feuilles: FeuilleEquipe[];
}

export interface ResumeDonnees {
  matchsLus: number;
  feuilles: number;
  etapes: number;
  equipes: number;
  premiere: string | null;
  derniere: string | null;
  /** Lundi (ms UTC) de la derniere semaine de matchs : tout ce qui est apres est "nouveau" pour ce jeu de donnees. */
  derniereSemaine: number | null;
  saisons: string[];
  /** Ce qui n'a pas pu servir, et pourquoi. */
  ecartes: { sansDate: number; sansFeuille: number; feuilleIncomplete: number; horsSaison: number };
}

export interface JeuDonnees { feuilles: FeuilleEquipe[]; etapes: Etape[]; resume: ResumeDonnees }

export interface EntreesDonnees {
  matchs: {
    id: string; date?: string | null; journee?: string | null; saisonId?: string | null; competition?: string | null;
    clubDom: string; clubExt: string; equipeDomId?: string | null; equipeExtId?: string | null;
    formationDom?: string | null; formationExt?: string | null; statut?: string | null;
  }[];
  equipes: { id: string; clubId: string; categorie?: string | null; division?: string | null; nom: string; saisonId?: string | null }[];
  clubs: { id: string; nom: string }[];
  compos: { matchId: string; cote: "dom" | "ext"; nom: string; prenom?: string | null; licence?: string | null; numero: number; titulaire: boolean; minutes?: number | null }[];
  /** Restreint l'entrainement a ces saisons (toutes si absent ou vide). */
  saisonIds?: string[];
}

type EquipeLue = EntreesDonnees["equipes"][number];

/** Les (club, categorie) qui alignent plusieurs equipes la meme saison : il faut alors les distinguer (division, nom). */
function categoriesMultiples(equipes: readonly EquipeLue[]): Set<string> {
  const parSaison = new Map<string, Set<string>>();
  for (const e of equipes) {
    const k = `${e.clubId}|${normaliser(e.categorie)}|${e.saisonId ?? ""}`;
    (parSaison.get(k) ?? parSaison.set(k, new Set()).get(k)!).add(e.id);
  }
  return new Set([...parSaison].filter(([, ids]) => ids.size >= 2).map(([k]) => k.split("|").slice(0, 2).join("|")));
}

/**
 * Identite d'une equipe d'une saison a l'autre. Le nom d'une equipe porte sa division et sa poule ("Seniors R2 Poule C"),
 * qui changent avec les montees et les descentes : on s'en tient au club et a la categorie, sauf quand le club aligne
 * plusieurs equipes de la meme categorie, que l'on separe alors par division (a defaut par nom).
 */
function identiteEquipe(e: EquipeLue, multiples: ReadonlySet<string>): string {
  const base = `${e.clubId}|${normaliser(e.categorie)}`;
  return multiples.has(base) ? `${base}|${normaliser(e.division) || normaliser(e.nom)}` : base;
}

const dateFr = (t: number) => new Date(t).toISOString().slice(0, 10).split("-").reverse().join("/");

/** Le lundi (00 h UTC) de la semaine d'un instant. */
export function lundiDe(temps: number): number {
  const jourSemaine = (new Date(temps).getUTCDay() + 6) % 7;     // lundi = 0
  return Math.floor(temps / JOUR) * JOUR - jourSemaine * JOUR;
}

const numeroJournee = (j: string | null | undefined): number | null => {
  const n = parseInt((j ?? "").replace(/\D/g, ""), 10);
  return Number.isNaN(n) ? null : n;
};

export function construireJeuDonnees(entrees: EntreesDonnees): JeuDonnees {
  const equipes = new Map(entrees.equipes.map((e) => [e.id, e]));
  const clubs = new Map(entrees.clubs.map((c) => [c.id, c.nom]));
  const composParMatch = new Map<string, EntreesDonnees["compos"]>();
  for (const c of entrees.compos) (composParMatch.get(c.matchId) ?? composParMatch.set(c.matchId, []).get(c.matchId)!).push(c);
  const saisonsVoulues = entrees.saisonIds?.length ? new Set(entrees.saisonIds) : null;
  const multiples = categoriesMultiples(entrees.equipes);

  const ecartes = { sansDate: 0, sansFeuille: 0, feuilleIncomplete: 0, horsSaison: 0 };
  const feuilles: FeuilleEquipe[] = [];
  let matchsLus = 0;

  for (const m of entrees.matchs) {
    if (!estMatchJoue(m)) continue;
    if (saisonsVoulues && !(m.saisonId && saisonsVoulues.has(m.saisonId))) { ecartes.horsSaison++; continue; }
    const temps = parseDateFlexible(m.date);
    if (temps === null) { ecartes.sansDate++; continue; }
    const compos = composParMatch.get(m.id) ?? [];
    if (compos.length === 0) { ecartes.sansFeuille++; continue; }
    matchsLus++;
    const dispositifs = systemesRenseignes(m);

    for (const domicile of [true, false]) {
      const cote = domicile ? "dom" : "ext";
      const brutes = compos.filter((c) => c.cote === cote);
      const lues = lignesDeFeuille({ id: m.id, date: m.date, journee: m.journee }, brutes);
      // Un joueur n'apparait qu'une fois par feuille (deux homonymes sans licence : le premier).
      const vus = new Set<string>();
      const lignes: LigneJoueur[] = [];
      lues.forEach((l, i) => {
        if (vus.has(l.joueur)) return;
        vus.add(l.joueur);
        lignes.push({ joueur: l.joueur, nom: l.nom, numero: l.numero, titulaire: l.titulaire, minutes: Math.max(0, brutes[i].minutes ?? 0) });
      });
      if (lignes.filter((l) => l.titulaire).length !== 11) {
        if (lignes.length === 0) ecartes.sansFeuille++; else ecartes.feuilleIncomplete++;
        continue;
      }
      const clubId = domicile ? m.clubDom : m.clubExt;
      const adversaireId = domicile ? m.clubExt : m.clubDom;
      const equipe = equipes.get((domicile ? m.equipeDomId : m.equipeExtId) ?? "");
      const nomClub = clubs.get(clubId) ?? "Club inconnu";
      feuilles.push({
        matchId: m.id,
        equipe: equipe ? identiteEquipe(equipe, multiples) : `${clubId}|?|${normaliser(m.competition)}`,
        libelleEquipe: equipe ? `${nomClub} ${equipe.nom}`.trim() : nomClub,
        adversaire: clubs.get(adversaireId) ?? "Club inconnu",
        date: m.date!, temps, journee: m.journee ?? null, saisonId: m.saisonId ?? null, domicile, lignes,
        formation: domicile ? dispositifs.dom : dispositifs.ext,
      });
    }
  }

  // Ordre chronologique, deterministe : la date, la journee, puis l'identifiant (recevants avant visiteurs).
  feuilles.sort((a, b) => a.temps - b.temps
    || (numeroJournee(a.journee) ?? Infinity) - (numeroJournee(b.journee) ?? Infinity)
    || a.matchId.localeCompare(b.matchId) || Number(b.domicile) - Number(a.domicile));

  const parSemaine = new Map<number, FeuilleEquipe[]>();
  for (const f of feuilles) {
    const lundi = lundiDe(f.temps);
    (parSemaine.get(lundi) ?? parSemaine.set(lundi, []).get(lundi)!).push(f);
  }
  const etapes: Etape[] = [...parSemaine].sort((a, b) => a[0] - b[0]).map(([debut, fs], indice) => {
    const frequences = new Map<number, number>();
    for (const f of fs) { const n = numeroJournee(f.journee); if (n !== null) frequences.set(n, (frequences.get(n) ?? 0) + 1); }
    const journees = [...frequences].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 2).map(([n]) => `J${n}`).join(" / ");
    return { indice, debut, libelle: `Semaine du ${dateFr(debut)}`, journees, feuilles: fs };
  });

  return {
    feuilles, etapes,
    resume: {
      matchsLus, feuilles: feuilles.length, etapes: etapes.length, equipes: new Set(feuilles.map((f) => f.equipe)).size,
      premiere: feuilles[0]?.date ?? null, derniere: feuilles[feuilles.length - 1]?.date ?? null,
      derniereSemaine: etapes[etapes.length - 1]?.debut ?? null,
      saisons: [...new Set(feuilles.map((f) => f.saisonId).filter((s): s is string => !!s))],
      ecartes,
    },
  };
}
