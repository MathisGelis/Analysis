// src/features/ia/ia-modele.ts
//
// LE MODELE : trois petits modeles lineaires, appris sur les feuilles de match.
//
//  1. TITULARISATION : la probabilite qu'un joueur connu de l'equipe soit titulaire au prochain match (regression
//     logistique sur son historique recent : combien de fois titulaire, dernier match, banc, absences...). Le onze
//     predit est celui des 11 joueurs les plus probables, avec un seul gardien.
//  2. NUMEROS : etant donne les 11 titulaires, quel numero (donc quel poste) chacun porte (logit conditionnel : son
//     numero habituel, celui du dernier match, sa ligne, les numeros laisses vacants), puis assignation optimale.
//  3. SYSTEME : le dispositif (4-4-2...) parmi les candidats (logit conditionnel : dispositifs saisis par le staff, ce que
//     lisent les numeros, frequence generale). Appris seulement la ou le staff a saisi le dispositif.
//
// Les poids de depart (a priori) reproduisent le bon sens du moteur a regles ; l'entrainement les ajuste d'apres les
// erreurs commises. Fonctions pures.

import {
  analyserNumeros, AnalyseNumeros, FENETRE_NUMEROS, FORMATIONS_NUMEROS, LigneFeuille, SEUIL_NUMEROS_FIABLES,
} from "@/features/analyse/compo-numeros";
import { ligneDuNumero, LignePoste } from "@/features/matchs/numeros-postes";

import { assigner, ExempleBinaire, ExempleChoix, probabilitesChoix, sigmoide } from "./ia-maths";
import type { FeuilleEquipe } from "./ia-donnees";

/* --------------------------------------- hyperparametres --------------------------------------- */

export interface Hyper {
  /** Nombre de feuilles recentes d'une equipe prises en compte. */
  fenetre: number;
  /** Regularisation vers l'a priori (plus elle est forte, plus le modele reste proche de l'heuristique). */
  l2: number;
  /** Demi-vie, en semaines, du poids d'un exemple (les erreurs recentes comptent plus) ; null = tous egaux. */
  demiVie: number | null;
}

export const HYPER_PAR_DEFAUT: Hyper = { fenetre: 10, l2: 1, demiVie: null };

/* ------------------------------------ catalogue des caracteristiques ------------------------------------ */

export interface Caracteristique { id: string; libelle: string; aide: string }

export const CARACTERISTIQUES_TITULAIRE: readonly Caracteristique[] = [
  { id: "biais", libelle: "Point de depart", aide: "Chance de base de partir titulaire, avant tout indice." },
  { id: "tauxPondere", libelle: "Titularisations (les matchs recents comptent plus)", aide: "Part des matchs ou le joueur a commence, les plus recents pesant davantage." },
  { id: "tauxFenetre", libelle: "Titularisations sur la fenetre", aide: "Part des derniers matchs ou le joueur a commence, tous egaux." },
  { id: "taux3", libelle: "Titularisations sur les 3 derniers matchs", aide: "La forme tres recente : combien de fois titulaire sur les trois derniers matchs." },
  { id: "titDernier", libelle: "Titulaire au dernier match", aide: "Le joueur a commence le match precedent." },
  { id: "presentDernier", libelle: "Sur la feuille du dernier match", aide: "Le joueur etait titulaire ou remplacant au match precedent (absent = blesse, suspendu, indisponible ?)." },
  { id: "entreDuBanc", libelle: "Entrees en jeu depuis le banc", aide: "Part des matchs ou le joueur est entre en cours de jeu." },
  { id: "banc", libelle: "Presence sur le banc", aide: "Part des matchs ou le joueur etait remplacant (entre ou non)." },
  { id: "absence", libelle: "Matchs depuis sa derniere titularisation", aide: "Plus un joueur n'a pas commence depuis longtemps, moins il est probable." },
  { id: "jamaisTitulaire", libelle: "Jamais titulaire", aide: "Le joueur n'a jamais commence sur la fenetre (remplacant ou jeune)." },
  { id: "ancienneSaison", libelle: "Titularisations d'une saison precedente", aide: "Part de ses titularisations datant d'une autre saison (effectif qui a pu changer)." },
  { id: "experience", libelle: "Experience dans l'equipe", aide: "Nombre de titularisations sur la fenetre (rarete des revenants)." },
  { id: "minutesDernier", libelle: "Temps de jeu au dernier match", aide: "Minutes jouees au match precedent, rapportees a 90." },
  { id: "tauxAuPoste", libelle: "Titularisations a son poste habituel", aide: "Part des matchs ou le joueur a commence AU numero qu'il porte le plus : un joueur d'un poste fixe est plus previsible qu'un joueur qui comble des trous un peu partout." },
  { id: "titulaireDuPoste", libelle: "Titulaire habituel d'un poste", aide: "Le joueur est celui qui a le plus souvent commence au numero qu'il porte le plus : un poste a toujours son titulaire." },
];

