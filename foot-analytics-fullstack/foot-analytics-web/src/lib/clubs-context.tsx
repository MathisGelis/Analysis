"use client";
// src/lib/clubs-context.tsx
//
// Liste des clubs de la base, fournie par le layout serveur. Permet a
// ClubBadge (utilise partout, 48 fois) de connaitre le nom d'un club a partir
// de son seul identifiant, sans que chaque page ait a lui passer l'objet.

import { createContext, useContext, useMemo } from "react";
import type { Club } from "@/lib/types";

const Ctx = createContext<Map<string, Club>>(new Map());

export function ClubsProvider({ clubs, children }: { clubs: Club[]; children: React.ReactNode }) {
  const parId = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);
  return <Ctx.Provider value={parId}>{children}</Ctx.Provider>;
}

/** Le club d'identifiant `id`, s'il est connu du layout. */
export function useClub(id: string | null | undefined): Club | undefined {
  const parId = useContext(Ctx);
  return id ? parId.get(id) : undefined;
}
