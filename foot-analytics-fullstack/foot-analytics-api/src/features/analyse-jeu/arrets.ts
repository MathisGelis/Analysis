// src/features/analyse-jeu/arrets.ts
//
// LES ARRETS DU GARDIEN d'un match : un tir adverse arrete (cadre, ou penalty arrete) est un arret, sans double saisie ; la touche
// « Arret » du direct reste pour un arret qui n'est pas saisi comme tir. On garde le plus grand des deux comptes (jamais la somme :
// un meme arret pourrait etre note deux fois), comme le fait `compteurs` (direct/stats-direct.ts).
//
// Chaque arret est attribue au gardien en jeu a cette minute : le gardien de depart (avant-match), remplace quand un remplacement
// le fait sortir. Sans gardien connu, l'arret compte pour l'equipe mais pas pour un joueur. Fonction pure.

import { estTirArrete } from "../direct/stats-direct";
import type { MatchJeu } from "./jeu-equipe";

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
