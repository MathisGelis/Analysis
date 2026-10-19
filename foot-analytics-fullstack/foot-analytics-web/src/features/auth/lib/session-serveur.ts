// src/features/auth/lib/session-serveur.ts
//
// Session cote serveur Next (BFF) : le navigateur ne voit jamais les jetons. Ils vivent dans deux cookies poses par le
// serveur Next, sur son propre domaine :
//   - fa_access  : jeton d'acces (JWT, 15 min), HttpOnly, Secure (production), SameSite=Lax ;
//   - fa_refresh : jeton de rafraichissement (opaque, 30 jours glissants, rotation a chaque usage), memes attributs.
// HttpOnly : aucun script de la page (ni une injection) ne peut les lire. L'API est sur un autre site (Render), d'ou ce
// relais : un cookie pose par l'API elle-meme serait un cookie tiers, bloque par les navigateurs.
//
// Les appels du navigateur passent par /api/backend/* : le middleware y ajoute le jeton d'acces (rafraichi au besoin)
// et relaie vers l'API. Connexion, deconnexion et changement de mot de passe : /api/session/*.
//
// Compatible runtime edge (middleware) et Node (route handlers) : uniquement fetch et les cookies de next/server.

import type { NextRequest } from "next/server";

import { decoderPayloadJwt, type JwtPayload } from "./jwt";

export const COOKIE_ACCES = "fa_access";
export const COOKIE_RAFRAICHISSEMENT = "fa_refresh";
/** Ancien cookie lisible par JavaScript (jeton de 7 jours) : efface partout ou on le croise. */
export const COOKIE_HERITE = "fa_token";
/** Selection club / equipe / saison : propre a une session, effacee a la connexion et a la deconnexion. */
export const COOKIES_SELECTION = ["ownEquipeId", "ownSaisonId", "ownClubId", "ownSelValide"];

const DUREE_SESSION_S = 30 * 24 * 3600;

/** URL de l'API vue du serveur Next (jamais exposee au navigateur). */
export function urlApi(): string {
  return process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
}

/**
 * Secure sauf en developpement ; COOKIES_NON_SECURISES=1 le retire aussi d'un `next start` servi en http hors
 * localhost (jamais en production reelle).
 */
function securise(): boolean {
  return process.env.NODE_ENV === "production" && process.env.COOKIES_NON_SECURISES !== "1";
}

export function optionsCookie(maxAge: number) {
  return { httpOnly: true, secure: securise(), sameSite: "lax" as const, path: "/", maxAge };
}

export interface JetonsSession {
  token: string;
  /** Null : rafraichissement simultane, le cookie de rafraichissement deja pose reste valable. */
  refreshToken: string | null;
  expiresIn: number;
}

/** Ce qui sait poser et effacer des cookies : NextResponse.cookies ou cookies() de next/headers. */
interface PotACookies {
  set(nom: string, valeur: string, options?: ReturnType<typeof optionsCookie>): unknown;
  delete(nom: string): unknown;
}

export function poserJetons(pot: PotACookies, j: JetonsSession): void {
  pot.set(COOKIE_ACCES, j.token, optionsCookie(j.expiresIn || 900));
  if (j.refreshToken) pot.set(COOKIE_RAFRAICHISSEMENT, j.refreshToken, optionsCookie(DUREE_SESSION_S));
  pot.delete(COOKIE_HERITE);
}

export function effacerSession(pot: PotACookies, selectionAussi = false): void {
  pot.delete(COOKIE_ACCES);
  pot.delete(COOKIE_RAFRAICHISSEMENT);
  pot.delete(COOKIE_HERITE);
  if (selectionAussi) for (const nom of COOKIES_SELECTION) pot.delete(nom);
}

/** Adresse du navigateur (Vercel l'ecrit lui-meme dans X-Forwarded-For : le client ne peut pas l'inventer). */
export function ipNavigateur(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xff || headers.get("x-real-ip") || null;
}

