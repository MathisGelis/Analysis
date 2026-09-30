// src/app/not-found.tsx
//
// Page introuvable (notFound() dans un Server Component, ou URL inconnue).

import Link from "next/link";
import { Compass, Home } from "lucide-react";

export const metadata = { title: "Page introuvable · Foot Analytics" };

export default function NonTrouve() {
  return (
    <div className="max-w-xl mx-auto mt-16 panel p-8 text-center fade-up">
      <div className="w-12 h-12 rounded-full bg-turf/15 grid place-items-center mx-auto mb-4">
        <Compass size={22} className="text-turf" />
      </div>
      <div className="h-section">Hors-jeu</div>
      <h1 className="font-display text-2xl font-bold text-ink mt-1">Page introuvable</h1>
      <p className="text-sm text-muted mt-3 leading-relaxed">
        Ce club, ce joueur ou ce match n'existe pas (ou plus) dans la base, ou
        n'appartient pas a la saison choisie.
      </p>
      <div className="flex items-center justify-center gap-2 mt-6">
        <Link href="/" className="btn btn-turf"><Home size={14} /> Dashboard</Link>
        <Link href="/classement" className="btn btn-ghost">Classement</Link>
      </div>
    </div>
  );
}
