// src/middleware.ts
//
// Middleware execute AVANT tout rendu de page et devant le relais vers l'API. Trois responsabilites :
//
// 1. Session (voir features/auth/lib/session-serveur.ts) : le jeton d'acces vit dans un cookie HttpOnly ; expire ou
//    presque, il est rafraichi ici avec le jeton de rafraichissement, et les nouveaux cookies sont poses dans la
//    reponse ET reecrits dans la requete (les Server Components de CETTE requete lisent deja le nouveau jeton).
//
// 2. Relais /api/backend/* -> API : le navigateur n'appelle jamais l'API directement. On y ajoute le jeton d'acces,
//    on retire les cookies du site (l'API n'en a pas besoin) et on relaie (reecriture externe : le corps est transmis
//    tel quel, uploads de feuilles de match compris). Une ecriture venue d'un autre site est refusee.
//
// 3. Pages : pas de session -> /login ; mot de passe temporaire -> /change-password. Puis UNIQUE responsable de la
//    selection de l'equipe : elle doit TOUJOURS etre valide (cf. selection-equipe.ts). Cookies absents (apres login,
//    changement de club) OU perimes (equipe fusionnee ou supprimee, saison reconstruite, permissions), on interroge
//    le backend, on retient une selection valide et on pose `ownEquipeId` + `ownSaisonId` (et `ownClubId` si on a du
//    changer de club). Une selection verifiee est memorisee 2 minutes (cookie ownSelValide).
//
// Club vise, par priorite : club du jeton (utilisateur non admin), cookie ownClubId, NEXT_PUBLIC_CLUB_ID. Pour un
// admin dont le club n'a aucune equipe (apres un reseed, club inexistant), on bascule sur le premier club qui en a.

import { NextRequest, NextResponse } from "next/server";

import { debug } from "@/shared/lib/debug";
import {
  COOKIE_ACCES, COOKIE_HERITE, effacerSession, entetesBff, jetonDeRequete, origineEtrangere, poserJetons, urlApi,
  type JetonsSession,
} from "@/features/auth/lib/session-serveur";
import { DEFAULT_OWN_CLUB_ID } from "@/features/equipes/lib/club-defaut";
import { selectionValide } from "@/features/equipes/lib/selection-equipe";
import type { Club, Equipe, Saison } from "@/shared/lib/types";

const PREFIXE_RELAIS = "/api/backend";

// Les pages (sauf login, change-password, pages publiques) et le relais vers l'API. Pas les autres routes internes.
export const config = {
  matcher: [
    "/api/backend/:path*",
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|assets|login|change-password|confidentialite|mentions-legales).*)",
  ],
};

