// src/features/tactique/lib/composition.ts
//
// Composition d'equipe : dispositifs, postes du terrain, suggestion du onze et points de vigilance.
// Fonctions pures. La regle des joueurs mutes vient de features/tactique/lib/mutations.ts.

import { bilanMutations, motifRefus } from "./mutations";

export const FORMATIONS = ["4-4-2", "4-2-3-1", "4-3-3", "3-5-2", "5-3-2", "3-4-3", "4-1-4-1", "4-5-1"] as const;
export const FORMATION_DEFAUT = "4-2-3-1";
export const NB_TITULAIRES = 11;
export const MAX_REMPLACANTS = 7;
/** Banc propose par defaut (suggestion, premiere ouverture) ; le staff peut aller jusqu'a MAX_REMPLACANTS. */
export const REMPLACANTS_PAR_DEFAUT = 3;

export type Ligne = "GB" | "DEF" | "MIL" | "ATT";
export const LIBELLE_LIGNE: Record<Ligne, string> = { GB: "Gardien", DEF: "Defense", MIL: "Milieu", ATT: "Attaque" };

/** Maillots de gardien, selon la convention du staff : le 1 et le 16 (le gardien remplacant). */
export const NUMEROS_GARDIEN: readonly number[] = [1, 16];
export const estNumeroGardien = (numero: number | null | undefined): boolean => NUMEROS_GARDIEN.includes(numero as number);

/** Ligne d'un poste de la base ("GB", "G", "DC", "MO", "AT", "BU"...) ; null si inconnu. */
export function ligneDuPoste(poste: string | null | undefined): Ligne | null {
  const p = (poste ?? "").trim().toUpperCase();
  if (!p) return null;
  if (p === "G" || p === "GB") return "GB";
  if (p.startsWith("D")) return "DEF";
  if (p.startsWith("M")) return "MIL";
  if (p.startsWith("A") || p === "BU" || p === "ATT") return "ATT";
  return null;
}

/** Nombre de joueurs par ligne d'un dispositif "4-2-3-1" (gardien exclu) ; null si invalide (somme != 10). */
export function parseFormation(formation: string | null | undefined): number[] | null {
  const n = (formation ?? "").split("-").map((x) => Number(x.trim()));
  if (n.length < 2 || n.length > 5 || n.some((x) => !Number.isInteger(x) || x < 1 || x > 6)) return null;
  return n.reduce((s, x) => s + x, 0) === NB_TITULAIRES - 1 ? n : null;
}

/**
 * Dispositif de DEPART de la page Tactique quand aucune composition n'est enregistree : celui que le logiciel a identifie pour
 * l'equipe (dispositifs renseignes sur les derniers matchs, numeros de maillot, IA), s'il est exploitable ; sinon le dispositif
 * par defaut. `identifie` dit si c'est le premier cas (la page l'annonce).
 */
export function formationDeDepart(identifie: string | null | undefined): { formation: string; identifie: boolean } {
  const lignes = parseFormation(identifie);
  return lignes ? { formation: lignes.join("-"), identifie: true } : { formation: FORMATION_DEFAUT, identifie: false };
}

/** Les dispositifs proposes par le selecteur : la liste habituelle, plus le dispositif courant s'il n'y figure pas. */
export function formationsProposees(courante: string): string[] {
  return (FORMATIONS as readonly string[]).includes(courante) || !parseFormation(courante) ? [...FORMATIONS] : [...FORMATIONS, courante];
}

export interface Slot {
  /** Position dans la liste des 11 titulaires (0 = gardien), dans l'ordre d'affichage du terrain. */
  index: number;
  ligne: Ligne;
  /** "GB", "DEF 2", "MIL 1"... */
  libelle: string;
}

/** Les 11 postes du terrain : gardien, puis chaque ligne de gauche a droite. Dispositif invalide : 4-4-2. */
export function slotsDeFormation(formation: string | null | undefined): Slot[] {
  const lignes = parseFormation(formation) ?? [4, 4, 2];
  const slots: Slot[] = [{ index: 0, ligne: "GB", libelle: "GB" }];
  const total: Record<Ligne, number> = { GB: 1, DEF: 0, MIL: 0, ATT: 0 };
  lignes.forEach((nb, li) => { total[li === 0 ? "DEF" : li === lignes.length - 1 ? "ATT" : "MIL"] += nb; });
  const vus: Record<Ligne, number> = { GB: 1, DEF: 0, MIL: 0, ATT: 0 };
  lignes.forEach((nb, li) => {
    const ligne: Ligne = li === 0 ? "DEF" : li === lignes.length - 1 ? "ATT" : "MIL";
    for (let k = 0; k < nb; k++) {
      // Numerotation continue par ligne (MIL 1 a MIL 5 en 4-2-3-1) : chaque poste a un libelle unique.
      slots.push({ index: slots.length, ligne, libelle: total[ligne] === 1 ? ligne : `${ligne} ${++vus[ligne]}` });
    }
  });
  return slots;
}

