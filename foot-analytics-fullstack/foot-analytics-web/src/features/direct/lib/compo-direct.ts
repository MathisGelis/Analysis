// src/features/direct/lib/compo-direct.ts
//
// L'EFFECTIF EN DIRECT : qui est sur le terrain, et a quel poste, a cet instant du match. On part du onze du coup d'envoi (l'avant-match),
// puis on rejoue les evenements de notre equipe : un remplacement met l'entrant au poste du sortant, un carton rouge laisse le joueur a son
// poste (grise, plus selectionnable), un changement de systeme replace les joueurs dans le nouveau dispositif. Tout se deduit des evenements :
// annuler ou corriger une saisie recalcule la compo. Fonctions pures.

import type { Cote, EvenementDirect, JoueurDirect } from "./direct-types";

export interface SlotCompo {
  /** Le joueur au poste ; null = poste vide (onze incomplet, ou joueur expulse retire au changement de systeme). */
  joueur: JoueurDirect | null;
  /** Expulse : il reste affiche a son poste (grise) tant que le dispositif ne change pas. */
  expulse: boolean;
}

export interface EtatCompo {
  formation: string;
  /** 11 postes, dans l'ordre du terrain : gardien d'abord, puis chaque ligne de la gauche vers la droite. */
  slots: SlotCompo[];
  /** Les remplacants qui peuvent encore entrer (ni deja entres, ni sortis). */
  banc: JoueurDirect[];
  /** Ceux qui ont quitte le terrain (remplaces ou expulses) : plus selectionnables. */
  sortis: JoueurDirect[];
}

/** Les lignes d'un dispositif, gardien compris : "4-1-2-1-2" -> [1, 4, 1, 2, 1, 2]. null si le dispositif est illisible. */
export function lignesDeFormation(formation: string | null | undefined): number[] | null {
  const n = (formation ?? "").split("-").map((x) => Number(x.trim()));
  if (n.length < 2 || n.length > 5 || n.some((x) => !Number.isInteger(x) || x < 1 || x > 6) || n.reduce((s, x) => s + x, 0) !== 10) return null;
  return [1, ...n];
}

const meme = (j: JoueurDirect, id: string | null, numero: number | null) => (id ? j.id === id : numero !== null && j.numero === numero);

/** Le joueur designe par un evenement : sa fiche si on la connait, sinon un joueur reduit a son numero et son nom saisis. */
function joueurDe(joueurs: JoueurDirect[], id: string | null, numero: number | null, nom: string | null): JoueurDirect | null {
  const connu = joueurs.find((j) => meme(j, id, numero));
  if (connu) return connu;
  if (numero === null && !id) return null;
  return { id: id ?? `n${numero}`, nom: nom ?? "", prenom: null, poste: null, numero, role: "groupe" };
}

/** Les evenements de notre equipe qui changent la compo, dans l'ordre du match. */
function evenementsDeCompo(evenements: EvenementDirect[], nous: Cote): EvenementDirect[] {
  return evenements
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.cote === nous && (e.type === "remplacement" || e.type === "carton_rouge" || e.type === "systeme"))
    .sort((a, b) => a.e.periode - b.e.periode || a.e.minute - b.e.minute || a.i - b.i)
    .map(({ e }) => e);
}

/**
 * Replace les joueurs encore sur le terrain dans un nouveau dispositif : dans l'ordre des postes (gardien, defense, milieu, attaque), sans les
 * expulses ; s'il manque un joueur, le dernier poste (le plus avance) reste vide.
 */
export function repartirDansSysteme(slots: SlotCompo[], formation: string): SlotCompo[] {
  const lignes = lignesDeFormation(formation);
  const total = lignes ? lignes.reduce((s, x) => s + x, 0) : slots.length;
  const presents = slots.filter((s) => s.joueur && !s.expulse).map((s) => s.joueur as JoueurDirect);
  return Array.from({ length: total }, (_, i) => ({ joueur: presents[i] ?? null, expulse: false }));
}

export function etatCompo(args: {
  compo: { formation: string; titulaires: string[] }; joueurs: JoueurDirect[]; evenements: EvenementDirect[]; nousCote: Cote;
}): EtatCompo {
  const { compo, joueurs, evenements, nousCote } = args;
  let formation = compo.formation;
  let slots: SlotCompo[] = Array.from({ length: Math.max(11, compo.titulaires.length) }, (_, i) => ({
    joueur: joueurs.find((j) => j.id === compo.titulaires[i]) ?? null, expulse: false,
  }));
  const sortis: JoueurDirect[] = [];
  const entres = new Set<string>();

  for (const e of evenementsDeCompo(evenements, nousCote)) {
    if (e.type === "systeme") {
      if (!lignesDeFormation(e.resultat)) continue;
      formation = e.resultat as string;
      const voulu = e.contextes.length === lignesDeFormation(formation)!.reduce((s, x) => s + x, 0)
        ? e.contextes.map((id) => (id ? joueurs.find((j) => j.id === id) ?? slots.find((s) => s.joueur?.id === id)?.joueur ?? null : null)) : null;
      // L'arrangement choisi a l'ecran est garde ; a defaut (ou si un joueur qu'il cite n'est plus la), repartition automatique.
      const arrangement = voulu && voulu.every((j) => !j || slots.some((s) => s.joueur?.id === j.id && !s.expulse));
      slots = arrangement ? voulu!.map((j) => ({ joueur: j, expulse: false })) : repartirDansSysteme(slots, formation);
    } else if (e.type === "remplacement") {
      const i = slots.findIndex((s) => s.joueur && !s.expulse && meme(s.joueur, e.joueurId, e.joueurNumero));
      const entrant = joueurDe(joueurs, e.joueur2Id, e.joueur2Numero, e.joueur2Nom);
      if (i < 0 || !entrant) continue;
      sortis.push(slots[i].joueur as JoueurDirect);
      entres.add(entrant.id);
      slots = slots.map((s, k) => (k === i ? { joueur: entrant, expulse: false } : s));
    } else if (e.type === "carton_rouge") {
      const i = slots.findIndex((s) => s.joueur && !s.expulse && meme(s.joueur, e.joueurId, e.joueurNumero));
      if (i < 0) continue;
      sortis.push(slots[i].joueur as JoueurDirect);
      slots = slots.map((s, k) => (k === i ? { ...s, expulse: true } : s));
    }
  }

  const surLeTerrain = new Set(slots.filter((s) => s.joueur).map((s) => (s.joueur as JoueurDirect).id));
  const dejaSortis = new Set(sortis.map((j) => j.id));
  const titulairesDepart = new Set(compo.titulaires.filter(Boolean));
  const banc = joueurs.filter((j) => j.role === "remplacant" && !titulairesDepart.has(j.id) && !surLeTerrain.has(j.id) && !dejaSortis.has(j.id) && !entres.has(j.id));
  return { formation, slots, banc, sortis };
}

/** Le nombre de joueurs encore sur le terrain (les expulses ne comptent plus). */
export const joueursSurLeTerrain = (etat: EtatCompo): number => etat.slots.filter((s) => s.joueur && !s.expulse).length;
