// src/features/equipes/lib/own-club-context.tsx
"use client";

// Contexte React fournissant l'id du club entraine aux Client Components.
// La valeur est seedee par le RootLayout (Server) qui lit le cookie ; en cas
// d'absence elle vaut DEFAULT_OWN_CLUB_ID (env ou "chapo").

import { createContext, useContext } from "react";

const Ctx = createContext<string>("chapo");

export function OwnClubProvider({
  value, children,
}: { value: string; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOwnClubId(): string {
  return useContext(Ctx);
}
