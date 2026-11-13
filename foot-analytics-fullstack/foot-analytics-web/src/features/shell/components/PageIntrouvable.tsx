// src/features/shell/components/PageIntrouvable.tsx
//
// Page « introuvable » contextuelle d'une fiche (joueur, match, club...) : dit CE qui manque et ramene a la liste d'ou l'on vient,
// au lieu du message générique de app/not-found.tsx. Utilisee par le not-found.tsx de chaque section (Next l'affiche quand la page
// appelle notFound(), avec un vrai statut 404).

import Link from "next/link";
import { ArrowLeft, Compass, Home } from "lucide-react";

interface Props {
  /** Petit titre au-dessus (« Joueur », « Match »...). */
  section: string;
  /** « Joueur introuvable ». */
  titre: string;
  message: string;
  retour: { href: string; libelle: string };
}

export function PageIntrouvable({ section, titre, message, retour }: Props) {
  return (
    <div className="max-w-xl mx-auto mt-16 panel p-8 text-center fade-up">
      <div className="w-12 h-12 rounded-full bg-accent/15 grid place-items-center mx-auto mb-4">
        <Compass size={22} className="text-accent" />
      </div>
      <div className="h-section">{section}</div>
      <h1 className="font-display text-2xl font-bold text-ink mt-1">{titre}</h1>
      <p className="text-sm text-muted mt-3 leading-relaxed">{message}</p>
      <div className="flex items-center justify-center gap-2 mt-6">
        <Link href={retour.href} className="btn btn-accent"><ArrowLeft size={14} /> {retour.libelle}</Link>
        <Link href="/" className="btn btn-ghost"><Home size={14} /> Dashboard</Link>
      </div>
    </div>
  );
}
