// src/features/analyse/situation-equipe.ts
//
// SITUATION d'une equipe d'apres ses derniers matchs : le dispositif qu'elle joue et son dernier match. Rien
// n'est suppose : le dispositif ne vient que des systemes que le staff a RENSEIGNES sur les matchs (voir
// features/matchs/systeme.ts : la FMI n'en contient aucun), et le dernier match est le plus recent des matchs joues.
// Fonctions pures.

import { predireSysteme, PredictionSysteme, systemesRenseignes } from "@/features/matchs/systeme";
import { trierChronologiquement } from "@/common/dates";

export interface MatchSituation {
  id: string; date: string | null; journee: string | null;
  clubDom: string; clubExt: string;
  equipeDomId?: string | null; equipeExtId?: string | null;
  scoreDom: number; scoreExt: number;
  formationDom?: string | null; formationExt?: string | null;
}

/** Qui on regarde : une equipe precise, sinon le club (toutes ses equipes). */
export interface CibleSituation { clubId: string; equipeId: string | null }

/** Cote du match sur lequel joue la cible. */
export function coteDe(m: MatchSituation, cible: CibleSituation): "dom" | "ext" {
  if (cible.equipeId) return m.equipeDomId === cible.equipeId ? "dom" : "ext";
  return m.clubDom === cible.clubId ? "dom" : "ext";
}

export interface DernierMatch {
  id: string; date: string | null; journee: string | null; domicile: boolean; adversaireId: string;
  bp: number; bc: number; issue: "V" | "N" | "D";
  /** Dispositif renseigne pour CE match, null sinon. */
  formation: string | null;
}

export interface SituationSysteme {
  prediction: PredictionSysteme | null;
  /** Matchs joues dont le dispositif est renseigne, et matchs joues au total. */
  observes: number;
  matchs: number;
  /** Le plus recent des matchs joues : c'est la que le staff peut renseigner le dispositif. */
  dernierMatchId: string | null;
}

export function systemeDe(matchsJoues: MatchSituation[], cible: CibleSituation): SituationSysteme {
  const observations = matchsJoues.flatMap((m) => {
    const s = systemesRenseignes(m);
    const systeme = coteDe(m, cible) === "dom" ? s.dom : s.ext;
    return systeme ? [{ date: m.date ?? null, systeme }] : [];
  });
  const chrono = trierChronologiquement(matchsJoues);
  return {
    prediction: predireSysteme(observations), observes: observations.length, matchs: matchsJoues.length,
    dernierMatchId: chrono.at(-1)?.id ?? null,
  };
}

/** Matchs joues, du plus recent au plus ancien (date, puis journee). */
export function plusRecentsDAbord<T extends { date: string | null; journee: string | null }>(matchs: T[]): T[] {
  return trierChronologiquement(matchs).reverse();
}

export function versDernierMatch(m: MatchSituation, cible: CibleSituation): DernierMatch {
  const cote = coteDe(m, cible);
  const bp = cote === "dom" ? m.scoreDom : m.scoreExt;
  const bc = cote === "dom" ? m.scoreExt : m.scoreDom;
  const s = systemesRenseignes(m);
  return {
    id: m.id, date: m.date ?? null, journee: m.journee ?? null, domicile: cote === "dom",
    adversaireId: cote === "dom" ? m.clubExt : m.clubDom, bp, bc,
    issue: bp > bc ? "V" : bp === bc ? "N" : "D",
    formation: cote === "dom" ? s.dom : s.ext,
  };
}
