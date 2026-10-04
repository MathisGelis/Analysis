// src/features/analyse/compo-numeros.ts
//
// COMPO ET SYSTEME D'UNE EQUIPE LUS DANS LES NUMEROS DE MAILLOT de ses feuilles de match.
//
// La FMI ne dit rien du dispositif, mais les numeros portent une information : 1 = Gardien, 2 = DD, 3 = DG, 4 = DCD,
// 5 = DCG, 6 = MDC, 7 = AG, 8 = MC, 9 = BU, 10 = MO, 11 = AD (features/matchs/numeros-postes.ts). Deux lectures :
//
//  - les POSTES : qui porte quel numero, donc qui occupe quel poste (onze probable par poste) ;
//  - le SYSTEME : un numero fixe (1 a 11 dans 96 % des feuilles) ne distingue pas un 4-4-2 d'un 4-3-3, mais un joueur
//    qui CHANGE de numero le fait. Un 2 qui devient 4 (DD -> DC) dit une defense a 4 ; un attaquant tantot 9 tantot 10
//    dit deux attaquants ; un 9 qui alterne avec un 7 ou un 11 dit trois attaquants, etc. (table `REGLES`).
//
// Rien n'est invente : sans changement de numero, pas de systeme (seulement les postes) ; si les numeros ne sont pas
// ceux de la convention (numeros de saison, plus de 25 % des titulaires hors 1-11), on ne deduit rien. Des indices qui se
// contredisent (sur les feuilles reelles, les numeros bougent beaucoup : remplacements d'urgence, numeros donnes sans
// logique de poste) ne donnent pas de systeme : seulement ce qui ressort nettement (une defense a 4, deux attaquants...).
// Chaque estimation cite ses indices et sa confiance, plafonnee : un numero n'est pas un dispositif saisi par le staff.
// Fonctions pures.

import { trierChronologiquement } from "@/common/dates";
import { normaliser } from "@/common/fuzzy";
import {
  CodePoste, ligneDuNumero, LignePoste, NUMEROS_DE_POSTE, posteDuNumero,
} from "@/features/matchs/numeros-postes";

/** Une ligne de feuille de match, du cote de l'equipe etudiee. */
export interface LigneFeuille {
  matchId: string;
  date: string | null;
  journee: string | null;
  /** Cle stable du joueur : sa licence, sinon son nom normalise. */
  joueur: string;
  /** Nom d'affichage. */
  nom: string;
  numero: number;
  titulaire: boolean;
}

/** Lignes de feuille d'un match : l'identite d'un joueur est sa licence, a defaut son nom (les feuilles ne portent pas d'id joueur). */
export function lignesDeFeuille(
  match: { id: string; date?: string | null; journee?: string | null },
  compositions: { nom: string; prenom?: string | null; licence?: string | null; numero: number; titulaire: boolean }[],
): LigneFeuille[] {
  return compositions.map((c) => ({
    matchId: match.id, date: match.date ?? null, journee: match.journee ?? null,
    joueur: c.licence ? `lic:${c.licence}` : `nom:${normaliser(`${c.nom} ${c.prenom ?? ""}`)}`,
    nom: `${c.prenom ?? ""} ${c.nom}`.trim(), numero: c.numero, titulaire: !!c.titulaire,
  }));
}

/** Nombre de feuilles (les plus recentes) prises en compte. */
export const FENETRE_NUMEROS = 10;
/** Sous cette part de titulaires en 1-11, les numeros ne sont pas ceux de la convention. */
export const SEUIL_NUMEROS_FIABLES = 0.75;
/** Confiance maximale d'un systeme deduit des seuls numeros. */
export const PLAFOND_CONFIANCE_NUMEROS = 70;

/* ---------------------------------- systemes et regles ---------------------------------- */

export const FORMATIONS_NUMEROS = ["4-4-2", "4-3-3", "4-2-3-1", "3-5-2", "3-4-3", "5-3-2", "5-4-1"] as const;
export type FormationNumeros = (typeof FORMATIONS_NUMEROS)[number];

