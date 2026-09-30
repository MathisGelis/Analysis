// src/components/Sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useOwnClubId } from "@/lib/own-club-context";
import { construireNavigation, lienActif } from "@/lib/navigation";
import { Logo } from "@/components/Logo";
import { OwnEquipeSwitcher } from "@/components/OwnEquipeSwitcher";
import { UserBadge } from "@/components/UserBadge";

interface Props {
  /** Rail d'icones (bureau uniquement). */
  replie: boolean;
  onBasculerReplie: () => void;
  /** Tiroir mobile ouvert. */
  mobileOuvert: boolean;
  onFermerMobile: () => void;
}

/** Contenu commun a la barre laterale de bureau et au tiroir mobile. */
function Contenu({
  replie, onBasculerReplie, onFermerMobile, mobile,
}: { replie: boolean; onBasculerReplie: () => void; onFermerMobile: () => void; mobile: boolean }) {
  const path = usePathname();
  const ownClubId = useOwnClubId();
  const nav = construireNavigation(ownClubId || null);
  const compact = replie && !mobile;

  return (
    <div className="flex h-full flex-col">
      {/* Marque */}
      <div className={`flex items-center ${compact ? "justify-center px-2" : "justify-between px-4"} pt-4 pb-3`}>
        <Link href="/" className="flex items-center gap-3 group min-w-0" title="Dashboard">
          <Logo size={compact ? 38 : 40} className="shrink-0 transition-transform duration-300 group-hover:rotate-[-6deg] group-hover:scale-105" />
          {!compact && (
            <div className="leading-tight min-w-0">
              <div className="font-display text-[17px] font-bold text-ink truncate">Foot Analytics</div>
              <div className="text-[11px] font-medium text-faint">Console staff</div>
            </div>
          )}
        </Link>
        {mobile ? (
          <button type="button" onClick={onFermerMobile} className="btn btn-ghost !p-2" aria-label="Fermer le menu">
            <X size={18} />
          </button>
        ) : !compact ? (
          <button type="button" onClick={onBasculerReplie} className="btn btn-ghost !p-2 hidden lg:inline-flex"
            aria-label="Replier la barre laterale" title="Replier">
            <PanelLeftClose size={16} />
          </button>
        ) : null}
      </div>
      {compact && (
        <button type="button" onClick={onBasculerReplie} className="btn btn-ghost !p-2 mx-auto mb-2"
          aria-label="Deplier la barre laterale" title="Deplier">
          <PanelLeftOpen size={16} />
        </button>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-3.5" aria-label="Navigation principale">
        {nav.map((g) => (
          <div key={g.section}>
            {!compact ? (
              <div className="px-3 pb-1 h-section">{g.section}</div>
            ) : (
              <div className="mx-auto mb-2 h-px w-6 bg-line" aria-hidden="true" />
            )}
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const Icon = it.icon;
                const actif = lienActif(it.href, path);
                return (
                  <li key={it.label}>
                    <Link
                      href={it.href}
                      title={compact ? it.label : undefined}
                      aria-current={actif ? "page" : undefined}
                      onClick={mobile ? onFermerMobile : undefined}
                      className={`group relative flex items-center gap-3 rounded-xl py-1 text-[14px] font-medium transition-colors
                        ${compact ? "justify-center px-1.5" : "px-2"}
                        ${actif ? "bg-accent/[0.11] text-ink" : "text-muted hover:text-ink hover:bg-panel2"}`}
                    >
                      {actif && !compact && (
                        <span className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent" aria-hidden="true" />
                      )}
                      <span
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-all duration-200
                          ${actif
                            ? "bg-accentstrong text-white shadow-glow"
                            : "bg-panel2 text-muted group-hover:text-accent group-hover:scale-105"}`}
                      >
                        <Icon size={15} strokeWidth={2} />
                      </span>
                      {!compact && <span className="flex-1 truncate">{it.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Pied : equipe/saison + utilisateur */}
      <div className="border-t border-line">
        {!compact && (
          <div className="px-3 pt-3 pb-2">
            <OwnEquipeSwitcher />
          </div>
        )}
        <UserBadge compact={compact} />
      </div>
    </div>
  );
}

/**
 * Bureau (>= 1024 px) ou non ; null avant la mesure. Le contenu de la barre laterale
 * n'est monte qu'UNE fois : deux exemplaires (bureau masque + tiroir mobile) auraient
 * chacun leur selecteur d'equipe, avec leurs propres listes, et se contrediraient apres
 * un changement de saison.
 */
function useBureau(): boolean | null {
  const [bureau, setBureau] = useState<boolean | null>(null);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const maj = () => setBureau(mql.matches);
    maj();
    mql.addEventListener("change", maj);
    return () => mql.removeEventListener("change", maj);
  }, []);
  return bureau;
}

export function Sidebar({ replie, onBasculerReplie, mobileOuvert, onFermerMobile }: Props) {
  const bureau = useBureau();
  return (
    <>
      {/* Bureau : colonne collante, largeur animee entre menu complet et rail d'icones. */}
      <aside
        className={`relative z-20 hidden lg:block shrink-0 border-r border-line glass transition-[width] duration-300 ease-smooth
          ${replie ? "w-[84px]" : "w-[268px]"}`}
      >
        <div className="sticky top-0 h-screen">
          {bureau !== false && (
            <Contenu replie={replie} onBasculerReplie={onBasculerReplie} onFermerMobile={onFermerMobile} mobile={false} />
          )}
        </div>
      </aside>

      {/* Mobile : tiroir coulissant sur fond assombri. */}
      <div className={`lg:hidden fixed inset-0 z-50 ${mobileOuvert ? "" : "pointer-events-none"}`} aria-hidden={!mobileOuvert}>
        <div
          onClick={onFermerMobile}
          className={`absolute inset-0 bg-black/55 backdrop-blur-sm transition-opacity duration-300 ${mobileOuvert ? "opacity-100" : "opacity-0"}`}
        />
        <aside
          className={`absolute inset-y-0 left-0 w-[300px] max-w-[86vw] border-r border-line bg-panel shadow-pop transition-transform duration-300 ease-smooth
            ${mobileOuvert ? "translate-x-0" : "-translate-x-full"}`}
        >
          {bureau === false && (
            <Contenu replie={false} onBasculerReplie={onBasculerReplie} onFermerMobile={onFermerMobile} mobile />
          )}
        </aside>
      </div>
    </>
  );
}
