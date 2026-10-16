// src/app/api/session/mot-de-passe/route.ts
//
// Changement de mot de passe : l'API ferme toutes les sessions du compte et en ouvre une nouvelle, dont on range les
// jetons dans les cookies (l'appareil qui a fait le changement reste connecte).

import { NextRequest, NextResponse } from "next/server";

import {
  appelApi, effacerSession, jetonDeRequete, origineEtrangere, poserJetons,
} from "@/features/auth/lib/session-serveur";

export async function POST(req: NextRequest) {
  if (origineEtrangere(req)) return NextResponse.json({ message: "Requete d'un autre site refusee." }, { status: 403 });
  const { jeton, perdue } = await jetonDeRequete(req);
  if (!jeton) {
    const res = NextResponse.json({ message: "Session expiree : reconnecte-toi." }, { status: 401 });
    if (perdue) effacerSession(res.cookies);
    return res;
  }
  const corps = await req.json().catch(() => ({}));
  const r = await appelApi("/auth/change-password", {
    jeton, depuis: req.headers,
    corps: { oldPassword: String(corps.oldPassword ?? ""), newPassword: String(corps.newPassword ?? "") },
  });
  if (!r.ok) return NextResponse.json(r.corps ?? { message: "Changement impossible" }, { status: r.statut });
  const res = NextResponse.json({ user: r.corps.user });
  poserJetons(res.cookies, r.corps);
  return res;
}