interface Regle {
  id: string;
  /** Deux numeros portes par le MEME joueur (en titulaire). */
  paires: readonly (readonly [number, number])[];
  /** Les systemes que ce changement de numero soutient, avec leur poids. */
  votes: Partial<Record<FormationNumeros, number>>;
  /** Ce que dit le changement ; complete "X porte le a et le b : ...". */
  lecture: string;
}

const REGLES: readonly Regle[] = [
  {
    id: "lateral-axe", paires: [[2, 4], [2, 5], [3, 4], [3, 5]],
    votes: { "4-4-2": 1, "4-3-3": 1, "4-2-3-1": 1 },
    lecture: "un lateral qui passe dans l'axe (DD/DG vers DC) : defense a 4",
  },
  {
    id: "axial-pivot", paires: [[4, 6], [5, 6]],
    votes: { "3-5-2": 0.5, "3-4-3": 0.5, "5-3-2": 0.5 },
    lecture: "un defenseur central qui s'avance au milieu defensif : defense a 3 ou a 5 possible",
  },
  {
    id: "lateral-piston", paires: [[2, 7], [2, 11], [3, 7], [3, 11]],
    votes: { "3-5-2": 1, "3-4-3": 1, "5-3-2": 1, "5-4-1": 1 },
    lecture: "un lateral qui monte sur l'aile : piston d'une defense a 3 ou a 5",
  },
  {
    id: "deux-attaquants", paires: [[9, 10]],
    votes: { "4-4-2": 1, "3-5-2": 1, "5-3-2": 1 },
    lecture: "un attaquant tantot BU tantot MO : deux attaquants",
  },
  {
    id: "trois-attaquants", paires: [[7, 9], [9, 11]],
    votes: { "4-3-3": 1, "3-4-3": 1 },
    lecture: "un avant-centre qui alterne avec un ailier : trois attaquants",
  },
  {
    id: "trio-offensif", paires: [[7, 10], [10, 11]],
    votes: { "4-2-3-1": 1, "4-3-3": 0.5 },
    lecture: "un meneur qui alterne avec un ailier : trois offensifs derriere un seul attaquant",
  },
  {
    id: "trois-milieux", paires: [[8, 10]],
    votes: { "4-3-3": 1, "5-3-2": 0.5, "3-5-2": 0.5 },
    lecture: "un milieu central qui alterne avec le MO : trois milieux axiaux",
  },
  {
    id: "double-pivot", paires: [[6, 8]],
    votes: { "4-2-3-1": 0.5, "4-4-2": 0.5 },
    lecture: "deux milieux axiaux interchangeables : milieu axial a deux",
  },
  {
    id: "milieu-large", paires: [[7, 8], [8, 11]],
    votes: { "4-4-2": 1, "4-2-3-1": 0.5 },
    lecture: "un milieu axial qui passe sur le cote : milieu a quatre en ligne",
  },
];

/** Force maximale qu'un meme joueur apporte a une regle (un joueur n'emporte pas la decision a lui seul). */
const FORCE_MAX_JOUEUR = 1.5;
/** Force maximale d'une regle, tous joueurs confondus. */
const FORCE_MAX_REGLE = 3;
/** Force totale a partir de laquelle les preuves sont jugees suffisantes. */
const FORCE_SUFFISANTE = 3;
/** Preuves minimales (0 a 1) pour avancer quoi que ce soit (une defense a 4, deux attaquants...) : en dessous, un changement isole ne dit rien. */
const PREUVES_MINIMALES = 0.5;
/** Preuves minimales pour retenir un SYSTEME entier (4-4-2...), plus exigeant que pour une ligne. */
const PREUVES_SYSTEME = 2 / 3;
/** Avance minimale du systeme en tete sur le suivant (en part de son score) : en dessous, les indices se contredisent. */
const AVANCE_MINIMALE = 0.25;
/** Un changement vu une seule fois (remplacement d'urgence ?) pese moitie moins qu'un changement qui se repete. */
const FACTEUR_CHANGEMENT_ISOLE = 0.5;

/* ------------------------------------------- types ------------------------------------------- */

export interface FiabiliteNumeros {
  /** Lignes de titulaires lues, et parmi elles celles dont le numero est entre 1 et 11. */
  titulaires: number;
  dansLesOnze: number;
  /** dansLesOnze / titulaires, 0 sans titulaire. */
  part: number;
  exploitable: boolean;
}

