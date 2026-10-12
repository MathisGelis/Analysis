"use client";
// src/shared/ui/TabBar.tsx
//
// Barre d'onglets unique de l'application (fiche club, fiche joueur,
// classement) : un curseur glisse d'un onglet a l'autre au lieu de sauter.
// Accessible : role tablist / tab, fleches gauche-droite, Debut / Fin.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";

export interface Onglet<T extends string> {
  id: T;
  label: string;
  icon?: LucideIcon;
}

export function TabBar<T extends string>({
  onglets, actif, onChange, label = "Sections", className = "",
}: {
  onglets: readonly Onglet<T>[];
  actif: T;
  onChange: (id: T) => void;
  label?: string;
  className?: string;
}) {
  const boutons = useRef<Record<string, HTMLButtonElement | null>>({});
  const [curseur, setCurseur] = useState<{ x: number; w: number } | null>(null);

  const mesurer = useCallback(() => {
    const b = boutons.current[actif];
    if (b) setCurseur({ x: b.offsetLeft, w: b.offsetWidth });
  }, [actif]);

  useLayoutEffect(mesurer, [mesurer, onglets.length]);
  useEffect(() => {
    window.addEventListener("resize", mesurer);
    return () => window.removeEventListener("resize", mesurer);
  }, [mesurer]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = onglets.findIndex((o) => o.id === actif);
    const aller = (j: number) => {
      const cible = onglets[(j + onglets.length) % onglets.length];
      onChange(cible.id);
      boutons.current[cible.id]?.focus();
    };
    if (e.key === "ArrowRight") { e.preventDefault(); aller(i + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); aller(i - 1); }
    else if (e.key === "Home") { e.preventDefault(); aller(0); }
    else if (e.key === "End") { e.preventDefault(); aller(onglets.length - 1); }
  };

  return (
    <div className={`max-w-full overflow-x-auto ${className}`}>
      <div role="tablist" aria-label={label} onKeyDown={onKeyDown}
        className="relative inline-flex gap-1 rounded-2xl border border-line bg-panel2/70 p-1">
        {curseur && (
          <span aria-hidden="true"
            className="absolute bottom-1 top-1 rounded-xl border border-line2/60 bg-panel shadow-panel transition-[transform,width] duration-300 ease-smooth"
            style={{ width: curseur.w, transform: `translateX(${curseur.x - 4}px)`, left: 4 }} />
        )}
        {onglets.map((o) => {
          const Icone = o.icon;
          const on = o.id === actif;
          return (
            <button
              key={o.id}
              ref={(el) => { boutons.current[o.id] = el; }}
              role="tab" aria-selected={on} tabIndex={on ? 0 : -1}
              onClick={() => onChange(o.id)}
              className={`relative z-10 flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition-colors
                ${on ? "text-accent" : "text-muted hover:text-ink"}`}
            >
              {Icone && <Icone size={14} />}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
