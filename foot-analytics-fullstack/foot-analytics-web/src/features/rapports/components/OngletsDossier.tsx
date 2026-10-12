// src/features/rapports/components/OngletsDossier.tsx
//
// Les onglets d'un dossier de club (pre-match, analyse d'equipe, scouting), affiches en haut de chacun des trois
// documents : on passe de l'un a l'autre sans repasser par la liste. Rien pour mon propre club (un seul document).

import Link from "next/link";

import { type DocumentDossier, type OptionsDossier, ongletsDuDossier } from "../lib/dossier";

export function OngletsDossier({ clubId, courant, ...options }: { clubId: string; courant: DocumentDossier } & OptionsDossier) {
  const onglets = ongletsDuDossier(clubId, options);
  if (onglets.length < 2) return null;
  return (
    <nav aria-label="Documents du club" className="max-w-full overflow-x-auto print:hidden">
      <ul className="inline-flex gap-1 rounded-2xl border border-line bg-panel2/70 p-1">
        {onglets.map((o) => {
          const actif = o.id === courant;
          return (
            <li key={o.id}>
              <Link href={o.href} aria-current={actif ? "page" : undefined}
                className={`inline-flex items-center rounded-xl px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  actif ? "border border-line2/60 bg-panel text-ink shadow-panel" : "border border-transparent text-muted hover:text-ink"}`}>
                {o.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