export interface ProfilJoueurNumeros {
  joueur: string;
  nom: string;
  titularisations: number;
  /** Les numeros 1-11 portes en titulaire, du plus recent et frequent au moins (les matchs recents pesent plus). */
  numeros: { numero: number; poste: CodePoste; fois: number }[];
  principal: CodePoste | null;
  /** Au moins deux numeros de poste differents : un joueur qui change de poste. */
  polyvalent: boolean;
}

export interface PosteProbable {
  numero: number;
  poste: CodePoste;
  joueur: string | null;
  nom: string | null;
  /** Titularisations de ce joueur AVEC ce numero (0 quand il est la a defaut). */
  fois: number;
  /** numero : il porte ce numero ; ligne : a defaut, un titulaire de la meme ligne. */
  origine: "numero" | "ligne" | null;
  /** Autres joueurs vus a ce numero, du plus au moins frequent. */
  autres: { nom: string; fois: number }[];
}

export interface IndiceNumeros {
  regle: string;
  nom: string;
  numeros: [number, number];
  fois: [number, number];
  force: number;
  texte: string;
}

export interface EstimationNumeros {
  systeme: string;
  /** 0-100, plafonnee (voir PLAFOND_CONFIANCE_NUMEROS) et d'autant plus basse que les indices sont minces. */
  confiance: number;
  fiabilite: "faible" | "moyenne";
  /** Poids de chaque systeme soutenu par au moins un indice, en %, du plus au moins probable (somme 100). */
  distribution: { systeme: string; poids: number }[];
  /** Quantite de preuves, 0 a 1 (1 = au moins FORCE_SUFFISANTE). */
  preuves: number;
}

export interface StructureNumeros {
  defense: { lignes: number; part: number } | null;
  attaque: { attaquants: number; part: number } | null;
}

export interface AnalyseNumeros {
  /** Feuilles avec un onze utilisees (au plus `fenetre`). */
  matchs: number;
  fiabilite: FiabiliteNumeros;
  profils: ProfilJoueurNumeros[];
  /** Onze probable, un joueur par numero de 1 a 11 ; vide si les numeros ne sont pas exploitables. */
  onze: PosteProbable[];
  indices: IndiceNumeros[];
  systeme: EstimationNumeros | null;
  structure: StructureNumeros;
  /** Ce qu'il faut savoir pour lire le resultat (numeros stables, peu fiables...). */
  notes: string[];
}

/* ----------------------------------------- calcul ----------------------------------------- */

interface Feuille { matchId: string; titulaires: LigneFeuille[] }

/** Les `fenetre` feuilles les plus recentes ayant un onze, la plus recente d'abord. */
function feuilles(lignes: LigneFeuille[], fenetre: number): Feuille[] {
  const parMatch = new Map<string, { date: string | null; journee: string | null; titulaires: LigneFeuille[] }>();
  for (const l of lignes) {
    const f = parMatch.get(l.matchId) ?? parMatch.set(l.matchId, { date: l.date, journee: l.journee, titulaires: [] }).get(l.matchId)!;
    if (l.titulaire) f.titulaires.push(l);
  }
  const avecOnze = [...parMatch].filter(([, f]) => f.titulaires.length > 0).map(([matchId, f]) => ({ matchId, ...f }));
  return trierChronologiquement(avecOnze).reverse().slice(0, fenetre)
    .map(({ matchId, titulaires }) => ({ matchId, titulaires }));
}

interface Cumul {
  joueur: string; nom: string; titularisations: number; poidsTotal: number;
  parNumero: Map<number, { fois: number; poids: number }>;
}

const pluriel = (n: number) => `${n} fois`;

