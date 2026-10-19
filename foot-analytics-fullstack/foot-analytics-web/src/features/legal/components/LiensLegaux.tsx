// src/features/legal/components/LiensLegaux.tsx
//
// Liens vers les pages publiques : confidentialite, mentions legales, conditions d'utilisation. Presents en pied de
// page des ecrans de connexion, dans la coquille de l'application et sur les fiches joueurs.

import Link from "next/link";

export function LiensLegaux({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Informations legales" className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-faint ${className}`}>
      <Link href="/confidentialite" className="hover:text-ink hover:underline">Confidentialite</Link>
      <span aria-hidden>·</span>
      <Link href="/mentions-legales" className="hover:text-ink hover:underline">Mentions legales</Link>
      <span aria-hidden>·</span>
      <Link href="/cgu" className="hover:text-ink hover:underline">Conditions d'utilisation</Link>
    </nav>
  );
}