export const CARACTERISTIQUES_NUMERO: readonly Caracteristique[] = [
  { id: "frequence", libelle: "Son numero habituel", aide: "Part (ponderee par la recence) de ses titularisations a ce numero." },
  { id: "dernier", libelle: "Son numero au dernier match", aide: "Le joueur retrouve le numero de sa derniere titularisation." },
  { id: "ligne", libelle: "Sa ligne habituelle", aide: "Gardien, defense, milieu ou attaque : le joueur reste dans sa ligne." },
  { id: "vacant", libelle: "Numero laisse vacant", aide: "Le titulaire habituel du numero est absent : un joueur de la meme ligne le remplace." },
];

export const CARACTERISTIQUES_SYSTEME: readonly Caracteristique[] = [
  { id: "manuel", libelle: "Dispositifs saisis par le staff", aide: "Part (ponderee par la recence) des matchs ou ce dispositif a ete saisi." },
  { id: "manuelDernier", libelle: "Dernier dispositif saisi", aide: "Le dispositif du dernier match ou le staff en a saisi un." },
  { id: "manuelSolide", libelle: "Dispositifs saisis, base solide", aide: "Comme le premier, mais seulement quand au moins 5 matchs sont saisis." },
  { id: "numeros", libelle: "Lecture des numeros de maillot", aide: "Part du dispositif dans ce que disent les changements de numero." },
  { id: "structure", libelle: "Structure lue dans les numeros", aide: "Le dispositif a la meme defense (a 4, a 3...) et le meme nombre d'attaquants que les numeros." },
  { id: "frequence", libelle: "Dispositif courant", aide: "Frequence generale de ce dispositif dans les matchs deja vus (log)." },
];

/* ------------------------------------------ poids ------------------------------------------ */

export interface Poids { noms: string[]; w: number[] }

export interface PoidsIa {
  version: 1;
  hyper: Hyper;
  titularisation: Poids;
  numeros: Poids;
  /** null tant qu'aucun dispositif saisi n'a permis d'apprendre. */
  systeme: Poids | null;
  /** Dispositifs deja vus (effectifs), pour la frequence generale du systeme. */
  frequencesSysteme: Record<string, number>;
}

const W_TITULAIRE_DEPART = [-3.5, 4.0, 0, 1.0, 1.0, 0.3, 0.2, 0, -0.8, -0.5, -0.6, 0.3, 0.4, 1.0, 0.5];
const W_NUMERO_DEPART = [5, 1, 2, 1];
const W_SYSTEME_DEPART = [3, 1, 1, 2, 1, 0.5];

/**
 * Les poids d'un modele rangés dans l'ordre du catalogue actuel (par nom) : un poids absent vaut zero. Un modele enregistre
 * avant l'ajout d'une caracteristique continue ainsi de fonctionner, sans elle.
 */
export function alignerPoids(poids: Poids, catalogue: readonly Caracteristique[]): number[] {
  return catalogue.map((c) => { const i = poids.noms.indexOf(c.id); return i >= 0 ? poids.w[i] : 0; });
}

const poidsDe = (caracteristiques: readonly Caracteristique[], w: number[]): Poids => ({ noms: caracteristiques.map((c) => c.id), w: [...w] });

