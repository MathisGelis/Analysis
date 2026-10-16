// src/app/api/session/login/route.ts
//
// Connexion : transmet les identifiants a l'API et range les jetons recus dans des cookies HttpOnly (voir
// features/auth/lib/session-serveur.ts). Le navigateur ne recoit que le profil. La selection club/equipe/saison de
// la session precedente est effacee : le middleware choisira celle du nouveau compte.

import { NextRequest, NextResponse } from "next/server";

import { appelApi, COOKIES_SELECTION, origineEtrangere, poserJetons } from "@/features/auth/lib/session-serveur";

export async function POST(req: NextRequest) {
  if (origineEtrangere(req)) return NextResponse.json({ message: "Requete d'un autre site refusee." }, { status: 403 });
  const corps = await req.json().catch(() => ({}));
  const r = await appelApi("/auth/login", {
    corps: { login: String(corps.login ?? ""), password: String(corps.password ?? "") },
    depuis: req.headers,
  });
  if (!r.ok) return NextResponse.json(r.corps ?? { message: "Connexion impossible" }, { status: r.statut });
  const res = NextResponse.json({ user: r.corps.user });
  for (const nom of COOKIES_SELECTION) res.cookies.delete(nom);
  poserJetons(res.cookies, r.corps);
  return res;
}
