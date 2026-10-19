// src/features/joueurs/recherche-avancee.ts
//
// Recherche avancee de joueurs (scouting, recrutement), par criteres : « un attaquant qui a joue en U16 R2 la saison
// derniere et qui n'a pas de club cette saison ». Fonctions PURES : le service charge les feuilles de match des saisons
// concernees, les equipes et les fiches, puis appelle `rechercherJoueurs`.
//
// Ce que la base sait, et donc ce que la recherche peut dire :
//   - « a joue » : il figure sur une feuille de match de la saison (titulaire, ou remplacant entre en jeu), pour une
//     equipe de la categorie / division / du club demandes ;
//   - le poste : celui de sa fiche, a defaut celui de son numero le plus porte sur la periode (convention du staff) ;
//   - « sans club » une saison : aucune feuille de match ni aucun effectif de cette saison dans la base. La base ne
//     contient que les feuilles importees (les matchs des clubs qui utilisent l'application) : c'est un indice, pas une
//     information de la Federation ;
//   - un joueur est reconnu par sa licence ; sans licence sur la feuille, par son nom et son club (il n'est alors pas
//     retrouve dans un autre club).
// Aucune donnee privee d'un club (licence, date de naissance, morphologie, sante...) n'est ni un critere ni un resultat :
// filtrer dessus les revelerait.

import { normaliser } from "@/common/fuzzy";
import { parseDateFlexible } from "@/common/dates";
import type { EvenementMatch } from "@/features/matchs/evenement-match.entity";
import { minutesJouees } from "@/features/matchs/minutes";
import { posteFiche } from "@/features/matchs/numeros-postes";
import { statsDuMatch } from "@/features/matchs/stats-match";

/** Situation du joueur la saison cible (en general la saison actuelle). */
export type StatutSituation = "sans_club" | "meme_club" | "autre_club";
export const STATUTS_SITUATION: readonly (StatutSituation | "indifferent")[] = ["indifferent", "sans_club", "meme_club", "autre_club"];

/** Postes de fiche (vocabulaire de l'effectif) acceptes en critere. */
export const POSTES_FICHE = ["GB", "DD", "DG", "DC", "MD", "MC", "MO", "MIL", "AG", "AD", "AT"] as const;

export interface CriteresRecherche {
  /** La saison ou il a joue (obligatoire : c'est la population de depart). */
  saisonId: string;
  categorie?: string | null;
  division?: string | null;
  /** A joue pour ce club. */
  clubId?: string | null;
  /** Postes de fiche acceptes ; vide = tous. */
  postes?: string[] | null;
  /** Matchs joues minimum sur la periode (1 par defaut). */
  minMatchs?: number | null;
  /** Situation une autre saison : sans club, toujours dans le meme club, dans un autre club. */
  situation?: { saisonId: string; statut: StatutSituation | "indifferent" } | null;
}

/** Une ligne de feuille de match, avec ce qu'on lit du match. */
export interface LigneFeuille {
  matchId: string;
  saisonId: string | null;
  date: string | null;
  cote: "dom" | "ext";
  /** Club du cote du joueur. */
  clubId: string;
  /** Equipe du cote du joueur, si le match y est rattache. */
  equipeId: string | null;
  licence: string | null;
  nom: string;
  prenom: string | null;
  numero: number | null;
  titulaire: boolean;
  minutes: number;
}

export type EvenementFeuille = Pick<EvenementMatch, "type" | "sousType" | "equipe" | "joueur" | "joueur2" | "minute">;

export interface EquipeRef {
  id: string; clubId: string; nom: string; categorie: string | null; division: string | null; saisonId: string | null;
}

export interface FicheRef {
  id: string; nom: string; prenom: string | null; licence: string | null; clubId: string | null; poste: string | null;
  equipesAttachees: string[] | null;
}

export interface EquipeResultat { id: string; nom: string; categorie: string | null; division: string | null; clubId: string }

export interface ResultatRecherche {
  joueurId: string;
  nom: string;
  prenom: string | null;
  poste: string | null;
  /** Poste deduit de ses numeros (sa fiche n'en a pas). */
  posteDeduit: boolean;
  /** Ce qu'il a fait sur la periode recherchee. */
  periode: {
    clubId: string;
    equipes: EquipeResultat[];
    matchs: number;
    titularisations: number;
    minutes: number;
    buts: number;
  };
  /** Sa situation la saison cible (absente sans saison cible). */
  situation: { statut: StatutSituation; clubId: string | null; equipe: EquipeResultat | null } | null;
}

