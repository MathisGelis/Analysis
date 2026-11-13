// src/app/coachs/not-found.tsx
//
// Page introuvable de la section : affichee quand une fiche appelle notFound() (identifiant inconnu, ou hors de la saison choisie).

import { PageIntrouvable } from "@/features/shell/components/PageIntrouvable";

export const metadata = { title: "Entraîneur introuvable · Foot Analytics" };

export default function NonTrouve() {
  return (
    <PageIntrouvable
      section="Entraîneur"
      titre="Entraîneur introuvable"
      message="Cet entraîneur n'existe pas (ou plus) dans la base, ou n'a dirigé aucun match de la saison choisie."
      retour={{ href: "/matchs", libelle: "Retour aux matchs" }}
    />
  );
}
