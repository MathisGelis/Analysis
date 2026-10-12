"use client";
// src/shared/ui/AdminOnglets.tsx
//
// Onglets de l'espace d'administration (pages distinctes, donc de vrais liens) : les comptes et l'IA.
// Reserve a l'administrateur : le referent n'a que la gestion de ses educateurs.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brain, Users } from "lucide-react";

const ONGLETS = [
  { href: "/admin/utilisateurs", label: "Comptes", icon: Users },
  { href: "/admin/ia", label: "IA", icon: Brain },
] as const;

export function AdminOnglets() {
  const chemin = usePathname();
  return (
    <nav aria-label="Administration" className="max-w-full overflow-x-auto">
      <ul className="inline-flex gap-1 rounded-2xl border border-line bg-panel2/70 p-1">
        {ONGLETS.map(({ href, label, icon: Icone }) => {
          const actif = chemin === href || chemin.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link href={href} aria-current={actif ? "page" : undefined}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  actif ? "border border-line2/60 bg-panel text-ink shadow-panel" : "border border-transparent text-muted hover:text-ink"}`}>
                <Icone size={14} aria-hidden /> {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
