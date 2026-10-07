// src/features/ia/ia-live.ts
//
// LE MODELE EN DIRECT : de l'historique d'une equipe (ses feuilles deja jouees), la compo probable du prochain match
// d'apres le modele actif. Meme code que l'entrainement (ia-modele.ts) : ce qui a ete mesure est ce qui est servi.
// Fonctions pures.

import { trierChronologiquement, parseDateFlexible } from "@/common/dates";
import { lignesDeFeuille, structureDe } from "@/features/analyse/compo-numeros";
import { dispositionDe } from "@/features/analyse/disposition-onze";
import type { SystemeProbable } from "@/features/analyse/systeme-probable";
import { systemesRenseignes } from "@/features/matchs/systeme";

import type { FeuilleEquipe } from "./ia-donnees";
import { HISTORIQUE_MAX } from "./ia-entrainement";
import {
  alignerPoids, CARACTERISTIQUES_SYSTEME, FrequencesSysteme, PoidsIa, predireOnze, predireSysteme, preparerCandidats, preparerSysteme,
} from "./ia-modele";

/** Un match joue d'une equipe, tel que le rapport d'equipe le connait. */
export interface MatchDeLEquipe {
  m: { id: string; date?: string | null; journee?: string | null; saisonId?: string | null; formationDom?: string | null; formationExt?: string | null };
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
    const dispositifs = systemesRenseignes(i.m);
    feuilles.push({
      matchId: i.m.id, equipe: "direct", libelleEquipe: "", adversaire: "", date: i.m.date ?? "", temps: parseDateFlexible(i.m.date) ?? 0,
      journee: i.m.journee ?? null, saisonId: i.m.saisonId ?? null, domicile: i.dom, lignes,
      // Le dispositif SAISI par le staff pour cette equipe sur ce match (jamais une valeur par defaut), comme a l'entrainement.
      formation: i.dom ? dispositifs.dom : dispositifs.ext,
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
  const prep = preparerCandidats([...feuilles].reverse().slice(0, HISTORIQUE_MAX), saisonId, poids.hyper.fenetre);
  const pred = predireOnze(poids, prep);
  if (!pred) return null;
  const titularisations = new Map(prep.candidats.map((c) => [c.joueur, c.titularisations]));
  return {
    titulaires: pred.titulaires.map((t) => ({ nom: t.nom, numero: t.numero, proba: +t.proba.toFixed(3), titularisations: titularisations.get(t.joueur) ?? 0 })),
    confiance: +pred.confiance.toFixed(3), sur: prep.n,
  };
}

/* ------------------------------------------ le dispositif en direct ------------------------------------------ */

export interface SystemeDuModele {
  systeme: string;
  /** Probabilite du dispositif retenu, 0 a 1. */
  proba: number;
  /** Les dispositifs les plus probables, le retenu en tete. */
  classement: { systeme: string; proba: number }[];
}

/**
 * Le dispositif probable d'apres le modele actif, ou null. Le modele de dispositif ne sert que s'il a ete appris sur des
 * dispositifs saisis par le staff ET qu'il a fait au moins aussi bien que le moteur a regles sur les memes matchs pendant
 * l'entrainement (`systemeRetenu`) : un modele non verifie ne remplace jamais le moteur.
 */
export function systemeDuModele(poids: PoidsIa, matchs: readonly MatchDeLEquipe[]): SystemeDuModele | null {
  if (!poids.systeme || poids.systemeRetenu !== true) return null;
  const feuilles = feuillesDeLEquipe(matchs);
  if (feuilles.length === 0) return null;
  const effectifs = new Map(Object.entries(poids.frequencesSysteme));
  const frequences: FrequencesSysteme = { effectifs, total: [...effectifs.values()].reduce((s, n) => s + n, 0) };
  const prep = preparerSysteme([...feuilles].reverse().slice(0, HISTORIQUE_MAX), frequences);
  const pred = predireSysteme(alignerPoids(poids.systeme, CARACTERISTIQUES_SYSTEME), prep);
  return pred ? { systeme: pred.systeme, proba: pred.proba, classement: pred.classement.slice(0, 4) } : null;
}

const pourcent = (p: number) => Math.round(p * 100);

/**
 * Le systeme probable avec l'avis du modele : le modele CHOISIT le dispositif et en donne la probabilite ; ce que disent
 * les dispositifs saisis et les numeros de maillot (`base`) reste la preuve affichee (source, indices, fiabilite). Sans
 * aucune preuve (`base` nul), pas de systeme : le modele ne devine jamais a partir de rien.
 */
export function avecAvisDuModele(base: SystemeProbable | null, modele: SystemeDuModele | null, nomModele: string): SystemeProbable | null {
  if (!base || !modele) return base;
  const alternatives = modele.classement.slice(1).map((c) => ({ systeme: c.systeme, poids: pourcent(c.proba) })).filter((a) => a.poids > 0);
  const confiance = pourcent(modele.proba);
  return {
    ...base,
    systeme: modele.systeme, confiance, alternatives,
    indices: [`Choisi par le modele ${nomModele} : ${modele.systeme} (${confiance} %).`, ...base.indices],
    structure: structureDe({ distribution: [{ systeme: modele.systeme, poids: confiance }, ...alternatives] }),
    disposition: dispositionDe(modele.systeme),
    modele: { nom: nomModele },
  };
}