/** Les poids de depart : l'heuristique a regles, avant tout entrainement. */
export function poidsInitiaux(hyper: Hyper = HYPER_PAR_DEFAUT): PoidsIa {
  return {
    version: 1, hyper: { ...hyper },
    titularisation: poidsDe(CARACTERISTIQUES_TITULAIRE, W_TITULAIRE_DEPART),
    numeros: poidsDe(CARACTERISTIQUES_NUMERO, W_NUMERO_DEPART),
    systeme: poidsDe(CARACTERISTIQUES_SYSTEME, W_SYSTEME_DEPART),
    frequencesSysteme: {},
  };
}

/* ---------------------------------- preparation de l'historique ---------------------------------- */

const LIGNES: readonly LignePoste[] = ["GB", "DEF", "MIL", "ATT"];
const indiceLigne = (l: LignePoste | null) => (l ? LIGNES.indexOf(l) : -1);

export interface Candidat {
  joueur: string;
  nom: string;
  /** Caracteristiques de titularisation (voir CARACTERISTIQUES_TITULAIRE). */
  x: number[];
  /** Part ponderee de ses titularisations a chaque numero, 1 a 11 (index 0 a 10). */
  numeros: number[];
  /** Part ponderee par ligne : GB, DEF, MIL, ATT. */
  lignes: number[];
  dernierNumero: number | null;
  titularisations: number;
}

/** Ce que l'on sait d'une equipe juste avant un match, sans rien connaitre du match lui-meme. */
export interface Preparation {
  candidats: Candidat[];
  /** Le titulaire de chaque numero au dernier match. */
  derniersTitulaires: Map<number, string>;
  /** Nombre de feuilles lues. */
  n: number;
  /** Les numeros du passe sont ceux de la convention du staff (75 % au moins des titulaires dans 1-11). */
  numerosExploitables: boolean;
}

const dansLesOnze = (numero: number) => Number.isInteger(numero) && numero >= 1 && numero <= 11;

/**
 * Lit les feuilles les plus recentes d'une equipe (la plus recente d'abord) et en tire, pour chaque joueur, ses
 * caracteristiques. `saisonId` : la saison du match a predire (pour reperer ce qui date d'une saison precedente).
 */
