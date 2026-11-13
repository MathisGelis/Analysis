// src/app/arbitres/not-found.tsx
//
// Page introuvable de la section : affichee quand une fiche appelle notFound() (identifiant inconnu, ou hors de la saison choisie).

import { PageIntrouvable } from "@/features/shell/components/PageIntrouvable";

export const metadata = { title: "Arbitre introuvable · Foot Analytics" };

export default function NonTrouve() {
  return (
    <PageIntrouvable
      section="Arbitre"
      titre="Arbitre introuvable"
      message="Cet arbitre n'existe pas (ou plus) dans la base, ou n'a arbitré aucun match de la saison choisie."
      retour={{ href: "/arbitres", libelle: "Retour aux arbitres" }}
    />
  );
}