export interface DonneesRecherche {
  /** Feuilles des matchs de la saison recherchee ET de la saison cible. */
  lignes: LigneFeuille[];
  evenements: Map<string, EvenementFeuille[]>;
  equipes: Map<string, EquipeRef>;
  fiches: FicheRef[];
}

/** Libelles compares sans casse, accents ni espaces : "U16", "u 16" et "U-16" sont la meme categorie. */
export const memeLibelle = (a: string | null | undefined, b: string | null | undefined) =>
  normaliser(a).replace(/\s+/g, "") === normaliser(b).replace(/\s+/g, "");

const cleNom = (clubId: string | null, nom: string | null | undefined, prenom: string | null | undefined) =>
  `${clubId ?? ""}|${normaliser(nom)}|${normaliser(prenom)}`;

/** Ligne de poste d'un poste de fiche, pour l'affichage groupe (Gardien / Defenseur / Milieu / Attaquant). */
export function ligneDuPosteFiche(poste: string | null | undefined): "GB" | "DEF" | "MIL" | "ATT" | null {
  switch ((poste ?? "").toUpperCase()) {
    case "GB": return "GB";
    case "DD": case "DG": case "DC": return "DEF";
    case "MD": case "MC": case "MO": case "MIL": return "MIL";
    case "AG": case "AD": case "AT": return "ATT";
    default: return null;
  }
}

/** Le poste le plus porte d'apres les numeros de maillot (1 a 11, 16), null sans numero de poste. */
function posteDesNumeros(numeros: Map<number, number>): string | null {
  let meilleur: { poste: string; n: number } | null = null;
  const parPoste = new Map<string, number>();
  for (const [numero, n] of numeros) {
    const p = posteFiche(numero);
    if (p) parPoste.set(p, (parPoste.get(p) ?? 0) + n);
  }
  for (const [poste, n] of parPoste) if (!meilleur || n > meilleur.n) meilleur = { poste, n };
  return meilleur?.poste ?? null;
}

/** Resout la fiche d'une ligne de feuille : par licence, sinon par nom et club parmi les fiches sans licence. */
function resolveur(fiches: FicheRef[]) {
  const parLicence = new Map<string, FicheRef>();
  const parNom = new Map<string, FicheRef>();
  for (const f of fiches) {
    if (f.licence) { if (!parLicence.has(f.licence)) parLicence.set(f.licence, f); }
    else {
      const cle = cleNom(f.clubId, f.nom, f.prenom);
      if (!parNom.has(cle)) parNom.set(cle, f);
    }
  }
  return (l: Pick<LigneFeuille, "licence" | "clubId" | "nom" | "prenom">): FicheRef | null =>
    (l.licence ? parLicence.get(l.licence) : undefined) ?? parNom.get(cleNom(l.clubId, l.nom, l.prenom)) ?? null;
}

const equipeResultat = (e: EquipeRef): EquipeResultat =>
  ({ id: e.id, nom: e.nom, categorie: e.categorie, division: e.division, clubId: e.clubId });

/** Instant d'une ligne pour trouver la plus recente ; 0 sans date. */
const instant = (l: Pick<LigneFeuille, "date">) => parseDateFlexible(l.date) ?? 0;

/** La ligne de feuille correspond-elle a la periode recherchee (saison, categorie, division, club) ? */
export function dansLaPeriode(l: LigneFeuille, c: CriteresRecherche, equipes: Map<string, EquipeRef>): boolean {
  if (l.saisonId !== c.saisonId) return false;
  if (c.clubId && l.clubId !== c.clubId) return false;
  if (!c.categorie && !c.division) return true;
  const e = l.equipeId ? equipes.get(l.equipeId) : undefined;
  if (!e) return false;
  return (!c.categorie || memeLibelle(e.categorie, c.categorie)) && (!c.division || memeLibelle(e.division, c.division));
}

/**
 * Les joueurs qui repondent aux criteres, du plus utilise au moins utilise sur la periode (matchs, puis buts, puis nom).
 * `limite` : nombre de resultats rendus ; `total` dit combien repondent en tout.
 */
