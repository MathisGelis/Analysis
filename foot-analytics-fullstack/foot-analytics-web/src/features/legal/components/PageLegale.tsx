// src/features/legal/components/PageLegale.tsx
//
// Cadre des pages legales publiques (accessibles sans connexion) : titre, date de mise a jour, contenu, liens.

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Logo } from "@/features/shell/components/Logo";

import { LiensLegaux } from "./LiensLegaux";

export function PageLegale({ titre, majLe, children }: { titre: string; majLe: string; children: React.ReactNode }) {
  return (
    <div className="relative z-10 mx-auto max-w-3xl px-4 py-8 sm:px-8 sm:py-12">
      <div className="mb-8 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2 text-sm text-muted hover:text-ink">
          <ArrowLeft size={14} /> Foot Analytics
        </Link>
        <Logo size={32} />
      </div>
      <article className="panel space-y-6 p-6 text-sm leading-relaxed text-muted sm:p-8 [&_h2]:mt-2 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_li]:ml-4 [&_li]:list-disc [&_strong]:text-ink">
        <header>
          <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">{titre}</h1>
          <p className="mt-1 text-xs text-faint">Mise a jour : {majLe}</p>
        </header>
        {children}
      </article>
      <LiensLegaux className="mt-6 justify-center" />
    </div>
  );
}

/** Mention d'une information que l'exploitant doit renseigner avant la mise en service. */
export function ACompleter({ children }: { children: React.ReactNode }) {
  return <mark className="rounded bg-amber/15 px-1 text-amber">[A completer : {children}]</mark>;
}
