// src/app/api/session/logout/route.ts
//
// Deconnexion : revoque la session cote API puis efface les cookies. `?partout=1` : deconnexion de tous les appareils
// (tous les jetons du compte, y compris les jetons d'acces deja emis).

import { NextRequest, NextResponse } from "next/server";

import {
  appelApi, COOKIE_RAFRAICHISSEMENT, effacerSession, jetonDeRequete, origineEtrangere,
} from "@/features/auth/lib/session-serveur";

export async function POST(req: NextRequest) {
  if (origineEtrangere(req)) return NextResponse.json({ message: "Requete d'un autre site refusee." }, { status: 403 });
  const partout = req.nextUrl.searchParams.get("partout") === "1";
  try {
    if (partout) {
      const { jeton } = await jetonDeRequete(req);
      if (jeton) await appelApi("/auth/logout-all", { jeton, depuis: req.headers });
    }
    const refresh = req.cookies.get(COOKIE_RAFRAICHISSEMENT)?.value;
    if (refresh) await appelApi("/auth/logout", { corps: { refreshToken: refresh }, depuis: req.headers });
  } catch { /* API injoignable : les cookies sont effaces quand meme */ }
  const res = NextResponse.json({ ok: true });
  effacerSession(res.cookies, true);
  return res;
}