/** Un joueur de l'effectif, tel que la page tactique le manipule. */
export interface JoueurTactique {
  id: string;
  nom: string;
  prenom?: string | null;
  poste?: string | null;
  numeroFavori?: number | null;
  statutMutation?: string | null;
  matchs?: number | null;
  titularisations?: number | null;
  minutes?: number | null;
  noteMoyenne?: number | null;
  scoreFatigue?: number | null;
  /** Indisponible : blesse ou suspendu. Ne peut pas etre aligne. */
  indisponible?: boolean;
  /** Retour de blessure : alignable, mais a surveiller. */
  enReprise?: boolean;
}

/** Valeur sportive d'un joueur pour la suggestion : temps de jeu, titularisations, note, fraicheur. */
export function valeurJoueur(j: JoueurTactique, max: { titularisations: number; minutes: number }): number {
  const titu = ((j.titularisations ?? 0) / Math.max(1, max.titularisations)) * 40;
  const minutes = ((j.minutes ?? 0) / Math.max(1, max.minutes)) * 20;
  const note = ((j.noteMoyenne ?? 5.5) - 5.5) * 8;
  const f = j.scoreFatigue ?? 0;
  const fatigue = f >= 75 ? -20 : f >= 55 ? -6 : 0;
  return titu + minutes + note + fatigue;
}

export interface Suggestion {
  /** 11 cases dans l'ordre des postes ; null = personne pour ce poste. */
  titulaires: (string | null)[];
  remplacants: string[];
  ecartes: { id: string; raison: string }[];
}

/**
 * Onze suggere : pour chaque poste, le meilleur joueur disponible de la bonne ligne (a defaut, un autre
 * poste, en dernier recours), sans jamais depasser la regle des mutes. Le banc (3 joueurs par defaut) est complete de la meme
 * facon, avec un gardien s'il en reste un. Les indisponibles sont ecartes avec leur raison.
 */
export function suggererOnze(entree: {
  formation: string; joueurs: JoueurTactique[]; maxRemplacants?: number;
}): Suggestion {
  const slots = slotsDeFormation(entree.formation);
  const maxRemplacants = Math.min(entree.maxRemplacants ?? REMPLACANTS_PAR_DEFAUT, MAX_REMPLACANTS);
  const dispo = entree.joueurs.filter((j) => !j.indisponible);
  const ecartes = entree.joueurs.filter((j) => j.indisponible).map((j) => ({ id: j.id, raison: "indisponible" }));
  const max = {
    titularisations: Math.max(1, ...dispo.map((j) => j.titularisations ?? 0)),
    minutes: Math.max(1, ...dispo.map((j) => j.minutes ?? 0)),
  };
  const valeur = new Map(dispo.map((j) => [j.id, valeurJoueur(j, max)]));
  const classes = [...dispo].sort((a, b) => (valeur.get(b.id) ?? 0) - (valeur.get(a.id) ?? 0) || a.nom.localeCompare(b.nom));

  const pris = new Set<string>();
  const statuts: (string | null | undefined)[] = [];
  const prendre = (j: JoueurTactique) => { pris.add(j.id); statuts.push(j.statutMutation); };
  const autorise = (j: JoueurTactique) => !pris.has(j.id) && motifRefus(statuts, j.statutMutation) === null;

  const titulaires: (string | null)[] = Array(NB_TITULAIRES).fill(null);
  // Gardien, defense, milieu, attaque : les postes les plus contraints d'abord.
  for (const slot of [...slots].sort((a, b) => ORDRE_LIGNES[a.ligne] - ORDRE_LIGNES[b.ligne] || a.index - b.index)) {
    const choix = classes.find((j) => autorise(j) && ligneDuPoste(j.poste) === slot.ligne)
      // Pas de joueur de cette ligne : un autre poste, sauf un gardien hors du but.
      ?? classes.find((j) => autorise(j) && (slot.ligne === "GB" || ligneDuPoste(j.poste) !== "GB"));
    if (choix) { titulaires[slot.index] = choix.id; prendre(choix); }
  }

  const remplacants: string[] = [];
  const gardienDisponible = classes.find((j) => autorise(j) && ligneDuPoste(j.poste) === "GB");
  if (gardienDisponible && maxRemplacants > 0) { remplacants.push(gardienDisponible.id); prendre(gardienDisponible); }
  for (const j of classes) {
    if (remplacants.length >= maxRemplacants) break;
    if (autorise(j)) { remplacants.push(j.id); prendre(j); }
  }
  // Ceux que la regle des mutes a empeches d'entrer : le coach doit savoir pourquoi ils manquent.
  for (const j of classes) {
    if (!pris.has(j.id) && motifRefus(statuts, j.statutMutation) !== null) ecartes.push({ id: j.id, raison: "regle des mutes" });
  }
  return { titulaires, remplacants, ecartes };
}