export function preparerCandidats(recentesDAbord: readonly FeuilleEquipe[], saisonId: string | null, fenetre: number): Preparation {
  const fs = recentesDAbord.slice(0, fenetre);
  const n = fs.length;
  if (n === 0) return { candidats: [], derniersTitulaires: new Map(), n: 0, numerosExploitables: false };
  const poids = fs.map((_, r) => (n - r) / n);
  const poidsTotal = poids.reduce((s, p) => s + p, 0);

  interface Cumul {
    nom: string; starts: number; start3: number; wStart: number; wAncienne: number; banc: number; entrees: number;
    premier: number; presentDernier: number; minutesDernier: number; titDernier: number; dernierNumero: number | null;
    numeros: number[]; lignes: number[];
  }
  const cumuls = new Map<string, Cumul>();
  let titulaires = 0;
  let enRegle = 0;
  fs.forEach((f, r) => {
    const w = poids[r];
    for (const l of f.lignes) {
      const c = cumuls.get(l.joueur) ?? cumuls.set(l.joueur, {
        nom: l.nom, starts: 0, start3: 0, wStart: 0, wAncienne: 0, banc: 0, entrees: 0, premier: -1, presentDernier: 0,
        minutesDernier: 0, titDernier: 0, dernierNumero: null, numeros: new Array(11).fill(0), lignes: new Array(4).fill(0),
      }).get(l.joueur)!;
      if (r === 0) { c.presentDernier = 1; c.minutesDernier = Math.min(1, l.minutes / 90); }
      if (l.titulaire) {
        titulaires++;
        if (dansLesOnze(l.numero)) enRegle++;
        c.starts++; c.wStart += w;
        if (r < 3) c.start3++;
        if (r === 0) c.titDernier = 1;
        if (c.premier < 0) c.premier = r;
        if (f.saisonId !== saisonId) c.wAncienne += w;
        if (dansLesOnze(l.numero)) {
          c.numeros[l.numero - 1] += w;
          const i = indiceLigne(ligneDuNumero(l.numero));
          if (i >= 0) c.lignes[i] += w;
          if (c.dernierNumero === null) c.dernierNumero = l.numero;
        }
      } else {
        c.banc++;
        if (l.minutes > 0) c.entrees++;
      }
    }
  });

  const logN = Math.log(1 + n);
  // Le "titulaire du poste" : pour chaque numero, le joueur qui y a le plus (ponderement compris) commence.
  const proprietaire = new Array<string | null>(11).fill(null);
  for (let k = 0; k < 11; k++) {
    let meilleur = 0;
    for (const [joueur, c] of [...cumuls].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (c.numeros[k] > meilleur + 1e-12) { meilleur = c.numeros[k]; proprietaire[k] = joueur; }
    }
  }
  const candidats: Candidat[] = [...cumuls].sort((a, b) => a[0].localeCompare(b[0])).map(([joueur, c]) => {
    const maxPoste = Math.max(...c.numeros);
    const poste = maxPoste > 0 ? c.numeros.indexOf(maxPoste) : -1;
    return {
      joueur, nom: c.nom,
      x: [
        1,
        c.wStart / poidsTotal,
        c.starts / n,
        c.start3 / Math.min(3, n),
        c.titDernier,
        c.presentDernier,
        c.entrees / n,
        c.banc / n,
        (c.premier >= 0 ? c.premier : n) / n,
        c.starts === 0 ? 1 : 0,
        c.wStart > 0 ? c.wAncienne / c.wStart : 0,
        Math.log(1 + c.starts) / logN,
        c.minutesDernier,
        maxPoste / poidsTotal,
        poste >= 0 && proprietaire[poste] === joueur ? 1 : 0,
      ],
      numeros: c.wStart > 0 ? c.numeros.map((v) => v / c.wStart) : c.numeros,
      lignes: c.wStart > 0 ? c.lignes.map((v) => v / c.wStart) : c.lignes,
      dernierNumero: c.dernierNumero, titularisations: c.starts,
    };
  });

  const derniersTitulaires = new Map<number, string>();
  for (const l of fs[0].lignes) if (l.titulaire && dansLesOnze(l.numero) && !derniersTitulaires.has(l.numero)) derniersTitulaires.set(l.numero, l.joueur);

  return {
    candidats, derniersTitulaires, n,
    numerosExploitables: titulaires > 0 && enRegle / titulaires >= SEUIL_NUMEROS_FIABLES,
  };
}

/* ------------------------------------------ titularisation ------------------------------------------ */

export const probaTitulaire = (w: readonly number[], x: readonly number[]): number => {
  let z = 0;
  for (let i = 0; i < w.length; i++) z += w[i] * x[i];
  return sigmoide(z);
};

/** Les exemples de la regression : chaque candidat, et s'il a effectivement commence le match. */
export function exemplesTitularisation(prep: Preparation, titulairesReels: ReadonlySet<string>): ExempleBinaire[] {
  return prep.candidats.map((c) => ({ x: c.x, y: titulairesReels.has(c.joueur) ? 1 : 0, s: 1 }));
}

/* ----------------------------------------------- numeros ----------------------------------------------- */

/** Caracteristiques du couple (joueur, numero) : `pris` = les joueurs du onze ; sert au "numero vacant". */
function phiNumero(c: Candidat, numero: number, pris: ReadonlySet<string>, derniers: ReadonlyMap<number, string>): number[] {
  const ligne = indiceLigne(ligneDuNumero(numero));
  const titulaireHabituel = derniers.get(numero);
  const partLigne = ligne >= 0 ? c.lignes[ligne] : 0;
  return [c.numeros[numero - 1], c.dernierNumero === numero ? 1 : 0, partLigne, titulaireHabituel && !pris.has(titulaireHabituel) ? partLigne : 0];
}

const NUMEROS = Array.from({ length: 11 }, (_, i) => i + 1);

