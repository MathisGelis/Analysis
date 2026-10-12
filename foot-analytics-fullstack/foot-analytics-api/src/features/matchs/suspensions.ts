// src/features/matchs/suspensions.ts
//
// SUSPENSIONS apres un carton rouge. Un joueur expulse (carton rouge direct ou second jaune) est suspendu au moins UN match :
// il n'est donc pas dans la composition du match suivant. Seul le dernier match joue compte ici (c'est celui qui precede le
// prochain) ; la duree exacte d'une suspension (decidee par la commission) n'est pas dans la FMI, on ne retient que le minimum.
// Fonctions pures. Les cartons du staff ne sont pas des evenements "carton" (voir features/fmi/carton-staff.ts).

import { trierChronologiquement } from "@/common/dates";

import type { Composition } from "./composition.entity";
import type { EvenementMatch } from "./evenement-match.entity";
import { estMatchJoue } from "./match-joue";
import { designeLeJoueur } from "./minutes";

type Evt = Pick<EvenementMatch, "type" | "sousType" | "equipe" | "joueur">;

/** Sanction qui suspend : carton rouge, ou second jaune. */
export const estSanctionRouge = (sousType: string | null | undefined): boolean => sousType === "rouge" || sousType === "double_jaune";

/** Ce joueur a-t-il ete expulse dans ce match ? */
export function expulseDansLeMatch(compo: Pick<Composition, "nom" | "prenom" | "cote">, evenements: readonly Evt[]): boolean {
  return evenements.some((e) => e.type === "carton" && estSanctionRouge(e.sousType) && e.equipe === compo.cote && designeLeJoueur(e.joueur, compo));
}

/** Le dernier match joue de la liste (par date, puis journee), null sans match joue. */
export function dernierMatchJoue<M extends { date: string | null; journee: string | null; statut?: string | null }>(matchs: readonly M[]): M | null {
  return trierChronologiquement(matchs.filter((m) => estMatchJoue(m))).at(-1) ?? null;
}
