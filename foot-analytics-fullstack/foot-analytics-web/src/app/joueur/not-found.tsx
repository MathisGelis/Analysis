// src/app/joueur/not-found.tsx
//
// Page introuvable de la section : affichee quand une fiche appelle notFound() (identifiant inconnu, ou hors de la saison choisie).

import { PageIntrouvable } from "@/features/shell/components/PageIntrouvable";

export const metadata = { title: "Joueur introuvable · Foot Analytics" };

export default function NonTrouve() {
  return (
    <PageIntrouvable
      section="Joueur"
      titre="Joueur introuvable"
      message="Ce joueur n'existe pas (ou plus) dans la base, ou n'a pas joué dans la saison choisie."
      retour={{ href: "/effectif", libelle: "Retour à l'effectif" }}
    />
  );
}
