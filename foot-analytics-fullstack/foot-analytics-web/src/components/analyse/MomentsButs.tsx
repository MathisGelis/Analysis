// src/components/analyse/MomentsButs.tsx
//
// Buts marques et encaisses par tranche de 15 minutes. Les feuilles FMI donnent rarement
// la minute des buts : sans couverture suffisante le composant ne rend rien et la page l'explique.

import { BarsChart } from "@/components/Charts";
import type { Tendances } from "@/lib/analyse-types";

const TRANCHES = ["0-15", "16-30", "31-45", "46-60", "61-75", "76-90+"];

export function MomentsButs({ buts }: { buts: Tendances["butsParTranche"] }) {
  if (!buts.disponible) return null;
  return (
    <BarsChart height={200} legend={["Marques", "Encaisses"]}
      data={TRANCHES.map((label, i) => ({ label, a: buts.pour[i], b: buts.contre[i] }))} />
  );
}
