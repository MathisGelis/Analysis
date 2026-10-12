// src/features/shell/components/PageIndisponible.tsx
//
// Ce que l'on voit quand on ouvre, par son adresse, une page qui n'est pas ouverte a ce compte sur cette saison. La
// navigation ne propose pas ces pages ; ceci ne sert qu'aux liens anciens ou tapes a la main.

import Link from "next/link";
import { CalendarClock, ShieldAlert } from "lucide-react";

import { BoutonSaisonEnCours } from "@/features/saisons/components/BoutonSaisonEnCours";

import type { RestrictionPage } from "../lib/acces-pages";
import type { VerdictPage } from "../lib/garde-page";

export function PageIndisponible({
  page, verdict,
}: { page: string; verdict: VerdictPage & { restriction: RestrictionPage } }) {
  const { restriction, saisonChoisie, saisonActive } = verdict;
  const Icone = restriction === "admin" ? ShieldAlert : CalendarClock;
  return (
    <section className="panel mx-auto max-w-2xl space-y-3 p-8 text-center fade-up" data-testid="page-indisponible" data-restriction={restriction}>
      <Icone size={26} className="mx-auto text-amber" aria-hidden />
      <h1 className="font-display text-xl font-bold text-ink">
        {restriction === "admin" ? `${page} : reserve a l'administrateur` : `${page} : disponible sur la saison en cours`}
      </h1>
      <p className="mx-auto max-w-lg text-sm text-muted">
        {restriction === "admin"
          ? "Cette page n'est pas ouverte aux educateurs ni aux referents. Demandez a un administrateur si vous avez besoin d'y faire quelque chose."
          : <>La preparation du prochain match (calendrier, entrainements, tactique, predictions) n&apos;a de sens que sur la saison en cours ou a venir.
              {saisonChoisie ? <> Vous consultez la saison <strong className="text-ink">{saisonChoisie.nom}</strong>, terminee.</> : null}</>}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
        {restriction === "saison-passee" && saisonActive && <BoutonSaisonEnCours primaire />}
        <Link href="/" className="btn text-sm">Retour au dashboard</Link>
      </div>
    </section>
  );
}
