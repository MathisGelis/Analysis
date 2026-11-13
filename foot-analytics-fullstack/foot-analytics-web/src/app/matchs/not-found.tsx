// src/app/matchs/not-found.tsx
//
// Page introuvable de la section : affichee quand une fiche appelle notFound() (identifiant inconnu, ou hors de la saison choisie).

import { PageIntrouvable } from "@/features/shell/components/PageIntrouvable";

export const metadata = { title: "Match introuvable · Foot Analytics" };

export default function NonTrouve() {
  return (
    <PageIntrouvable
      section="Match"
      titre="Match introuvable"
      message="Ce match n'existe pas (ou plus), ou il appartient à une saison que tu ne peux pas consulter."
      retour={{ href: "/matchs", libelle: "Retour aux matchs" }}
    />
  );
}
