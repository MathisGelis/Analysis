// src/features/ia/ia-live.ts
//
// LE MODELE EN DIRECT : de l'historique d'une equipe (ses feuilles deja jouees), la compo probable du prochain match
// d'apres le modele actif. Meme code que l'entrainement (ia-modele.ts) : ce qui a ete mesure est ce qui est servi.
// Fonctions pures.

import { trierChronologiquement, parseDateFlexible } from "@/common/dates";
import { lignesDeFeuille } from "@/features/analyse/compo-numeros";

import type { FeuilleEquipe } from "./ia-donnees";
import { PoidsIa, predireOnze, preparerCandidats } from "./ia-modele";

/** Un match joue d'une equipe, tel que le rapport d'equipe le connait. */
export interface MatchDeLEquipe {
  m: { id: string; date?: string | null; journee?: string | null; saisonId?: string | null };
  dom: boolean;
  titulaires: { nom: string; prenom?: string | null; licence?: string | null; numero: number; titulaire: boolean; minutes?: number | null }[];
  bancs: { nom: string; prenom?: string | null; licence?: string | null; numero: number; titulaire: boolean; minutes?: number | null }[];
}

/** Les feuilles de l'equipe, de la plus ancienne a la plus recente, au format de l'entrainement. */
export function feuillesDeLEquipe(matchs: readonly MatchDeLEquipe[]): FeuilleEquipe[] {
  const classes = trierChronologiquement(matchs.map((i) => ({ i, date: i.m.date ?? null, journee: i.m.journee ?? null }))).map((x) => x.i);
  const feuilles: FeuilleEquipe[] = [];
  for (const i of classes) {
    const brutes = [...i.titulaires, ...i.bancs];
    if (!brutes.some((c) => c.titulaire)) continue;
    const lues = lignesDeFeuille(i.m, brutes);
    const vus = new Set<string>();
    const lignes: FeuilleEquipe["lignes"] = [];
    lues.forEach((l, k) => {
      if (vus.has(l.joueur)) return;
      vus.add(l.joueur);
      lignes.push({ joueur: l.joueur, nom: l.nom, numero: l.numero, titulaire: l.titulaire, minutes: Math.max(0, brutes[k].minutes ?? 0) });
    });
    feuilles.push({
      matchId: i.m.id, equipe: "direct", libelleEquipe: "", adversaire: "", date: i.m.date ?? "", temps: parseDateFlexible(i.m.date) ?? 0,
      journee: i.m.journee ?? null, saisonId: i.m.saisonId ?? null, domicile: i.dom, lignes, formation: null,
    });
  }
  return feuilles;
}

export interface CompoProbableModele {
  /** Les 11 titulaires predits ; `numero` quand les numeros de l'equipe suivent la convention des postes. */
  titulaires: { nom: string; numero: number | null; proba: number; titularisations: number }[];
  /** Probabilite moyenne des 11 (0 a 1). */
  confiance: number;
  /** Nombre de feuilles lues. */
  sur: number;
}

/** La compo probable d'apres le modele, ou null si l'equipe n'a aucune feuille avec onze. */
export function compoProbableDuModele(poids: PoidsIa, matchs: readonly MatchDeLEquipe[], saisonId: string | null): CompoProbableModele | null {
  const feuilles = feuillesDeLEquipe(matchs);
  const prep = preparerCandidats([...feuilles].reverse(), saisonId, poids.hyper.fenetre);
  const pred = predireOnze(poids, prep);
  if (!pred) return null;
  const titularisations = new Map(prep.candidats.map((c) => [c.joueur, c.titularisations]));
  return {
    titulaires: pred.titulaires.map((t) => ({ nom: t.nom, numero: t.numero, proba: +t.proba.toFixed(3), titularisations: titularisations.get(t.joueur) ?? 0 })),
    confiance: +pred.confiance.toFixed(3), sur: prep.n,
  };
}