/** Lit les feuilles d'une equipe (lignes des deux effectifs melangees : seule celle de l'equipe etudiee est attendue). */
export function analyserNumeros(lignes: LigneFeuille[], fenetre = FENETRE_NUMEROS): AnalyseNumeros {
  const fs = feuilles(lignes, fenetre);
  const n = fs.length;
  const titulaires = fs.flatMap((f) => f.titulaires);
  const dansLesOnze = titulaires.filter((l) => ligneDuNumero(l.numero) !== null).length;
  const part = titulaires.length ? dansLesOnze / titulaires.length : 0;
  const fiabilite: FiabiliteNumeros = {
    titulaires: titulaires.length, dansLesOnze, part: +part.toFixed(3), exploitable: n > 0 && part >= SEUIL_NUMEROS_FIABLES,
  };
  const vide = (notes: string[]): AnalyseNumeros => ({
    matchs: n, fiabilite, profils: [], onze: [], indices: [], systeme: null, structure: { defense: null, attaque: null }, notes,
  });
  if (n === 0) return vide(["Aucune feuille de match avec onze : rien a lire dans les numeros."]);
  if (!fiabilite.exploitable) {
    return vide([`Numeros peu fiables : ${Math.round((1 - part) * 100)} % des titulaires portent un numero hors 1-11 (numeros de saison ?). Ni postes ni systeme deduits des numeros.`]);
  }

  // Cumul par joueur : le match le plus recent pese 1, le plus ancien 1/n.
  const cumuls = new Map<string, Cumul>();
  fs.forEach((f, rang) => {
    const poids = (n - rang) / n;
    for (const l of f.titulaires) {
      const c = cumuls.get(l.joueur) ?? cumuls.set(l.joueur, { joueur: l.joueur, nom: l.nom, titularisations: 0, poidsTotal: 0, parNumero: new Map() }).get(l.joueur)!;
      c.titularisations++; c.poidsTotal += poids;
      if (!posteDuNumero(l.numero)) continue;      // un titulaire en 14 n'a pas de poste lisible
      const k = c.parNumero.get(l.numero) ?? c.parNumero.set(l.numero, { fois: 0, poids: 0 }).get(l.numero)!;
      k.fois++; k.poids += poids;
    }
  });

  const profils = [...cumuls.values()].map((c): ProfilJoueurNumeros => {
    const numeros = [...c.parNumero].map(([numero, k]) => ({ numero, poste: posteDuNumero(numero)!, fois: k.fois, poids: k.poids }))
      .sort((a, b) => b.poids - a.poids || b.fois - a.fois || a.numero - b.numero);
    return {
      joueur: c.joueur, nom: c.nom, titularisations: c.titularisations,
      numeros: numeros.map(({ numero, poste, fois }) => ({ numero, poste, fois })),
      principal: numeros[0]?.poste ?? null, polyvalent: numeros.length >= 2,
    };
  }).sort((a, b) => b.titularisations - a.titularisations || a.nom.localeCompare(b.nom));

  const notes: string[] = [];
  const { indices, scores, preuves } = evaluerRegles(cumuls);
  const systeme = estimerSysteme(scores, preuves);
  const structure = structureDe(preuves >= PREUVES_MINIMALES ? { distribution: distributionDe(scores) } : null);
  if (indices.length === 0) {
    notes.push(n < 2
      ? "Une seule feuille : aucun changement de numero a observer, le systeme ne peut pas etre deduit des numeros."
      : "Aucun changement de numero chez les titulaires : les numeros donnent les postes, pas le systeme.");
  } else if (!systeme) {
    notes.push(preuves < PREUVES_MINIMALES
      ? "Peu de changements de numero (surtout isoles) : pas assez pour en deduire un systeme."
      : "Les changements de numero se contredisent ou ne tranchent pas : aucun systeme n'en est deduit.");
  }

  return {
    matchs: n, fiabilite, profils, onze: onzeParPoste(cumuls), indices: indices.slice(0, 6),
    systeme, structure, notes,
  };
}

/* ------------------------------------- onze par poste ------------------------------------- */

