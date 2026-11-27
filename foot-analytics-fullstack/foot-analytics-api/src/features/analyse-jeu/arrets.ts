// src/features/analyse-jeu/arrets.ts
//
// LES ARRETS DU GARDIEN d'un match : un tir adverse arrete (cadre, ou penalty arrete) est un arret, sans double saisie ; la touche
// « Arret » du direct reste pour un arret qui n'est pas saisi comme tir. On garde le plus grand des deux comptes (jamais la somme :
// un meme arret pourrait etre note deux fois), comme le fait `compteurs` (direct/stats-direct.ts).
//
// Chaque arret est attribue au gardien en jeu a cette minute : le gardien de depart (avant-match), remplace quand un remplacement
// le fait sortir. Sans gardien connu, l'arret compte pour l'equipe mais pas pour un joueur. Fonction pure.

import { estBut, estTirArrete } from "../direct/stats-direct";
import type { MatchJeu } from "./jeu-equipe";
import { xgDuTir } from "./xg";

export interface ArretsDuMatch {
  /** Les arrets de l'equipe analysee. */
  total: number;
  /** Par fiche de gardien : seulement ceux qu'on sait attribuer. */
  parGardien: Record<string, number>;
}

export function arretsDuMatch(m: MatchJeu): ArretsDuMatch {
  const nous = m.domicile ? "dom" : "ext";
  const eux = m.domicile ? "ext" : "dom";

  const saisis = m.evenements.filter((e) => e.cote === nous && e.type === "arret");
  const derives = m.evenements.filter((e) => e.cote === eux && estTirArrete(e)).sort((a, b) => a.minute - b.minute);
  const total = Math.max(saisis.length, derives.length);

  const parGardien: Record<string, number> = {};
  const ajouter = (id: string | null | undefined) => { if (id) parGardien[id] = (parGardien[id] ?? 0) + 1; };

  if (saisis.length >= derives.length) {
    for (const e of saisis) ajouter(e.joueurId);
    return { total, parGardien };
  }
  // Arrets deduits des tirs : le gardien en jeu a la minute du tir. Un remplacement qui fait sortir le gardien le remplace par le joueur entrant.
  const remplacements = m.evenements.filter((e) => e.cote === nous && e.type === "remplacement" && e.joueurId && e.joueur2Id).sort((a, b) => a.minute - b.minute);
  for (const tir of derives) {
    let gardien = m.gardien ?? null;
    for (const r of remplacements) if (r.minute <= tir.minute && r.joueurId === gardien) gardien = r.joueur2Id ?? gardien;
    ajouter(gardien);
  }
  // Un arret saisi a la main avec un gardien nomme garde son attribution quand les arrets deduits ne couvrent pas tout.
  return { total, parGardien };
}

/** Ce qu'un gardien a vecu dans un match : les tirs cadres subis, ses arrets, les buts encaisses quand il etait dans les buts, le xG cadre. */
export interface ParcoursGardien { tirsCadres: number; arrets: number; butsEncaisses: number; xgCadres: number; penaltysSubis: number; penaltysArretes: number }

/** Le gardien en jeu a une minute : celui de depart, remplace quand un remplacement le fait sortir. */
function gardienA(m: MatchJeu, minute: number): string | null {
  const nous = m.domicile ? "dom" : "ext";
  let gardien = m.gardien ?? null;
  const remplacements = m.evenements.filter((e) => e.cote === nous && e.type === "remplacement" && e.joueurId && e.joueur2Id).sort((a, b) => a.minute - b.minute);
  for (const r of remplacements) if (r.minute <= minute && r.joueurId === gardien) gardien = r.joueur2Id ?? gardien;
  return gardien;
}

/**
 * Pour chaque gardien du match : ce qu'il a subi quand il etait dans les buts (d'apres le gardien de depart et les remplacements). Les arrets
 * sont ceux de `arretsDuMatch` (saisis avec le gardien nomme, sinon deduits des tirs arretes) : un meme arret n'est jamais compte deux fois.
 */
export function parcoursDesGardiens(m: MatchJeu): Record<string, ParcoursGardien> {
  const nous = m.domicile ? "dom" : "ext";
  const res: Record<string, ParcoursGardien> = {};
  const de = (id: string) => (res[id] ??= { tirsCadres: 0, arrets: 0, butsEncaisses: 0, xgCadres: 0, penaltysSubis: 0, penaltysArretes: 0 });
  for (const e of m.evenements) {
    if (e.cote === nous || !e.resultat || !(e.type === "tir" || e.type === "coup_franc" || e.type === "penalty")) continue;
    const g = gardienA(m, e.minute);
    if (!g) continue;
    if (e.type === "penalty") { de(g).penaltysSubis++; if (estTirArrete(e)) de(g).penaltysArretes++; }
    if (!(estBut(e) || estTirArrete(e))) continue;
    const x = de(g);
    x.tirsCadres++; x.xgCadres += xgDuTir(e);
    if (estBut(e)) x.butsEncaisses++;
  }
  for (const [id, n] of Object.entries(arretsDuMatch(m).parGardien)) de(id).arrets += n;
  return res;
}
