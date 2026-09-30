// src/app/rapports/equipe/page.tsx
//
// Ancienne adresse du rapport de mon equipe : redirige vers la page unique
// /rapports/equipe/[clubId] (le rapport y est cadre sur la saison choisie).

import { redirect } from "next/navigation";
import { getOwnClubIdServer } from "@/lib/own-club";

export default function RapportMonEquipe() {
  redirect(`/rapports/equipe/${getOwnClubIdServer()}`);
}
