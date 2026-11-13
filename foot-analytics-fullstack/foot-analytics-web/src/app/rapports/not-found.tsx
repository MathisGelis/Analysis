// src/app/rapports/not-found.tsx
//
// Page introuvable de la section : affichee quand une fiche appelle notFound() (identifiant inconnu, ou hors de la saison choisie).

import { PageIntrouvable } from "@/features/shell/components/PageIntrouvable";

export const metadata = { title: "Rapport introuvable · Foot Analytics" };

export default function NonTrouve() {
  return (
    <PageIntrouvable
      section="Rapports"
      titre="Rapport introuvable"
      message="Ce rapport n'existe pas : le club n'a pas d'équipe dans la saison choisie, ou aucun match n'est programmé à préparer."
      retour={{ href: "/rapports", libelle: "Retour aux rapports" }}
    />
  );
}
