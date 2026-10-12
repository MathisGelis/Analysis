// src/features/matchs/lib/onze.ts
//
// Le onze d'une feuille de match, dans l'ordre ou le terrain le range : le terrain remplit ses lignes dans l'ordre de la liste
// (gardien, puis defense, milieu, attaque), donc le gardien doit etre PREMIER, quel que soit son maillot : le 1, ou le 16
// (convention du staff). Trie par numero, le onze mettait le 2 au but et le 16 en attaque. Fonction pure.

import { estNumeroGardien } from "@/features/tactique/lib/composition";

export function ordonnerOnze<T extends { numero: number }>(titulaires: readonly T[]): T[] {
  return [...titulaires].sort((a, b) =>
    Number(!estNumeroGardien(a.numero)) - Number(!estNumeroGardien(b.numero)) || a.numero - b.numero);
}
