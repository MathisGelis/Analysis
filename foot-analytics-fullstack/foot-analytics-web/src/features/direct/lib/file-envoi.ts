// src/features/direct/lib/file-envoi.ts
//
// La file des ecritures en attente d'envoi : ce que l'ecran montre tout de suite (un tir saisi compte deja au score) et que le
// reseau confirme ensuite. Fonctions pures : le hook fait les envois, ici on dit seulement ce qui s'affiche.

import type { EvenementDirect, SaisieEvenement } from "./direct-types";

export type Operation =
  | { genre: "ajout"; evenement: SaisieEvenement }
  | { genre: "suppression"; id: string };

/**
 * Les evenements a afficher : ceux du serveur, moins ceux qu'on a annules, plus (ou a la place) ceux qu'on a saisis ou
 * corriges et que le serveur n'a pas encore confirmes. Tries du plus ancien au plus recent (periode, minute, ordre d'arrivee).
 */
export function evenementsAffiches(serveur: EvenementDirect[], file: Operation[]): EvenementDirect[] {
  const annules = new Set(file.filter((o): o is Extract<Operation, { genre: "suppression" }> => o.genre === "suppression").map((o) => o.id));
  const ajouts = new Map<string, SaisieEvenement>();
  const ordre: string[] = [];
  for (const o of file) {
    if (o.genre === "ajout") { if (!ajouts.has(o.evenement.id)) ordre.push(o.evenement.id); ajouts.set(o.evenement.id, o.evenement); annules.delete(o.evenement.id); }
    else ajouts.delete(o.id);
  }
  const res: EvenementDirect[] = serveur.filter((e) => !annules.has(e.id) && !ajouts.has(e.id));
  for (const id of ordre) { const e = ajouts.get(id); if (e) res.push({ ...e, creeLe: undefined }); }
  const rang = new Map(res.map((e, i) => [e.id, i]));
  return res.sort((a, b) => a.periode - b.periode || a.minute - b.minute || (rang.get(a.id) as number) - (rang.get(b.id) as number));
}

/** La file apres l'envoi reussi de sa premiere operation. */
export const sansLaPremiere = (file: Operation[]): Operation[] => file.slice(1);