/**
 * En-tetes de confiance pour l'API : l'adresse du navigateur, crue par l'API seulement avec le secret partage
 * BFF_SECRET (limites de debit par adresse). Sans secret configure, rien n'est transmis.
 */
export function entetesBff(headers: Headers, depuis: Headers): void {
  headers.delete("x-fa-bff");
  headers.delete("x-fa-client-ip");
  const secret = process.env.BFF_SECRET;
  const ip = ipNavigateur(depuis);
  if (secret && ip) {
    headers.set("x-fa-bff", secret);
    headers.set("x-fa-client-ip", ip);
  }
}

/** Appel JSON a l'API depuis le serveur Next (connexion, rafraichissement...). */
export async function appelApi(chemin: string, init: { methode?: string; corps?: unknown; jeton?: string; depuis?: Headers } = {}) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (init.jeton) headers.set("Authorization", `Bearer ${init.jeton}`);
  if (init.depuis) entetesBff(headers, init.depuis);
  const res = await fetch(`${urlApi()}${chemin}`, {
    method: init.methode ?? "POST",
    headers,
    body: init.corps === undefined ? undefined : JSON.stringify(init.corps),
    cache: "no-store",
  });
  const texte = await res.text();
  let corps: any = null;
  try { corps = texte ? JSON.parse(texte) : null; } catch { corps = { message: texte }; }
  return { statut: res.status, ok: res.ok, corps };
}

/** Le jeton d'acces expire-t-il dans moins de 30 secondes (ou est-il illisible) ? */
export function accesARenouveler(payload: JwtPayload | null, maintenant = Date.now()): boolean {
  return !payload || !payload.exp || payload.exp * 1000 - maintenant < 30_000;
}

/**
 * Le jeton d'acces de la requete, rafraichi si besoin. `nouveaux` : jetons a reposer dans la reponse ; `perdue` : la
 * session n'est plus valable (cookies a effacer). En cas d'API injoignable, on garde l'etat tel quel.
 */
export async function jetonDeRequete(req: Pick<NextRequest, "cookies" | "headers">): Promise<{
  jeton: string | null; payload: JwtPayload | null; nouveaux: JetonsSession | null; perdue: boolean;
}> {
  const acces = req.cookies.get(COOKIE_ACCES)?.value ?? null;
  const payload = acces ? decoderPayloadJwt(acces) : null;
  if (acces && !accesARenouveler(payload)) return { jeton: acces, payload, nouveaux: null, perdue: false };
  const refresh = req.cookies.get(COOKIE_RAFRAICHISSEMENT)?.value;
  if (!refresh) return { jeton: null, payload: null, nouveaux: null, perdue: !!acces };
  try {
    const r = await appelApi("/auth/refresh", { corps: { refreshToken: refresh }, depuis: req.headers });
    if (r.ok && r.corps?.token) {
      return { jeton: r.corps.token, payload: decoderPayloadJwt(r.corps.token), nouveaux: r.corps as JetonsSession, perdue: false };
    }
    if (r.statut === 401) return { jeton: null, payload: null, nouveaux: null, perdue: true };
  } catch { /* API injoignable : on ne deconnecte pas pour autant */ }
  const encoreValable = acces && payload?.exp && payload.exp * 1000 > Date.now();
  return { jeton: encoreValable ? acces : null, payload: encoreValable ? payload : null, nouveaux: null, perdue: false };
}

/**
 * Requete d'ecriture venue d'un autre site : refusee (defense en profondeur, en plus de SameSite=Lax). On compare
 * l'en-tete Origin a l'hote servi ; sans Origin, on s'appuie sur Sec-Fetch-Site.
 */
export function origineEtrangere(req: Pick<NextRequest, "method" | "headers" | "nextUrl">): boolean {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return false;
  const origine = req.headers.get("origin");
  if (origine) {
    try { return new URL(origine).host !== req.nextUrl.host; } catch { return true; }
  }
  return req.headers.get("sec-fetch-site") === "cross-site";
}