async function getJson<T>(chemin: string, headers: HeadersInit): Promise<T> {
  const res = await fetch(`${urlApi()}${chemin}`, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status} sur ${chemin}`);
  return res.json() as Promise<T>;
}

function json(statut: number, message: string, code?: string) {
  return NextResponse.json({ statusCode: statut, message, ...(code ? { code } : {}) }, { status: statut });
}

/** Relais vers l'API : jeton d'acces en en-tete, sans les cookies du site. */
async function relayer(req: NextRequest): Promise<NextResponse> {
  if (origineEtrangere(req)) return json(403, "Requete d'un autre site refusee.");
  const { jeton, nouveaux, perdue } = await jetonDeRequete(req);
  if (!jeton) {
    const res = json(401, "Session expiree : reconnecte-toi.", "SESSION_EXPIREE");
    if (perdue) effacerSession(res.cookies);
    return res;
  }
  const headers = new Headers(req.headers);
  headers.set("authorization", `Bearer ${jeton}`);
  headers.delete("cookie");
  entetesBff(headers, req.headers);
  const cible = new URL(`${urlApi()}${req.nextUrl.pathname.slice(PREFIXE_RELAIS.length)}${req.nextUrl.search}`);
  const res = NextResponse.rewrite(cible, { request: { headers } });
  if (nouveaux) poserJetons(res.cookies, nouveaux);
  return res;
}

export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith(`${PREFIXE_RELAIS}/`)) return relayer(req);

  const { jeton, payload, nouveaux, perdue } = await jetonDeRequete(req);

  // GARDE D'ACCES : sans session, on renvoie vers /login (avec la page demandee en "from").
  if (!jeton || !payload) {
    const url = req.nextUrl.clone();
    const demandee = req.nextUrl.pathname + req.nextUrl.search;
    url.pathname = "/login";
    url.search = "";
    if (demandee !== "/") url.searchParams.set("from", demandee);
    const res = NextResponse.redirect(url);
    if (perdue || req.cookies.has(COOKIE_HERITE)) effacerSession(res.cookies);
    return res;
  }

  // Mot de passe temporaire : il ne sert qu'a en choisir un nouveau (l'API refuse tout le reste).
  if (payload.doitChanger) {
    const url = req.nextUrl.clone();
    url.pathname = "/change-password";
    url.search = "";
    url.searchParams.set("from", req.nextUrl.pathname + req.nextUrl.search);
    const res = NextResponse.redirect(url);
    if (nouveaux) poserJetons(res.cookies, nouveaux);
    return res;
  }

  // Jetons rafraichis : visibles des Server Components des cette requete, et poses dans la reponse.
  const aReposer: JetonsSession | null = nouveaux;
  if (aReposer) req.cookies.set(COOKIE_ACCES, aReposer.token);
  const suite = (cookies: [string, string, number][] = []) => {
    for (const [nom, valeur] of cookies) req.cookies.set(nom, valeur);
    const res = NextResponse.next({ request: { headers: req.headers } });
    for (const [nom, valeur, maxAge] of cookies) res.cookies.set(nom, valeur, { path: "/", maxAge, sameSite: "lax" });
    if (aReposer) poserJetons(res.cookies, aReposer);
    if (req.cookies.has(COOKIE_HERITE)) res.cookies.delete(COOKIE_HERITE);
    return res;
  };

  // Selection : rien a verifier si elle l'a ete il y a moins de 2 minutes, ni
  // pour un prechargement de lien (pas une vraie navigation).
  const equipeCookie = req.cookies.get("ownEquipeId")?.value ?? null;
  const saisonCookie = req.cookies.get("ownSaisonId")?.value ?? null;
  if (equipeCookie && saisonCookie
    && req.cookies.get("ownSelValide")?.value === `${equipeCookie}|${saisonCookie}`) {
    return suite();
  }
  if (req.headers.get("next-router-prefetch") || req.headers.get("purpose") === "prefetch") {
    return suite();
  }
  const estAdmin = payload.role === "admin";
  const clubJwt = !estAdmin ? payload.clubId ?? null : null;
  const clubCookie = req.cookies.get("ownClubId")?.value ?? null;

  try {
    const headers = { Authorization: `Bearer ${jeton}` };
    // L'API ne renvoie que les saisons et les equipes ouvertes au compte (voir modules/acces) : rien a filtrer ici.
    const equipesDuClub = (clubId: string) => getJson<Equipe[]>(`/equipes?clubId=${encodeURIComponent(clubId)}`, headers);

    let clubId = clubJwt ?? clubCookie ?? DEFAULT_OWN_CLUB_ID;
    const [saisons, equipesInitiales] = await Promise.all([
      getJson<Saison[]>("/saisons", headers),
      equipesDuClub(clubId),
    ]);
    let equipes = equipesInitiales;

    // Club sans equipe (typiquement "chapo" code en dur apres un reseed) :
    // seul un admin peut etre redirige sur un autre club.
    if (equipes.length === 0 && !clubJwt) {
      for (const c of await getJson<Club[]>("/clubs", headers)) {
        const eqs = await equipesDuClub(c.id);
        if (eqs.length > 0) { clubId = c.id; equipes = eqs; break; }
      }
    }

    const choix = selectionValide({ equipes, saisons, equipeId: equipeCookie, saisonId: saisonCookie });
    // Club sans aucune equipe : rien a selectionner, on ne touche a aucun cookie de selection.
    if (!choix.equipe) return suite();

    const UN_AN = 60 * 60 * 24 * 365;
    const aPoser: [string, string, number][] = [];
    if (choix.corrigee) {
      aPoser.push(["ownEquipeId", choix.equipe.id, UN_AN]);
      if (choix.saisonId) aPoser.push(["ownSaisonId", choix.saisonId, UN_AN]);
    }
    if (clubId !== clubCookie) aPoser.push(["ownClubId", clubId, UN_AN]);
    aPoser.push(["ownSelValide", `${choix.equipe.id}|${choix.saisonId ?? ""}`, 120]);

    // Un Set-Cookie sur la reponse n'est lu par le navigateur qu'a la requete SUIVANTE : `suite` reecrit donc aussi
    // les cookies de la requete entrante, que les Server Components lisent via cookies().
    if (choix.corrigee) {
      debug(`[middleware] selection corrigee : equipe ${choix.equipe.id} club=${clubId}`);
    }
    return suite(aPoser);
  } catch (err) {
    console.warn("[middleware] auto-select echoue :", (err as Error).message);
    return suite();
  }
}
