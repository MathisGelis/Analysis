// src/features/calendrier-fff/adresse-calendrier.ts
//
// Adresse du calendrier FFF d'une equipe et telechargement du fichier. Le serveur ne telecharge QUE le calendrier public de
// la FFF : l'adresse est normalisee puis verifiee (hote, chemin) avant toute requete, pour qu'une adresse saisie ne
// puisse pas faire appeler n'importe quel serveur (SSRF) ; pas de redirection suivie, delai et taille bornes.

export const HOTE_CALENDRIERS_FFF = "media.fff.fr";
/** /calendars/2026/eq/6701_SEM_4.ics */
const CHEMIN = /^\/calendars\/\d{4}\/eq\/[A-Za-z0-9_-]{1,60}\.ics$/;

/** Taille maximale d'un calendrier d'equipe (celui d'une saison pese une dizaine de ko). */
export const TAILLE_MAX_CALENDRIER = 1_000_000;

/**
 * L'adresse collee par l'utilisateur, en https://media.fff.fr/calendars/AAAA/eq/xxx.ics ; null si ce n'est pas un calendrier
 * d'equipe de la FFF. Accepte l'adresse sans protocole ("media.fff.fr/...") et celle d'abonnement ("webcal://...").
 */
export function normaliserAdresseCalendrier(entree: string | null | undefined): string | null {
  let brute = (entree ?? "").trim();
  if (!brute) return null;
  brute = brute.replace(/^webcals?:\/\//i, "https://");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(brute)) brute = `https://${brute}`;
  let url: URL;
  try { url = new URL(brute); } catch { return null; }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== HOTE_CALENDRIERS_FFF) return null;
  if (url.port || url.username || url.password) return null;
  if (!CHEMIN.test(url.pathname)) return null;
  return `https://${HOTE_CALENDRIERS_FFF}${url.pathname}`;       // sans requete ni ancre
}

export class CalendrierInjoignable extends Error {}

/** Telecharge le calendrier a une adresse DEJA normalisee. Erreurs : CalendrierInjoignable (message lisible). */
export async function telechargerCalendrier(adresse: string, delaiMs = 15_000): Promise<string> {
  if (normaliserAdresseCalendrier(adresse) !== adresse) throw new CalendrierInjoignable("Adresse de calendrier FFF invalide.");
  let reponse: Response;
  try {
    reponse = await fetch(adresse, {
      redirect: "error", signal: AbortSignal.timeout(delaiMs), headers: { Accept: "text/calendar, text/plain;q=0.8" },
    });
  } catch (e) {
    throw new CalendrierInjoignable(`Calendrier FFF injoignable (${(e as Error).name === "TimeoutError" ? "delai depasse" : "connexion impossible"}).`);
  }
  if (!reponse.ok) {
    throw new CalendrierInjoignable(reponse.status === 404
      ? "Calendrier introuvable (404) : l'adresse a peut-etre change, ou la FFF ne l'a pas encore publie."
      : `La FFF a refuse la demande (${reponse.status}).`);
  }
  const annonce = Number(reponse.headers.get("content-length") ?? 0);
  if (annonce > TAILLE_MAX_CALENDRIER) throw new CalendrierInjoignable("Fichier trop volumineux pour un calendrier d'equipe.");
  const texte = await reponse.text();
  if (texte.length > TAILLE_MAX_CALENDRIER) throw new CalendrierInjoignable("Fichier trop volumineux pour un calendrier d'equipe.");
  if (!/^\s*BEGIN:VCALENDAR/i.test(texte)) throw new CalendrierInjoignable("La reponse de la FFF n'est pas un calendrier (.ics).");
  return texte;
}