export function rechercherJoueurs(
  criteres: CriteresRecherche, d: DonneesRecherche, limite = 100,
): { total: number; resultats: ResultatRecherche[] } {
  const fiche = resolveur(d.fiches);
  const minMatchs = Math.max(1, criteres.minMatchs ?? 1);
  const postes = new Set((criteres.postes ?? []).map((p) => p.toUpperCase()));

  // 1) La periode : les matchs joues par chaque fiche.
  interface Cumul {
    fiche: FicheRef; matchs: Set<string>; titularisations: number; minutes: number; buts: number;
    numeros: Map<number, number>; equipes: Map<string, EquipeRef>; derniere: LigneFeuille;
  }
  const cumuls = new Map<string, Cumul>();
  for (const l of d.lignes) {
    if (!dansLaPeriode(l, criteres, d.equipes)) continue;
    const f = fiche(l);
    if (!f) continue;
    const evts = d.evenements.get(l.matchId) ?? [];
    const compo = { minutes: l.minutes, titulaire: l.titulaire, nom: l.nom, prenom: l.prenom ?? "", cote: l.cote };
    const minutes = minutesJouees(compo, evts);
    if (!l.titulaire && minutes === 0) continue;                 // reste sur le banc : il n'a pas joue
    const c = cumuls.get(f.id) ?? {
      fiche: f, matchs: new Set<string>(), titularisations: 0, minutes: 0, buts: 0, numeros: new Map(), equipes: new Map(), derniere: l,
    };
    if (c.matchs.has(l.matchId)) continue;
    c.matchs.add(l.matchId);
    if (l.titulaire) c.titularisations++;
    c.minutes += minutes;
    c.buts += statsDuMatch(compo, evts).buts;
    if (typeof l.numero === "number") c.numeros.set(l.numero, (c.numeros.get(l.numero) ?? 0) + 1);
    const e = l.equipeId ? d.equipes.get(l.equipeId) : undefined;
    if (e) c.equipes.set(e.id, e);
    if (instant(l) >= instant(c.derniere)) c.derniere = l;
    cumuls.set(f.id, c);
  }

  // 2) La saison cible : ou chaque fiche figure (feuille de match, meme sur le banc, ou effectif saisi).
  const cible = criteres.situation?.saisonId ?? null;
  const presences = new Map<string, { clubId: string; equipe: EquipeRef | null; t: number }>();
  if (cible) {
    const noter = (ficheId: string, clubId: string, equipe: EquipeRef | null, t: number) => {
      const p = presences.get(ficheId);
      if (!p || t >= p.t) presences.set(ficheId, { clubId, equipe, t });
    };
    for (const l of d.lignes) {
      if (l.saisonId !== cible) continue;
      const f = fiche(l);
      if (f && cumuls.has(f.id)) noter(f.id, l.clubId, (l.equipeId ? d.equipes.get(l.equipeId) : null) ?? null, instant(l) || 1);
    }
    for (const c of cumuls.values()) {
      for (const id of c.fiche.equipesAttachees ?? []) {
        const e = d.equipes.get(id);
        // Un effectif saisi compte moins qu'une feuille de match datee.
        if (e && e.saisonId === cible) noter(c.fiche.id, e.clubId, e, 0);
      }
    }
  }

  // 3) Filtres et resultats.
  const resultats: ResultatRecherche[] = [];
  for (const c of cumuls.values()) {
    if (c.matchs.size < minMatchs) continue;
    const posteFicheJoueur = c.fiche.poste && c.fiche.poste.trim() ? c.fiche.poste.trim().toUpperCase() : null;
    const poste = posteFicheJoueur ?? posteDesNumeros(c.numeros);
    if (postes.size > 0 && (!poste || !postes.has(poste))) continue;

    let situation: ResultatRecherche["situation"] = null;
    if (cible) {
      const p = presences.get(c.fiche.id);
      const statut: StatutSituation = !p ? "sans_club" : p.clubId === c.derniere.clubId ? "meme_club" : "autre_club";
      const voulu = criteres.situation?.statut ?? "indifferent";
      if (voulu !== "indifferent" && voulu !== statut) continue;
      situation = { statut, clubId: p?.clubId ?? null, equipe: p?.equipe ? equipeResultat(p.equipe) : null };
    }

    resultats.push({
      joueurId: c.fiche.id, nom: c.fiche.nom, prenom: c.fiche.prenom ?? null,
      poste, posteDeduit: !posteFicheJoueur && !!poste,
      periode: {
        clubId: c.derniere.clubId,
        equipes: [...c.equipes.values()].map(equipeResultat),
        matchs: c.matchs.size, titularisations: c.titularisations, minutes: c.minutes, buts: c.buts,
      },
      situation,
    });
  }
  resultats.sort((a, b) => b.periode.matchs - a.periode.matchs || b.periode.buts - a.periode.buts
    || a.nom.localeCompare(b.nom) || (a.prenom ?? "").localeCompare(b.prenom ?? ""));
  return { total: resultats.length, resultats: resultats.slice(0, limite) };
}
