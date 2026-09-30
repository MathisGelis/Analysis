// src/components/analyse/NiveauCard.tsx
//
// Resultats contre le haut, le milieu et le bas du classement de la poule.

import type { Tendances } from "@/lib/analyse-types";
import { BilanBarre } from "./BilanBarre";

const LIBELLE = { haut: "Haut de tableau", milieu: "Milieu de tableau", bas: "Bas de tableau" } as const;

export function NiveauCard({ niveaux }: { niveaux: NonNullable<Tendances["parNiveau"]> }) {
  return (
    <div className="space-y-4">
      {niveaux.map((n) => (
        <BilanBarre key={n.niveau} titre={LIBELLE[n.niveau]} sousTitre={n.rangs ? `rangs ${n.rangs}` : undefined} bilan={n.bilan} />
      ))}
    </div>
  );
}