const ORDRE_LIGNES: Record<Ligne, number> = { GB: 0, DEF: 1, MIL: 2, ATT: 3 };

export interface Vigilance {
  niveau: "alerte" | "info";
  texte: string;
}

/**
 * Points d'attention sur la composition en cours : regle des mutes, disponibilite, fatigue, postes, banc.
 * `sansMutations` : n'inclut pas les depassements de la regle des mutes (deja affiches ailleurs).
 */
export function vigilances(entree: {
  formation: string; titulaires: (string | null)[]; remplacants: string[]; joueurs: JoueurTactique[]; sansMutations?: boolean;
}): Vigilance[] {
  const par = new Map(entree.joueurs.map((j) => [j.id, j]));
  const slots = slotsDeFormation(entree.formation);
  const v: Vigilance[] = [];
  const nom = (j: JoueurTactique) => `${j.prenom ?? ""} ${j.nom}`.trim();

  const titulaires = entree.titulaires.map((id) => (id ? par.get(id) ?? null : null));
  const presents = titulaires.filter((j): j is JoueurTactique => !!j);
  const banc = entree.remplacants.map((id) => par.get(id)).filter((j): j is JoueurTactique => !!j);

  const bilan = bilanMutations([...presents, ...banc].map((j) => j.statutMutation));
  if (!entree.sansMutations) for (const violation of bilan.violations) v.push({ niveau: "alerte", texte: violation });
  if (bilan.inconnus > 0) {
    v.push({ niveau: "info", texte: `${bilan.inconnus} joueur${bilan.inconnus > 1 ? "s" : ""} au statut de mutation inconnu : la regle ne peut pas etre verifiee pour eux.` });
  }
  const indispos = [...presents, ...banc].filter((j) => j.indisponible);
  if (indispos.length > 0) v.push({ niveau: "alerte", texte: `Indisponible${indispos.length > 1 ? "s" : ""} dans le groupe : ${indispos.map(nom).join(", ")}.` });
  const fatigues = presents.filter((j) => (j.scoreFatigue ?? 0) >= 75);
  if (fatigues.length > 0) v.push({ niveau: "alerte", texte: `Fatigue en surcharge chez ${fatigues.map(nom).join(", ")} : envisager de les menager.` });
  const reprises = [...presents, ...banc].filter((j) => j.enReprise && !j.indisponible);
  if (reprises.length > 0) v.push({ niveau: "info", texte: `Retour de blessure : ${reprises.map(nom).join(", ")}.` });

  const horsPoste = titulaires
    .map((j, i) => ({ j, slot: slots[i] }))
    .filter(({ j, slot }) => j && slot && ligneDuPoste(j.poste) !== null && ligneDuPoste(j.poste) !== slot.ligne);
  if (horsPoste.length > 0) {
    v.push({ niveau: "info", texte: `Hors de leur ligne : ${horsPoste.map(({ j, slot }) => `${nom(j!)} (${slot.libelle})`).join(", ")}.` });
  }
  if (presents.length > 0 && presents.length < NB_TITULAIRES) {
    v.push({ niveau: "info", texte: `${NB_TITULAIRES - presents.length} poste${NB_TITULAIRES - presents.length > 1 ? "s" : ""} a pourvoir.` });
  }
  if (titulaires[0] && banc.length > 0 && !banc.some((j) => ligneDuPoste(j.poste) === "GB")) {
    v.push({ niveau: "info", texte: "Aucun gardien remplacant sur le banc." });
  }
  return v;
}

