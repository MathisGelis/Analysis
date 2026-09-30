// src/lib/own-equipe.ts
//
// Identifiant de l'equipe "propre" actuellement selectionnee dans la
// sidebar. Si l'utilisateur connecte a une liste d'equipes restreinte
// (allowedEquipeIds dans son JWT), on s'assure que le cookie pointe
// bien sur une equipe autorisee — sinon on ignore le cookie.

import { cookies } from "next/headers";
import { decoderPayloadJwt } from "@/lib/jwt";

export function getOwnEquipeIdServer(): string | null {
  const all = cookies();
  const cookieEquipeId = all.get("ownEquipeId")?.value ?? null;
  // Si le user a une liste restreinte d'equipes, on verifie que le
  // cookie pointe sur l'une d'elles ; sinon on retourne la 1ere autorisee.
  const token = all.get("fa_token")?.value;
  if (token) {
    const payload = decoderPayloadJwt(token);
    if (payload && payload.role !== "admin" && Array.isArray(payload.equipeIds) && payload.equipeIds.length > 0) {
      if (cookieEquipeId && payload.equipeIds.includes(cookieEquipeId)) {
        return cookieEquipeId;
      }
      return payload.equipeIds[0];
    }
  }
  return cookieEquipeId;
}

export function getOwnSaisonIdServer(): string | null {
  return cookies().get("ownSaisonId")?.value ?? null;
}
