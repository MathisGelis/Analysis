// src/middleware.ts
//
// Middleware execute AVANT tout rendu de page. Deux responsabilites :
//
// 1. Garde d'acces : pas de jeton valide -> redirection vers /login.
// 2. UNIQUE responsable de la selection de l'equipe : elle doit TOUJOURS
//    etre valide (cf. selection-equipe.ts). Cookies absents (apres login,
//    changement de club) OU perimes (equipe fusionnee ou supprimee, saison
//    reconstruite, permissions), on interroge le backend, on retient une
//    selection valide et on pose `ownEquipeId` + `ownSaisonId` (et `ownClubId`
//    si on a du changer de club) dans la reponse.
//    Une selection verifiee est memorisee 2 minutes (cookie ownSelValide) pour
//    ne pas interroger le backend a chaque navigation.
//
// Le Server Component layout.tsx, execute juste apres, lit deja les
// cookies : les providers demarrent avec les bonnes valeurs et le
// switcher affiche l'equipe des le premier rendu. Le switcher, lui, ne
// fait plus que de l'affichage et des interactions utilisateur.
//
// Club vise, par priorite : club du JWT (utilisateur non admin), cookie
// ownClubId, NEXT_PUBLIC_CLUB_ID. Pour un admin dont le club n'a aucune
// equipe (apres un reseed, club inexistant), on bascule sur le premier
// club qui en a.

import { NextRequest, NextResponse } from "next/server";
import { debug } from "@/lib/debug";
import { decoderPayloadJwt } from "@/lib/jwt";
import { DEFAULT_OWN_CLUB_ID } from "@/lib/club-defaut";
import { equipesDesSaisons, saisonsVisibles } from "@/lib/acces-saisons";
import { filtrerEquipesAutorisees } from "@/lib/empreinte-equipe";
import { selectionValide } from "@/lib/selection-equipe";
import type { Club, Equipe, Saison } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

// Ne pas intercepter les routes internes/assets/API front (perf).
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|assets|login|change-password).*)",
  ],
};

async function getJson<T>(chemin: string, headers: HeadersInit): Promise<T> {
  const res = await fetch(`${API_URL}${chemin}`, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status} sur ${chemin}`);
  return res.json() as Promise<T>;
}

export async function middleware(req: NextRequest) {
  const token = req.cookies.get("fa_token")?.value;
  const payload = token ? decoderPayloadJwt(token) : null;

  // GARDE D'ACCES : sans jeton lisible et non expire, on renvoie vers /login
  // (avec la page demandee en "from"). Avant, un visiteur anonyme obtenait la
  // page complete remplie avec les donnees de DEMONSTRATION (repli de api.ts
  // sur les 401). Les routes /login, /change-password et /api sont exclues par
  // le matcher.
  if (!payload || (payload.exp && payload.exp * 1000 < Date.now())) {
    const url = req.nextUrl.clone();
    const demandee = req.nextUrl.pathname + req.nextUrl.search;
    url.pathname = "/login";
    url.search = "";
    if (demandee !== "/") url.searchParams.set("from", demandee);
    const res = NextResponse.redirect(url);
    if (token) res.cookies.delete("fa_token");
    return res;
  }

  // Selection : rien a verifier si elle l'a ete il y a moins de 2 minutes, ni
  // pour un prechargement de lien (pas une vraie navigation).
  const equipeCookie = req.cookies.get("ownEquipeId")?.value ?? null;
  const saisonCookie = req.cookies.get("ownSaisonId")?.value ?? null;
  if (equipeCookie && saisonCookie
    && req.cookies.get("ownSelValide")?.value === `${equipeCookie}|${saisonCookie}`) {
    return NextResponse.next();
  }
  if (req.headers.get("next-router-prefetch") || req.headers.get("purpose") === "prefetch") {
    return NextResponse.next();
  }
  const estAdmin = payload?.role === "admin";
  const clubJwt = !estAdmin ? payload?.clubId ?? null : null;
  const clubCookie = req.cookies.get("ownClubId")?.value ?? null;

  try {
    const headers = { Authorization: `Bearer ${token}` };
    const equipesBrutes = (clubId: string) => getJson<Equipe[]>(`/equipes?clubId=${encodeURIComponent(clubId)}`, headers);

    let clubId = clubJwt ?? clubCookie ?? DEFAULT_OWN_CLUB_ID;
    const [saisonsToutes, equipesInitiales] = await Promise.all([
      getJson<Saison[]>("/saisons", headers),
      equipesBrutes(clubId),
    ]);
    // Un educateur ne voit que les saisons que son gestionnaire lui a ouvertes, et leurs equipes.
    const saisons = saisonsVisibles(saisonsToutes, payload);
    const equipesDuClub = (liste: Equipe[]) => equipesDesSaisons(filtrerEquipesAutorisees(liste, payload), saisons);
    let equipes = equipesDuClub(equipesInitiales);

    // Club sans equipe (typiquement "chapo" code en dur apres un reseed) :
    // seul un admin peut etre redirige sur un autre club.
    if (equipes.length === 0 && !clubJwt) {
      for (const c of await getJson<Club[]>("/clubs", headers)) {
        const eqs = equipesDuClub(await equipesBrutes(c.id));
        if (eqs.length > 0) { clubId = c.id; equipes = eqs; break; }
      }
    }

    const choix = selectionValide({ equipes, saisons, equipeId: equipeCookie, saisonId: saisonCookie });
    // Club sans aucune equipe : rien a selectionner, on ne touche a aucun cookie.
    if (!choix.equipe) return NextResponse.next();

    const opts = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const };
    const aPoser: [string, string][] = [];
    if (choix.corrigee) {
      aPoser.push(["ownEquipeId", choix.equipe.id]);
      if (choix.saisonId) aPoser.push(["ownSaisonId", choix.saisonId]);
    }
    if (clubId !== clubCookie) aPoser.push(["ownClubId", clubId]);
    const memo: [string, string] = ["ownSelValide", `${choix.equipe.id}|${choix.saisonId ?? ""}`];

    // Un Set-Cookie sur la reponse n'est lu par le navigateur qu'a la
    // requete SUIVANTE : sans autre precaution, le layout et les pages de
    // CETTE requete verraient encore "aucune equipe" (premier ecran apres
    // login vide). On reecrit donc aussi le cookie de la requete entrante,
    // que les Server Components lisent via cookies().
    for (const [nom, valeur] of aPoser) req.cookies.set(nom, valeur);
    const res = NextResponse.next({ request: { headers: req.headers } });
    for (const [nom, valeur] of aPoser) res.cookies.set(nom, valeur, opts);
    res.cookies.set(memo[0], memo[1], { ...opts, maxAge: 120 });
    if (choix.corrigee) {
      debug(`[middleware] selection corrigee : equipe ${choix.equipe.nom} (${choix.equipe.id}) club=${clubId}`);
    }
    return res;
  } catch (err) {
    console.warn("[middleware] auto-select echoue :", (err as Error).message);
    return NextResponse.next();
  }
}
