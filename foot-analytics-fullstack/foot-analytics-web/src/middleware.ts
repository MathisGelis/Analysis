// src/middleware.ts
//
// Middleware qui s'execute AVANT tout rendu de page. Si l'utilisateur
// n'a pas de cookie `ownEquipeId` (typique apres login ou apres avoir
// vide les cookies), on interroge le backend pour trouver la 1ere
// equipe de la saison active pour son club, et on pose les cookies
// `ownEquipeId` + `ownSaisonId` dans la reponse.
//
// De cette maniere, quand le Server Component `layout.tsx` s'execute
// juste apres, il trouve deja les cookies -> le provider client
// demarre avec les bonnes valeurs -> le switcher affiche une equipe
// des le premier rendu. Plus aucune desselection au refresh/login.

import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

// Ne pas intercepter les routes internes/assets/API front (perf).
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|assets|login|change-password).*)",
  ],
};

export async function middleware(req: NextRequest) {
  const equipeIdCookie = req.cookies.get("ownEquipeId")?.value;
  const clubId = req.cookies.get("ownClubId")?.value;
  const token = req.cookies.get("fa_token")?.value;

  // Skip si :
  // - deja un cookie ownEquipeId (rien a faire)
  // - pas de clubId (setup pas encore fait)
  // - pas de token (user pas authentifie -> il ira vers /login de toute facon)
  if (equipeIdCookie || !clubId || !token) {
    return NextResponse.next();
  }

  try {
    const headers = { Authorization: `Bearer ${token}` };
    // Fetch en parallele : equipes du club + saisons.
    const [equipesRes, saisonsRes] = await Promise.all([
      fetch(`${API_URL}/equipes?clubId=${encodeURIComponent(clubId)}`, { headers }),
      fetch(`${API_URL}/saisons`, { headers }),
    ]);
    if (!equipesRes.ok || !saisonsRes.ok) return NextResponse.next();
    const equipes: any[] = await equipesRes.json();
    const saisons: any[] = await saisonsRes.json();

    // Trouve la saison active (fallback : la plus recente).
    const active = saisons.find((s: any) => s.actif) ?? saisons[0];
    if (!active || !Array.isArray(equipes) || equipes.length === 0) {
      return NextResponse.next();
    }

    // 1ere equipe de la saison active pour ce club.
    // Sinon (aucune equipe sur saison active) : 1ere equipe tout court.
    const candidate = equipes.find((e: any) => e.saisonId === active.id) ?? equipes[0];
    if (!candidate) return NextResponse.next();

    // Pose les cookies. sameSite=lax, maxAge=1 an.
    const res = NextResponse.next();
    const opts = {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax" as const,
    };
    res.cookies.set("ownEquipeId", candidate.id, opts);
    res.cookies.set(
      "ownSaisonId",
      candidate.saisonId ?? active.id,
      opts,
    );
    // eslint-disable-next-line no-console
    console.log(`[middleware] auto-select equipe ${candidate.nom} (${candidate.id}) sur saison ${active.nom}`);
    return res;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[middleware] auto-select echoue :", (err as Error).message);
    return NextResponse.next();
  }
}
