"use client";
// src/features/clubs/lib/clubs-context.tsx
//
// Liste des clubs de la base, fournie par le layout serveur. Permet a
// ClubBadge (utilise partout, 48 fois) de connaitre le nom d'un club a partir
// de son seul identifiant, sans que chaque page ait a lui passer l'objet.
//
// Un club cree pendant la session (un adversaire ajoute depuis le calendrier) est ajoute ici par
// `useAjouterClub` : son ecusson et son nom sont connus tout de suite, sans recharger la page (un
// router.refresh() relancait la page et lui faisait perdre son etat, ici le mois affiche du calendrier).

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import type { Club } from "@/shared/lib/types";

const Ctx = createContext<Map<string, Club>>(new Map());
const AjoutCtx = createContext<(club: Club) => void>(() => {});

export function ClubsProvider({ clubs, children }: { clubs: Club[]; children: React.ReactNode }) {
  const [ajoutes, setAjoutes] = useState<Club[]>([]);
  const parId = useMemo(() => new Map([...clubs, ...ajoutes].map((c) => [c.id, c])), [clubs, ajoutes]);
  const ajouter = useCallback((club: Club) => setAjoutes((l) => (l.some((c) => c.id === club.id) ? l : [...l, club])), []);
  return (
    <AjoutCtx.Provider value={ajouter}>
      <Ctx.Provider value={parId}>{children}</Ctx.Provider>
    </AjoutCtx.Provider>
  );
}

/** Le club d'identifiant `id`, s'il est connu du layout. */
export function useClub(id: string | null | undefined): Club | undefined {
  const parId = useContext(Ctx);
  return id ? parId.get(id) : undefined;
}

/** Declare un club qui vient d'etre cree : les ecussons et les noms le connaissent aussitot. */
export function useAjouterClub(): (club: Club) => void {
  return useContext(AjoutCtx);
}
