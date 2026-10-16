"use client";
// src/features/auth/lib/session-context.tsx
//
// Profil de l'utilisateur connecte pour les Client Components. Fourni par le layout (lu cote serveur avec le jeton
// du cookie HttpOnly) : plus aucune copie dans le localStorage.

import { createContext, useContext, useEffect } from "react";

import { oublierAncienStockage, type User } from "./auth";

const SessionContext = createContext<User | null>(null);

export function SessionProvider({ utilisateur, children }: { utilisateur: User | null; children: React.ReactNode }) {
  useEffect(() => { oublierAncienStockage(); }, []);
  return <SessionContext.Provider value={utilisateur}>{children}</SessionContext.Provider>;
}

/** L'utilisateur connecte (null hors connexion). */
export function useUtilisateur(): User | null {
  return useContext(SessionContext);
}
