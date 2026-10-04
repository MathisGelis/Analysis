// src/features/analyse/systeme-probable.ts
//
// SYSTEME PROBABLE d'une equipe : le dispositif que le staff a RENSEIGNE (features/matchs/systeme.ts) et celui que
// lisent les changements de numero (compo-numeros.ts), fusionnes. Le dispositif saisi prime (c'est une donnee), les
// numeros le completent quand il manque ou le confirment / le contredisent ; sans dispositif saisi, les numeros seuls
// donnent une estimation prudente. Aucune des deux sources : pas de systeme. Fonctions pures.

import { PredictionSysteme } from "@/features/matchs/systeme";

import { AnalyseNumeros, structureDe, StructureNumeros } from "./compo-numeros";
import { Disposition, dispositionDe } from "./disposition-onze";

export type Fiabilite = "faible" | "moyenne" | "bonne";

export interface SystemeProbable {
  systeme: string;
  /** 0-100. */
  confiance: number;
  fiabilite: Fiabilite;
  /** renseigne : dispositifs saisis seuls ; numeros : changements de numero seuls ; mixte : les deux. */
  source: "renseigne" | "numeros" | "mixte";
  /** Matchs dont le dispositif est renseigne, et feuilles lues pour les numeros (la base de chaque source). */
  observations: number;
  matchsNumeros: number;
  alternatives: { systeme: string; poids: number }[];
  /** Pourquoi ce systeme, en phrases. */
  indices: string[];
  structure: StructureNumeros;
  /** Ou se placent les numeros 1 a 11 dans ce systeme (voir disposition-onze.ts), pour dessiner le onze sur un terrain. */
  disposition: Disposition;
}

const NIVEAUX: Fiabilite[] = ["faible", "moyenne", "bonne"];
const baisser = (f: Fiabilite): Fiabilite => NIVEAUX[Math.max(0, NIVEAUX.indexOf(f) - 1)];

/** Poids du dispositif saisi dans le melange, selon le nombre de matchs renseignes. */
function poidsManuel(observations: number): number {
  return observations >= 5 ? 0.85 : observations >= 3 ? 0.7 : 0.5;
}

export function fusionnerSystemes(manuel: PredictionSysteme | null, numeros: AnalyseNumeros | null): SystemeProbable | null {
  const est = numeros?.systeme ?? null;
  const matchsNumeros = numeros?.matchs ?? 0;
  const indicesNumeros = (numeros?.indices ?? []).slice(0, 4).map((i) => i.texte);

  if (!manuel && !est) return null;

  if (!est) {
    const m = manuel!;
    return {
      systeme: m.systeme, confiance: m.confiance, fiabilite: m.fiabilite, source: "renseigne",
      observations: m.observations, matchsNumeros, alternatives: m.alternatives,
      indices: [`Dispositif renseigne par le staff sur ${m.observations} match${m.observations > 1 ? "s" : ""}.`],
      structure: structureDe({ distribution: [{ systeme: m.systeme, poids: m.confiance }, ...m.alternatives.map((a) => ({ systeme: a.systeme, poids: a.poids }))] }),
      disposition: dispositionDe(m.systeme),
    };
  }

  if (!manuel) {
    const [, ...autres] = est.distribution;
    return {
      systeme: est.systeme, confiance: est.confiance, fiabilite: est.fiabilite, source: "numeros",
      observations: 0, matchsNumeros, alternatives: autres,
      indices: [
        `Deduit des changements de numero sur ${matchsNumeros} feuille${matchsNumeros > 1 ? "s" : ""} : aucun dispositif renseigne.`,
        ...indicesNumeros,
      ],
      structure: numeros!.structure,
      disposition: dispositionDe(est.systeme),
    };
  }

  // Les deux : melange des deux distributions, le dispositif saisi pesant selon le nombre de matchs renseignes.
  const wM = poidsManuel(manuel.observations);
  const wN = (1 - wM) * est.preuves;
  const poidsSaisis = new Map<string, number>([[manuel.systeme, manuel.confiance], ...manuel.alternatives.map((a): [string, number] => [a.systeme, a.poids])]);
  const poidsNumeros = new Map(est.distribution.map((d): [string, number] => [d.systeme, d.poids]));
  const tous = [...new Set([...poidsSaisis.keys(), ...poidsNumeros.keys()])];
  const melange = tous.map((systeme) => ({
    systeme, poids: ((poidsSaisis.get(systeme) ?? 0) * wM + (poidsNumeros.get(systeme) ?? 0) * wN) / (wM + wN),
  })).sort((a, b) => b.poids - a.poids || (poidsSaisis.get(b.systeme) ?? 0) - (poidsSaisis.get(a.systeme) ?? 0));
  const somme = melange.reduce((s, x) => s + x.poids, 0);
  const norme = melange.map((m) => ({ systeme: m.systeme, poids: Math.round((m.poids / somme) * 100) }));
  const [tete, ...alternatives] = norme;

  // Les numeros confirment-ils le systeme retenu ?
  const dansNumeros = poidsNumeros.has(tete.systeme);
  const memeTete = est.systeme === tete.systeme;
  const verdict = memeTete
    ? "Les changements de numero vont dans le meme sens."
    : dansNumeros
      ? `Les changements de numero sont compatibles (mais pointent plutot vers ${est.systeme}).`
      : `Les changements de numero ne confirment pas ce systeme (ils pointent vers ${est.systeme}).`;
  return {
    systeme: tete.systeme, confiance: tete.poids,
    fiabilite: memeTete || dansNumeros ? manuel.fiabilite : baisser(manuel.fiabilite),
    source: "mixte", observations: manuel.observations, matchsNumeros,
    alternatives: alternatives.filter((a) => a.poids > 0),
    indices: [
      `Dispositif renseigne par le staff sur ${manuel.observations} match${manuel.observations > 1 ? "s" : ""} : ${manuel.systeme}.`,
      verdict, ...indicesNumeros,
    ],
    structure: structureDe({ distribution: norme }),
    disposition: dispositionDe(tete.systeme),
  };
}
