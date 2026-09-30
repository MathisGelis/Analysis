// src/app/api/own-club/route.ts
//
// Pose le cookie "ownClubId" qui designe le club entraine. Appele par le
// switcher de club dans le TopBar.

import { cookies } from "next/headers";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const clubId = String(body.clubId ?? "");
  if (!clubId) {
    return Response.json({ ok: false, erreur: "clubId requis" }, { status: 400 });
  }
  cookies().set({
    name: "ownClubId",
    value: clubId,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return Response.json({ ok: true, clubId });
}