/** Un joueur par numero : les couples (joueur, numero) les plus frequents d'abord, chacun une seule fois. */
function onzeParPoste(cumuls: Map<string, Cumul>): PosteProbable[] {
  type Couple = { joueur: string; nom: string; numero: number; fois: number; poids: number };
  const couples: Couple[] = [...cumuls.values()].flatMap((c) =>
    [...c.parNumero].map(([numero, k]) => ({ joueur: c.joueur, nom: c.nom, numero, fois: k.fois, poids: k.poids })));
  const parNumero = new Map<number, Couple[]>();
  for (const c of couples) (parNumero.get(c.numero) ?? parNumero.set(c.numero, []).get(c.numero)!).push(c);
  const ordre = (a: Couple, b: Couple) => b.poids - a.poids || b.fois - a.fois || a.nom.localeCompare(b.nom);

  const pris = new Map<number, Couple>();
  const utilises = new Set<string>();
  for (const c of [...couples].sort(ordre)) {
    if (pris.has(c.numero) || utilises.has(c.joueur)) continue;
    pris.set(c.numero, c); utilises.add(c.joueur);
  }

  // A defaut : un titulaire pas encore place, de la meme ligne que le poste (son poste principal), le plus utilise.
  const libres = [...cumuls.values()].filter((c) => !utilises.has(c.joueur) && c.parNumero.size > 0)
    .sort((a, b) => b.poidsTotal - a.poidsTotal || a.nom.localeCompare(b.nom));
  const ligneDe = (c: Cumul): LignePoste | null => {
    const [numero] = [...c.parNumero].sort((x, y) => y[1].poids - x[1].poids || x[0] - y[0])[0];
    return ligneDuNumero(numero);
  };

  return NUMEROS_DE_POSTE.map((numero): PosteProbable => {
    const poste = posteDuNumero(numero)!;
    const autres = (parNumero.get(numero) ?? []).sort(ordre);
    const choisi = pris.get(numero);
    if (choisi) {
      return {
        numero, poste, joueur: choisi.joueur, nom: choisi.nom, fois: choisi.fois, origine: "numero",
        autres: autres.filter((a) => a.joueur !== choisi.joueur).map((a) => ({ nom: a.nom, fois: a.fois })),
      };
    }
    const i = libres.findIndex((c) => ligneDe(c) === ligneDuNumero(numero));
    if (i >= 0) {
      const [c] = libres.splice(i, 1);
      return { numero, poste, joueur: c.joueur, nom: c.nom, fois: 0, origine: "ligne", autres: autres.map((a) => ({ nom: a.nom, fois: a.fois })) };
    }
    return { numero, poste, joueur: null, nom: null, fois: 0, origine: null, autres: autres.map((a) => ({ nom: a.nom, fois: a.fois })) };
  });
}

/* ----------------------------------- systeme : les indices ----------------------------------- */

function evaluerRegles(cumuls: Map<string, Cumul>): {
  indices: IndiceNumeros[]; scores: Map<FormationNumeros, number>; preuves: number;
} {
  const brut: (IndiceNumeros & { regleRef: Regle })[] = [];
  for (const c of cumuls.values()) {
    for (const regle of REGLES) {
      const paires = regle.paires.map(([a, b]) => {
        const pa = c.parNumero.get(a), pb = c.parNumero.get(b);
        // Un changement qui se repete (chaque numero porte au moins deux fois) compte plein ; un changement isole, moitie.
        const regulier = pa && pb && Math.min(pa.fois, pb.fois) >= 2;
        return pa && pb ? { a, b, pa, pb, force: Math.min(pa.poids, pb.poids) * (regulier ? 1 : FACTEUR_CHANGEMENT_ISOLE) } : null;
      }).filter((p): p is NonNullable<typeof p> => p !== null);
      if (paires.length === 0) continue;
      const force = Math.min(FORCE_MAX_JOUEUR, paires.reduce((s, p) => s + p.force, 0));
      const meilleure = [...paires].sort((x, y) => y.force - x.force || x.a - y.a)[0];
      brut.push({
        regle: regle.id, regleRef: regle, nom: c.nom, numeros: [meilleure.a, meilleure.b],
        fois: [meilleure.pa.fois, meilleure.pb.fois], force: +force.toFixed(2),
        texte: `${c.nom} porte le ${meilleure.a} (${pluriel(meilleure.pa.fois)}) et le ${meilleure.b} (${pluriel(meilleure.pb.fois)}) : ${regle.lecture}.`,
      });
    }
  }

  // Plafond par regle : les indices les plus forts d'abord, le surplus est ecarte.
  const retenus: IndiceNumeros[] = [];
  const scores = new Map<FormationNumeros, number>();
  let preuvesTotales = 0;
  for (const regle of REGLES) {
    let restant = FORCE_MAX_REGLE;
    for (const i of brut.filter((b) => b.regleRef === regle).sort((a, b) => b.force - a.force || a.nom.localeCompare(b.nom))) {
      if (restant <= 0) break;
      const force = Math.min(i.force, restant);
      restant -= force;
      preuvesTotales += force;
      const { regleRef, ...indice } = i;
      retenus.push({ ...indice, force: +force.toFixed(2) });
      for (const [f, vote] of Object.entries(regle.votes) as [FormationNumeros, number][]) {
        scores.set(f, (scores.get(f) ?? 0) + force * vote);
      }
    }
  }
  retenus.sort((a, b) => b.force - a.force || a.nom.localeCompare(b.nom) || a.regle.localeCompare(b.regle));
  return { indices: retenus, scores, preuves: Math.min(1, preuvesTotales / FORCE_SUFFISANTE) };
}

