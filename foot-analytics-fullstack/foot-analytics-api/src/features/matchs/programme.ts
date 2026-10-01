// src/features/matchs/programme.ts
//
// Rapprochement d'une feuille de match FMI avec un match DEJA PROGRAMME (saisi a la main avant la
// rencontre, statut "prevu"). Sans lui, l'import cree un second match et laisse le premier "a venir"
// pour toujours : le plan de jeu prepare (rattache au match programme) ne serait jamais compare au
// realise. Fonction pure : la requete (memes clubs, meme sens) est faite par l'appelant.

import { parseDateFlexible } from "@/common/dates";

const JOUR = 86_400_000;

/** Statuts d'un match qui n'a pas (encore) de feuille : candidats au rapprochement. */
export const STATUTS_PROGRAMMES = ["prevu", "a_venir", "reporte"] as const;

export interface MatchProgramme {
  id: string;
  date?: string | null;
  statut?: string | null;
  numeroFmi?: string | null;
}

/**
 * Le match programme qui correspond a la feuille jouee le `dateFeuille` : le plus proche en date,
 * a moins de `ecartMaxJours`. Un match "reporte" peut se jouer bien plus tard : il n'a pas de limite.
 * Jamais un match qui a deja sa propre feuille (numero FMI). Date de feuille illisible : null
 * (on prefere un doublon visible a une fusion hasardeuse).
 */
export function choisirProgramme<T extends MatchProgramme>(
  candidats: T[], dateFeuille: string | null | undefined, ecartMaxJours = 45,
): T | null {
  const cible = parseDateFlexible(dateFeuille);
  if (cible === null) return null;
  let meilleur: { m: T; ecart: number } | null = null;
  for (const m of candidats) {
    if (m.numeroFmi) continue;
    if (!(STATUTS_PROGRAMMES as readonly string[]).includes(m.statut ?? "")) continue;
    const d = parseDateFlexible(m.date);
    // Sans date, le match programme reste possible : il ne gagne que faute de mieux.
    const ecart = d === null ? Number.MAX_SAFE_INTEGER : Math.abs(d - cible);
    const limite = m.statut === "reporte" || d === null ? Infinity : ecartMaxJours * JOUR;
    if (ecart > limite) continue;
    if (!meilleur || ecart < meilleur.ecart) meilleur = { m, ecart };
  }
  return meilleur?.m ?? null;
}

// ---------------------------------------------------------------------------
//  Doublons de matchs programmes
// ---------------------------------------------------------------------------

export interface MatchDoublonnable extends MatchProgramme {
  clubDom: string;
  clubExt: string;
  equipeDomId?: string | null;
  equipeExtId?: string | null;
  saisonId?: string | null;
  heure?: string | null;
  terrain?: string | null;
  arbitre?: string | null;
  scoreDom?: number | null;
  scoreExt?: number | null;
  createdAt?: Date | string | null;
}

/** Match programme et rien d'autre : ni feuille FMI, ni score, statut "prevu" ou "a venir" (pas "reporte"). */
const estProgrammePur = (m: MatchDoublonnable) =>
  !m.numeroFmi && (m.statut === "prevu" || m.statut === "a_venir") && !(m.scoreDom || m.scoreExt);

/** Jour du match en AAAA-MM-JJ, quel que soit le format saisi (JJ/MM/AAAA de la FMI ou AAAA-MM-JJ du calendrier). */
function jourDe(date: string | null | undefined): string | null {
  const t = parseDateFlexible(date);
  return t === null ? null : new Date(t).toISOString().slice(0, 10);
}

/** Plus un match programme est renseigne, plus on a envie de le garder. */
function richesse(m: MatchDoublonnable): number {
  return [m.equipeDomId, m.equipeExtId, m.saisonId, m.heure, m.terrain, m.arbitre].filter(Boolean).length;
}

/**
 * Les matchs programmes en double : memes clubs, dans le meme sens, le meme jour. Dans chaque groupe on garde le
 * plus renseigne (equipes, saison, heure...), a egalite le plus ancien ; les autres sont a supprimer. Deux matchs sans
 * jour lisible ne sont jamais consideres comme des doublons (on prefere un doublon visible a une suppression hasardeuse).
 * `retenu` dit quel match garde chaque doublon supprime : c'est lui qui reprend ce qui s'y rattachait (plan de jeu).
 */
export function doublonsProgrammes<T extends MatchDoublonnable>(matchs: T[]): { supprimer: T; retenu: T }[] {
  const groupes = new Map<string, T[]>();
  for (const m of matchs) {
    if (!estProgrammePur(m)) continue;
    const jour = jourDe(m.date);
    if (!jour) continue;
    const cle = `${m.clubDom}|${m.clubExt}|${jour}`;
    groupes.set(cle, [...(groupes.get(cle) ?? []), m]);
  }
  const depuis = (m: T) => (m.createdAt ? new Date(m.createdAt).getTime() : 0);
  const resultat: { supprimer: T; retenu: T }[] = [];
  for (const g of groupes.values()) {
    if (g.length < 2) continue;
    const [retenu, ...autres] = [...g].sort((a, b) => richesse(b) - richesse(a) || depuis(a) - depuis(b) || a.id.localeCompare(b.id));
    for (const supprimer of autres) resultat.push({ supprimer, retenu });
  }
  return resultat;
}

/** Un match programme identique (memes clubs, meme sens, meme jour) existe-t-il deja ? */
export function programmeIdentique<T extends MatchDoublonnable>(
  existants: T[], nouveau: { clubDom: string; clubExt: string; date?: string | null },
): T | undefined {
  const jour = jourDe(nouveau.date);
  if (!jour) return undefined;
  return existants.find((m) => estProgrammePur(m) && m.clubDom === nouveau.clubDom && m.clubExt === nouveau.clubExt && jourDe(m.date) === jour);
}
