// src/features/analyse/components/PastilleSens.tsx
//
// Petite pastille "fleche + libelle" pour un sens de tendance. `inverse` pour les
// grandeurs brutes ou monter est mauvais (cartons, rotation) ; le sens de l'attaque et de
// la defense, lui, est deja "vers le mieux" (moins de buts encaisses = hausse).
// `fleche` force la direction de la fleche quand elle doit suivre un ecart chiffre.

import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import type { SensTendance } from "@/features/analyse/lib/analyse-types";
import { LIBELLE_SENS, tonDuSens } from "@/features/analyse/lib/tendances-format";

const TON = {
  positif: "border-win/35 bg-win/10 text-win",
  negatif: "border-loss/35 bg-loss/10 text-loss",
  neutre: "border-line bg-panel2 text-muted",
} as const;

export function PastilleSens({
  sens, inverse = false, libelle, fleche, className = "",
}: { sens: SensTendance; inverse?: boolean; libelle?: string; fleche?: "haut" | "bas" | "plat"; className?: string }) {
  const direction = fleche ?? (sens === "hausse" ? "haut" : sens === "baisse" ? "bas" : "plat");
  const Icone = direction === "haut" ? TrendingUp : direction === "bas" ? TrendingDown : Minus;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TON[tonDuSens(sens, inverse)]} ${className}`}>
      <Icone size={11} aria-hidden />
      {libelle ?? LIBELLE_SENS[sens]}
    </span>
  );
}
