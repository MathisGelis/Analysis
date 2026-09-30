// src/app/api/own-equipe/route.ts
//
// Pose les cookies "ownEquipeId" et "ownSaisonId" qui designent l'equipe
// du coach actuellement filtree dans les vues (classement, effectif).
// Appele par le switcher en bas a gauche dans la sidebar.

import { cookies } from "next/headers";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const equipeId = body.equipeId == null ? null : String(body.equipeId);
  const saisonId = body.saisonId == null ? null : String(body.saisonId);
  const jar = cookies();
  const opts = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const };
  if (equipeId) jar.set({ ...opts, name: "ownEquipeId", value: equipeId });
  else jar.delete("ownEquipeId");
  if (saisonId) jar.set({ ...opts, name: "ownSaisonId", value: saisonId });
  else jar.delete("ownSaisonId");
  return Response.json({ ok: true, equipeId, saisonId });
}
