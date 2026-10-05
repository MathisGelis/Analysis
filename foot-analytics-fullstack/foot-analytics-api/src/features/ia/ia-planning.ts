// src/features/ia/ia-planning.ts
//
// LE CALENDRIER du reentrainement automatique : une fois par semaine, le mercredi a 5 h (heure de Paris), apres que le
// week-end de matchs a ete importe. Fonctions pures (l'horloge et la base sont dans ia.service.ts et ia-planificateur.ts).
//
// Rattrapage : si le serveur etait eteint le mercredi, l'entrainement de la semaine est fait des qu'il redemarre (une fois
// par semaine, jamais deux). Un passage anterieur a l'activation du planning ne compte pas : activer le planning un jeudi
// ne declenche pas d'entrainement immediat, le premier est le mercredi suivant.

export const FUSEAU = "Europe/Paris";
/** Mercredi (0 = dimanche). */
export const JOUR_AUTO = 3;
export const HEURE_AUTO = 5;

const JOUR_MS = 86_400_000;

/** Decalage de l'heure de Paris par rapport a UTC, en ms, a un instant donne (heure d'ete comprise). */
function decalageParis(t: number): number {
  const parties = new Intl.DateTimeFormat("en-GB", {
    timeZone: FUSEAU, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(t));
  const v = (type: string) => Number(parties.find((p) => p.type === type)!.value);
  return Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second")) - Math.floor(t / 1000) * 1000;
}

/** L'instant (UTC, ms) ou il est `heure` h a Paris le jour calendaire (annee, mois 0-11, jour). */
function parisVersUtc(annee: number, mois: number, jour: number, heure: number): number {
  const naif = Date.UTC(annee, mois, jour, heure);
  return naif - decalageParis(naif - decalageParis(naif));
}

/** Les passages prevus (mercredi 5 h a Paris) dans les huit jours qui entourent `maintenant`, du plus ancien au plus recent. */
function passagesAutour(maintenant: number): number[] {
  const aujourdhui = Math.floor(maintenant / JOUR_MS) * JOUR_MS;
  const passages: number[] = [];
  for (let k = -8; k <= 8; k++) {
    const jour = new Date(aujourdhui + k * JOUR_MS);
    if (jour.getUTCDay() !== JOUR_AUTO) continue;
    passages.push(parisVersUtc(jour.getUTCFullYear(), jour.getUTCMonth(), jour.getUTCDate(), HEURE_AUTO));
  }
  return passages.sort((a, b) => a - b);
}

/** Le dernier passage prevu, au plus tard `maintenant` (ms UTC). */
export function dernierPassage(maintenant: number): number {
  return passagesAutour(maintenant).filter((t) => t <= maintenant).at(-1)!;
}

/** Le prochain passage prevu, strictement apres `maintenant` (ms UTC). */
export function prochainPassage(maintenant: number): number {
  return passagesAutour(maintenant).find((t) => t > maintenant)!;
}

/** Le planificateur tourne-t-il sur ce serveur ? */
export function planificateurActif(env: NodeJS.ProcessEnv = process.env): boolean {
  const choix = (env.IA_PLANIFICATEUR ?? "").trim().toLowerCase();
  if (choix === "on" || choix === "off") return choix === "on";
  return env.NODE_ENV === "production";
}

export interface ReglagePlanning {
  actif: boolean;
  /** ISO : quand le planning a ete active ; les passages anterieurs ne comptent pas. */
  depuis: string;
}

export interface PassageAuto { creeLe: string; statut: string; message: string | null }

/**
 * L'entrainement automatique de la semaine est-il a faire ? Oui quand le planning est actif, qu'un passage prevu depuis son
 * activation est echu, et qu'aucun entrainement automatique n'a ete lance depuis ce passage. Un entrainement annule par
 * l'administrateur ou termine en echec compte (pas de boucle de reessais) ; un entrainement interrompu par un arret du
 * serveur ne compte pas : il est repris.
 */
export function estDu(maintenant: number, reglage: ReglagePlanning, autos: readonly PassageAuto[]): boolean {
  if (!reglage.actif) return false;
  const prevu = dernierPassage(maintenant);
  if (prevu < Date.parse(reglage.depuis)) return false;
  return !autos.some((e) => Date.parse(e.creeLe) >= prevu && !(e.statut === "echec" && (e.message ?? "").startsWith("Interrompu")));
}