export interface OptionJoueur {
  joueur: JoueurTactique;
  /** "poste" : de la ligne du poste a pourvoir ; "autres" : d'une autre ligne. */
  groupe: "poste" | "autres";
  /** Raison pour laquelle ce joueur ne peut pas etre choisi ; null = choisissable. */
  refus: string | null;
}

/**
 * Joueurs proposables pour un poste ou pour le banc. Chaque joueur porte la raison d'un eventuel refus :
 * indisponible, ou regle des mutes (le choix ferait depasser 6 mutes dont 2 hors delai). Le joueur
 * actuellement en place reste toujours choisissable.
 *  - `liste` : ids de toute la liste actuelle (titulaires + remplacants) ;
 *  - `ailleurs` : ids qui ne sont PAS proposables ici (deja places sur un autre poste) ;
 *  - un joueur deja sur le banc peut etre propose pour un poste : il ne compte pas deux fois dans la regle.
 */
export function optionsJoueurs(entree: {
  joueurs: JoueurTactique[];
  ligne: Ligne | null;
  liste: string[];
  ailleurs: Set<string>;
  courantId?: string | null;
}): OptionJoueur[] {
  const statutDe = new Map(entree.joueurs.map((j) => [j.id, j.statutMutation]));
  const max = {
    titularisations: Math.max(1, ...entree.joueurs.map((j) => j.titularisations ?? 0)),
    minutes: Math.max(1, ...entree.joueurs.map((j) => j.minutes ?? 0)),
  };
  return entree.joueurs
    .filter((j) => !entree.ailleurs.has(j.id))
    .map((j): OptionJoueur => {
      // Liste telle qu'elle serait SANS le joueur actuellement a ce poste ni le candidat lui-meme.
      const autres = entree.liste.filter((id) => id !== entree.courantId && id !== j.id).map((id) => statutDe.get(id));
      return {
        joueur: j,
        groupe: entree.ligne && ligneDuPoste(j.poste) === entree.ligne ? "poste" : "autres",
        refus: j.id === entree.courantId ? null
          : j.indisponible ? "indisponible"
          : motifRefus(autres, j.statutMutation) ? "regle des mutes" : null,
      };
    })
    .sort((a, b) =>
      (a.groupe === b.groupe ? 0 : a.groupe === "poste" ? -1 : 1)
      || valeurJoueur(b.joueur, max) - valeurJoueur(a.joueur, max)
      || a.joueur.nom.localeCompare(b.joueur.nom));
}

/**
 * Change de dispositif en gardant un maximum de joueurs a leur place : chaque joueur reste dans sa LIGNE
 * (defense, milieu, attaque) et prend le premier poste libre de cette ligne dans le nouveau dispositif.
 * Ceux qui n'ont plus de poste (passage a 3 defenseurs, par exemple) sortent dans `surplus`, pour
 * que le coach les place sur le banc au lieu de les perdre.
 */
export function changerDispositif(
  ancienne: string, nouvelle: string, titulaires: (string | null)[],
): { titulaires: (string | null)[]; surplus: string[] } {
  const anciensSlots = slotsDeFormation(ancienne);
  const nouveauxSlots = slotsDeFormation(nouvelle);
  const parLigne = new Map<Ligne, string[]>();
  anciensSlots.forEach((slot, i) => {
    const id = titulaires[i];
    if (id) parLigne.set(slot.ligne, [...(parLigne.get(slot.ligne) ?? []), id]);
  });
  const resultat: (string | null)[] = nouveauxSlots.map((slot) => parLigne.get(slot.ligne)?.shift() ?? null);
  const surplus = [...parLigne.values()].flat();
  return { titulaires: resultat, surplus };
}

/** Retire d'une composition les joueurs qui n'existent plus dans l'effectif (plan enregistre puis joueur supprime). */
export function nettoyerComposition(
  plan: { titulaires: (string | null)[]; remplacants: string[] }, idsConnus: Set<string>,
): { titulaires: (string | null)[]; remplacants: string[]; retires: number } {
  let retires = 0;
  const garde = (id: string | null): string | null => {
    if (id && idsConnus.has(id)) return id;
    if (id) retires++;
    return null;
  };
  const titulaires = Array.from({ length: NB_TITULAIRES }, (_, i) => garde(plan.titulaires[i] ?? null));
  const remplacants: string[] = [];
  for (const id of plan.remplacants) { const g = garde(id); if (g && !titulaires.includes(g) && !remplacants.includes(g)) remplacants.push(g); }
  return { titulaires, remplacants, retires };
}
