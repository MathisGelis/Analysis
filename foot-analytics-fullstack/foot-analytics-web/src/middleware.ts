// src/middleware.ts
//
// Middleware execute AVANT tout rendu de page. UNIQUE responsable de la
// selection automatique de l'equipe au demarrage : si le cookie
// `ownEquipeId` est absent (apres login, changement de club, cookies
// vides), on interroge le backend, on choisit l'equipe par defaut du club
// et on pose `ownEquipeId` + `ownSaisonId` (et `ownClubId` si on a du
// changer de club) dans la reponse.
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
import { filtrerEquipesAutorisees } from "@/lib/empreinte-equipe";
import { choisirEquipeParDefaut } from "@/lib/equipe-defaut";
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
  // Rien a faire si une equipe est deja choisie, ou si l'utilisateur n'est
  // pas authentifie (il ira vers /login de toute facon).
  if (req.cookies.get("ownEquipeId")?.value || !token) return NextResponse.next();

  const payload = decoderPayloadJwt(token);
  const estAdmin = payload?.role === "admin";
  const clubJwt = !estAdmin ? payload?.clubId ?? null : null;
  const clubCookie = req.cookies.get("ownClubId")?.value ?? null;
  const saisonCookie = req.cookies.get("ownSaisonId")?.value ?? null;

  try {
    const headers = { Authorization: `Bearer ${token}` };
    const equipesDuClub = async (clubId: string) =>
      filtrerEquipesAutorisees(
        await getJson<Equipe[]>(`/equipes?clubId=${encodeURIComponent(clubId)}`, headers),
        payload,
      );

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

    const choix = choisirEquipeParDefaut(equipes, saisons, saisonCookie);
    // Rien a selectionner (club sans equipe, ou saison choisie encore vide) :
    // on ne touche a aucun cookie.
    if (!choix?.equipe) return NextResponse.next();

    const opts = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const };
    const aPoser: [string, string][] = [["ownEquipeId", choix.equipe.id]];
    if (choix.saisonId) aPoser.push(["ownSaisonId", choix.saisonId]);
    if (clubId !== clubCookie) aPoser.push(["ownClubId", clubId]);

    // Un Set-Cookie sur la reponse n'est lu par le navigateur qu'a la
    // requete SUIVANTE : sans autre precaution, le layout et les pages de
    // CETTE requete verraient encore "aucune equipe" (premier ecran apres
    // login vide). On reecrit donc aussi le cookie de la requete entrante,
    // que les Server Components lisent via cookies().
    for (const [nom, valeur] of aPoser) req.cookies.set(nom, valeur);
    const res = NextResponse.next({ request: { headers: req.headers } });
    for (const [nom, valeur] of aPoser) res.cookies.set(nom, valeur, opts);
    debug(`[middleware] auto-select equipe ${choix.equipe.nom} (${choix.equipe.id}) club=${clubId}`);
    return res;
  } catch (err) {
    console.warn("[middleware] auto-select echoue :", (err as Error).message);
    return NextResponse.next();
  }
}