/** Les exemples du choix du numero : chaque titulaire reel connu, avec pour bon choix le numero qu'il a porte. */
export function exemplesNumeros(prep: Preparation, titulairesReels: readonly { joueur: string; numero: number }[]): ExempleChoix[] {
  const pris = new Set(titulairesReels.map((t) => t.joueur));
  const parJoueur = new Map(prep.candidats.map((c) => [c.joueur, c]));
  const exemples: ExempleChoix[] = [];
  for (const t of titulairesReels) {
    const c = parJoueur.get(t.joueur);
    if (!c) continue;
    exemples.push({ phi: NUMEROS.map((k) => phiNumero(c, k, pris, prep.derniersTitulaires)), vrai: t.numero - 1, s: 1 });
  }
  return exemples;
}

/** Les onze numeros 1 a 11 sont-ils tous portes, une fois chacun, par les titulaires de cette feuille ? */
export function numerosDeFeuilleExploitables(titulaires: readonly { numero: number }[]): boolean {
  return titulaires.length === 11 && new Set(titulaires.map((t) => t.numero)).size === 11 && titulaires.every((t) => dansLesOnze(t.numero));
}

/* ---------------------------------------------- le onze ---------------------------------------------- */

export interface JoueurPredit { joueur: string; nom: string; proba: number; numero: number | null }

export interface PredictionOnze {
  /** Les 11 titulaires predits, par numero quand il est lisible, sinon du plus au moins probable. */
  titulaires: JoueurPredit[];
  /** Les suivants, du plus au moins probable. */
  banc: { joueur: string; nom: string; proba: number }[];
  /** Probabilite moyenne des 11 titulaires predits (0 a 1). */
  confiance: number;
  /** Probabilite de chaque candidat (pour la mesure de la qualite : perte logarithmique). */
  probas: Map<string, number>;
}

/** Un joueur dont le numero habituel est le 1 : un gardien. */
const estGardien = (c: Candidat) => c.titularisations > 0 && c.numeros[0] > 0.5;

export function predireOnze(poids: PoidsIa, prep: Preparation): PredictionOnze | null {
  if (prep.candidats.length === 0) return null;
  const wTitulaire = alignerPoids(poids.titularisation, CARACTERISTIQUES_TITULAIRE);
  const wNumero = alignerPoids(poids.numeros, CARACTERISTIQUES_NUMERO);
  const probas = new Map(prep.candidats.map((c) => [c.joueur, probaTitulaire(wTitulaire, c.x)]));
  const parProba = (a: Candidat, b: Candidat) => probas.get(b.joueur)! - probas.get(a.joueur)! || b.titularisations - a.titularisations || a.nom.localeCompare(b.nom);
  const tries = [...prep.candidats].sort(parProba);

  // Le onze : les 11 plus probables, avec exactement un gardien quand les numeros permettent de les reconnaitre.
  let choisis: Candidat[];
  const gardiens = prep.numerosExploitables ? tries.filter(estGardien) : [];
  if (gardiens.length > 0) {
    const champ = tries.filter((c) => !estGardien(c));
    choisis = [gardiens[0], ...champ.slice(0, 10)];
    // Pas assez de joueurs de champ : on complete avec les autres gardiens plutot que de laisser un poste vide.
    if (choisis.length < 11) choisis.push(...gardiens.slice(1, 1 + 11 - choisis.length));
  } else {
    choisis = tries.slice(0, 11);
  }
  const choisisIds = new Set(choisis.map((c) => c.joueur));

  // Les numeros : l'assignation qui maximise le nombre ATTENDU de bons couples (somme des probabilites), un numero par joueur.
  let numeros: (number | null)[] = choisis.map(() => null);
  if (prep.numerosExploitables && choisis.length > 0) {
    const couts = choisis.map((c) => {
      const pi = probabilitesChoix(wNumero, NUMEROS.map((k) => phiNumero(c, k, choisisIds, prep.derniersTitulaires)));
      return pi.map((p) => -p);
    });
    numeros = assigner(couts).map((j) => j + 1);
  }

  const titulaires: JoueurPredit[] = choisis.map((c, i) => ({ joueur: c.joueur, nom: c.nom, proba: probas.get(c.joueur)!, numero: numeros[i] }))
    .sort((a, b) => (a.numero ?? 99) - (b.numero ?? 99) || b.proba - a.proba || a.nom.localeCompare(b.nom));
  return {
    titulaires,
    banc: tries.filter((c) => !choisisIds.has(c.joueur)).slice(0, 7).map((c) => ({ joueur: c.joueur, nom: c.nom, proba: probas.get(c.joueur)! })),
    confiance: titulaires.reduce((s, t) => s + t.proba, 0) / titulaires.length,
    probas,
  };
}

