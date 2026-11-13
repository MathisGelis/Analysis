// src/app/club/not-found.tsx
//
// Page introuvable de la section : affichee quand une fiche appelle notFound() (identifiant inconnu, ou hors de la saison choisie).

import { PageIntrouvable } from "@/features/shell/components/PageIntrouvable";

export const metadata = { title: "Club introuvable · Foot Analytics" };

export default function NonTrouve() {
  return (
    <PageIntrouvable
      section="Club"
      titre="Club introuvable"
      message="Ce club n'existe pas (ou plus) dans la base, ou n'a aucune équipe dans la saison choisie."
      retour={{ href: "/classement", libelle: "Retour au classement" }}
    />
  );
}
