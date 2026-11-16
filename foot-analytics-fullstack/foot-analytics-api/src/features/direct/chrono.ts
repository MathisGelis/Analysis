// src/features/direct/chrono.ts
//
// Le chrono d'un match en direct : fonctions pures, sans horloge cachee (l'instant est toujours passe en argument).
//
// L'etat se resume a quatre valeurs : le statut, la periode (1 ou 2), le temps deja joue dans la periode (accumule) et
// l'instant ou la periode a redemarre pour la derniere fois (nul si le chrono est arrete). Tout appareil qui lit cet etat
// et l'heure du serveur calcule la meme minute : c'est ce qui permettra, plus tard, de saisir a plusieurs.
//
// Convention de minute : minute = minutes ecoulees depuis le debut de la periode, plus celles des periodes precedentes
// (34:12 de jeu = minute 34). Apres 45:00 en premiere periode, la minute continue (47) : l'affichage en fait « 45+2 ».

export type StatutDirect = "avant" | "en_cours" | "pause" | "mi_temps" | "termine";

export type ActionChrono = "demarrer" | "pause" | "reprendre" | "mi_temps" | "deuxieme_periode" | "fin" | "corriger";

export const ACTIONS_CHRONO: readonly ActionChrono[] = ["demarrer", "pause", "reprendre", "mi_temps", "deuxieme_periode", "fin", "corriger"];

export interface EtatChrono {
  statut: StatutDirect;
  /** 1 ou 2 ; 1 tant que le match n'a pas commence. */
  periode: number;
  /** Millisecondes de jeu deja ecoulees dans la periode, hors le tronçon en cours. */
  accumuleMs: number;
  /** Instant (ms depuis 1970) du dernier demarrage de la periode ; null si le chrono est arrete. */
  demarreLe: number | null;
  /** Duree d'une periode, en minutes (45 par defaut ; 35 ou 40 en jeunes). */
  dureePeriodeMin: number;
}

export class TransitionChronoInvalide extends Error {}

export const etatInitial = (dureePeriodeMin = 45): EtatChrono => ({ statut: "avant", periode: 1, accumuleMs: 0, demarreLe: null, dureePeriodeMin });

/** Minute a laquelle la periode commence : 0 en premiere periode, la duree d'une periode en seconde. */
export const baseDeLaPeriode = (e: Pick<EtatChrono, "periode" | "dureePeriodeMin">): number => (e.periode - 1) * e.dureePeriodeMin;

/** Millisecondes de jeu ecoulees dans la periode courante. */
export function ecouleMs(e: EtatChrono, maintenant: number): number {
  return e.accumuleMs + (e.demarreLe === null ? 0 : Math.max(0, maintenant - e.demarreLe));
}

/** La minute de jeu (entiere, sans arrondi vers le haut) : celle que l'on note sur un evenement. */
export function minuteDe(e: EtatChrono, maintenant: number): number {
  return baseDeLaPeriode(e) + Math.floor(ecouleMs(e, maintenant) / 60_000);
}

/** « 34 », ou « 45+2 » quand la periode depasse sa duree (temps additionnel). */
export function libelleMinute(minute: number, periode: number, dureePeriodeMin: number): string {
  const fin = periode * dureePeriodeMin;
  return minute >= fin && periode <= 2 ? `${fin}+${minute - fin}` : String(minute);
}

/**
 * Applique une action de chrono. `minute` ne sert qu'a « corriger » : le chrono se recale sur cette minute (de match, pas de
 * periode) sans changer son etat, en marche ou a l'arret. Refuse ce qui n'a pas de sens (reprendre un chrono qui tourne).
 */
export function appliquerChrono(e: EtatChrono, action: ActionChrono, maintenant: number, minute?: number): EtatChrono {
  const refuser = (msg: string): never => { throw new TransitionChronoInvalide(msg); };
  const arrete = (): EtatChrono => ({ ...e, accumuleMs: ecouleMs(e, maintenant), demarreLe: null });
  switch (action) {
    case "demarrer":
      if (e.statut !== "avant") return refuser("Le match a deja commence.");
      return { ...e, statut: "en_cours", periode: 1, accumuleMs: 0, demarreLe: maintenant };
    case "pause":
      if (e.statut !== "en_cours") return refuser("Le chrono n'est pas en marche.");
      return { ...arrete(), statut: "pause" };
    case "reprendre":
      if (e.statut !== "pause") return refuser("Le chrono n'est pas en pause.");
      return { ...e, statut: "en_cours", demarreLe: maintenant };
    case "mi_temps":
      if (e.statut !== "en_cours" && e.statut !== "pause") return refuser("La mi-temps ne se siffle que pendant la premiere periode.");
      if (e.periode !== 1) return refuser("La mi-temps est deja passee.");
      return { ...arrete(), statut: "mi_temps" };
    case "deuxieme_periode":
      if (e.statut !== "mi_temps") return refuser("La deuxieme periode commence apres la mi-temps.");
      return { ...e, statut: "en_cours", periode: 2, accumuleMs: 0, demarreLe: maintenant };
    case "fin":
      if (e.statut === "avant" || e.statut === "termine") return refuser("Le match n'est pas en cours.");
      return { ...arrete(), statut: "termine" };
    case "corriger": {
      if (e.statut === "avant") return refuser("Le match n'a pas commence.");
      if (minute === undefined || !Number.isInteger(minute) || minute < 0 || minute > 200) return refuser("Minute invalide.");
      const dansLaPeriode = (minute - baseDeLaPeriode(e)) * 60_000;
      return { ...e, accumuleMs: Math.max(0, dansLaPeriode), demarreLe: e.demarreLe === null ? null : maintenant };
    }
  }
}