/** Poids de chaque systeme soutenu par au moins un indice, en %, du plus au moins probable. */
function distributionDe(scores: Map<FormationNumeros, number>): { systeme: string; poids: number }[] {
  const total = [...scores.values()].reduce((s, x) => s + x, 0);
  if (total <= 0) return [];
  // A egalite : l'ordre de FORMATIONS_NUMEROS (les plus courantes d'abord).
  return FORMATIONS_NUMEROS.filter((f) => (scores.get(f) ?? 0) > 0)
    .map((f) => ({ systeme: f as string, score: scores.get(f)! }))
    .sort((a, b) => b.score - a.score)
    .map((c) => ({ systeme: c.systeme, poids: Math.round((c.score / total) * 100) }));
}

/**
 * Le systeme en tete, s'il y a assez de preuves ET s'il devance nettement le suivant ; sinon null (indices trop minces
 * ou contradictoires). Sa confiance : sa part face au suivant, plafonnee, d'autant plus basse que les preuves sont minces.
 */
function estimerSysteme(scores: Map<FormationNumeros, number>, preuves: number): EstimationNumeros | null {
  const classes = FORMATIONS_NUMEROS.filter((f) => (scores.get(f) ?? 0) > 0)
    .map((f) => ({ systeme: f as string, score: scores.get(f)! }))
    .sort((a, b) => b.score - a.score);
  if (classes.length === 0 || preuves < PREUVES_SYSTEME) return null;
  const [premier, second] = [classes[0].score, classes[1]?.score ?? 0];
  const avance = (premier - second) / premier;
  if (avance < AVANCE_MINIMALE) return null;
  return {
    systeme: classes[0].systeme,
    confiance: Math.round(PLAFOND_CONFIANCE_NUMEROS * (premier / (premier + second)) * preuves),
    fiabilite: preuves >= 1 && avance >= 0.5 ? "moyenne" : "faible",
    distribution: distributionDe(scores), preuves: +preuves.toFixed(2),
  };
}

/** Ce que la distribution dit des lignes (defenseurs, attaquants), quand une valeur domine (60 % et plus). */
export function structureDe(estimation: { distribution: { systeme: string; poids: number }[] } | null): StructureNumeros {
  if (!estimation) return { defense: null, attaque: null };
  const nombres = (s: string) => s.split("-").map(Number);
  const cumuler = (cle: (n: number[]) => number) => {
    const m = new Map<number, number>();
    for (const d of estimation.distribution) {
      const v = cle(nombres(d.systeme));
      m.set(v, (m.get(v) ?? 0) + d.poids);
    }
    const total = [...m.values()].reduce((s, x) => s + x, 0);
    const [valeur, poids] = [...m].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0] ?? [0, 0];
    return total > 0 && poids / total >= 0.6 ? { valeur, part: Math.round((poids / total) * 100) } : null;
  };
  const d = cumuler((n) => n[0]);
  const a = cumuler((n) => n[n.length - 1]);
  return {
    defense: d && { lignes: d.valeur, part: d.part },
    attaque: a && { attaquants: a.valeur, part: a.part },
  };
}