/* -------------------------------------------- le dispositif -------------------------------------------- */

export interface FrequencesSysteme { effectifs: Map<string, number>; total: number }

export const frequencesVides = (): FrequencesSysteme => ({ effectifs: new Map(), total: 0 });

export function compterSysteme(f: FrequencesSysteme, systeme: string): void {
  f.effectifs.set(systeme, (f.effectifs.get(systeme) ?? 0) + 1);
  f.total++;
}

export interface PreparationSysteme {
  candidats: string[];
  phi: number[][];
  numeros: AnalyseNumeros;
  /** Nombre de dispositifs saisis dans l'historique. */
  nbSaisis: number;
  dernierSaisi: string | null;
}

/** La defense (premier chiffre) et le nombre d'attaquants (dernier) d'un dispositif. */
export const structureDuSysteme = (systeme: string) => {
  const n = systeme.split("-").map(Number);
  return { defense: n[0], attaque: n[n.length - 1] };
};

const FENETRE_SAISIS = 8;

export function preparerSysteme(
  recentesDAbord: readonly FeuilleEquipe[], frequences: FrequencesSysteme, fenetreNumeros = FENETRE_NUMEROS,
): PreparationSysteme {
  const saisis = recentesDAbord.filter((f) => f.formation).slice(0, FENETRE_SAISIS);
  const poidsSaisis = new Map<string, number>();
  saisis.forEach((f, r) => poidsSaisis.set(f.formation!, (poidsSaisis.get(f.formation!) ?? 0) + (saisis.length - r)));
  const totalSaisis = [...poidsSaisis.values()].reduce((s, p) => s + p, 0);

  const lignes: LigneFeuille[] = recentesDAbord.flatMap((f) => f.lignes.map((l) => ({
    matchId: f.matchId, date: f.date, journee: f.journee, joueur: l.joueur, nom: l.nom, numero: l.numero, titulaire: l.titulaire,
  })));
  const numeros = analyserNumeros(lignes, fenetreNumeros);
  const distribution = new Map((numeros.systeme?.distribution ?? []).map((d) => [d.systeme, d.poids / 100]));

  const candidats = [...new Set<string>([
    ...FORMATIONS_NUMEROS, ...poidsSaisis.keys(),
    ...[...frequences.effectifs].filter(([, n]) => n >= 3).map(([s]) => s),
  ])].sort();
  const solide = Math.min(1, saisis.length / 5);
  const K = Math.max(1, candidats.length);
  const phi = candidats.map((s) => {
    const part = totalSaisis > 0 ? (poidsSaisis.get(s) ?? 0) / totalSaisis : 0;
    const { defense, attaque } = structureDuSysteme(s);
    let accord = 0;
    if (numeros.structure.defense) accord += numeros.structure.defense.lignes === defense ? 1 : -1;
    if (numeros.structure.attaque) accord += numeros.structure.attaque.attaquants === attaque ? 1 : -1;
    return [
      part, saisis[0]?.formation === s ? 1 : 0, part * solide, distribution.get(s) ?? 0, accord / 2,
      Math.log(((frequences.effectifs.get(s) ?? 0) + 1) / (frequences.total + K)),
    ];
  });
  return { candidats, phi, numeros, nbSaisis: saisis.length, dernierSaisi: saisis[0]?.formation ?? null };
}

export function predireSysteme(w: readonly number[], prep: PreparationSysteme): { systeme: string; proba: number; classement: { systeme: string; proba: number }[] } | null {
  if (prep.candidats.length === 0) return null;
  const pi = probabilitesChoix(w, prep.phi);
  const classement = prep.candidats.map((systeme, i) => ({ systeme, proba: pi[i] })).sort((a, b) => b.proba - a.proba || a.systeme.localeCompare(b.systeme));
  return { systeme: classement[0].systeme, proba: classement[0].proba, classement };
}
