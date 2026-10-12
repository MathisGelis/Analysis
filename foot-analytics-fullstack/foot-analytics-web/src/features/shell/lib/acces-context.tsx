"use client";
// src/features/shell/lib/acces-context.tsx
//
// Ce que le shell sait pour decider quelles pages montrer : le role du compte et les saisons (lues cote serveur par le
// layout racine). La saison CHOISIE vient du contexte d'equipe, donc la navigation se met a jour des que l'on change de
// saison, sans recharger. La regle elle-meme est dans acces-pages.ts.

import { createContext, useContext } from "react";

import { useOwnEquipe } from "@/features/equipes/lib/own-equipe-context";
import { modeSaison } from "@/features/saisons/lib/saison-mode";
import type { Saison } from "@/shared/lib/types";

import type { ContexteAccesPages } from "./acces-pages";

interface Valeur { saisons: Saison[]; role: string | null }

const Ctx = createContext<Valeur>({ saisons: [], role: null });

export function AccesProvider({ saisons, role, children }: { saisons: Saison[]; role: string | null; children: React.ReactNode }) {
  return <Ctx.Provider value={{ saisons, role }}>{children}</Ctx.Provider>;
}

/** Le contexte d'acces aux pages (role + position de la saison choisie), et les deux saisons concernees. */
export function useAccesPages(): ContexteAccesPages & { saisonChoisie: Saison | null; saisonActive: Saison | null } {
  const { saisons, role } = useContext(Ctx);
  const { saisonId } = useOwnEquipe();
  const saisonActive = saisons.find((s) => s.actif) ?? null;
  const saisonChoisie = saisons.find((s) => s.id === saisonId) ?? null;
  return { role, mode: modeSaison(saisonChoisie, saisonActive), saisonChoisie, saisonActive };
}
