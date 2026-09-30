// src/components/TopBar.tsx
"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Check, ChevronDown, Lock, Menu, Moon, Search, Settings, Sun } from "lucide-react";
import { api } from "@/lib/api";
import { useOwnClubId } from "@/lib/own-club-context";
import { useTheme } from "@/lib/theme-context";
import { titrePage } from "@/lib/navigation";
import { ClubBadge } from "@/components/ClubBadge";
import { SettingsDrawer } from "@/components/SettingsDrawer";
import { getCachedUser } from "@/lib/auth";
import type { Club } from "@/lib/types";

interface Props {
  onOuvrirMenu: () => void;
  onOuvrirPalette: () => void;
}

export function TopBar({ onOuvrirMenu, onOuvrirPalette }: Props) {
  const pathname = usePathname();
  const ownClubId = useOwnClubId();
  const { theme, toggle } = useTheme();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Seul un admin peut changer de club entraine ; un utilisateur simple est
  // verrouille sur son club par ses droits.
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { setIsAdmin(getCachedUser()?.role === "admin"); }, []);

  useEffect(() => { api.clubs().then(setClubs).catch(() => {}); }, []);

  const ownClub = clubs.find((c) => c.id === ownClubId);

  async function switchClub(clubId: string) {
    if (clubId === ownClubId) { setMenuOpen(false); return; }
    setSwitching(true);
    try {
      await fetch("/api/own-club", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId }),
      });
      setMenuOpen(false);
      // Recharge complete : Server et Client Components repartent du nouveau cookie.
      window.location.reload();
    } catch {
      setSwitching(false);
    }
  }

  // Ferme le menu club au clic exterieur.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = () => setMenuOpen(false);
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [menuOpen]);

  return (
    <>
      <header className="sticky top-0 z-30 glass border-b border-line print:hidden">
        <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
          <button type="button" onClick={onOuvrirMenu} className="btn btn-ghost !p-2 lg:hidden" aria-label="Ouvrir le menu">
            <Menu size={20} />
          </button>

          <h2 className="font-display text-[17px] font-bold text-ink truncate min-w-0">{titrePage(pathname)}</h2>

          {/* Recherche : ouvre la palette de commandes. */}
          <button
            type="button" onClick={onOuvrirPalette}
            className="group ml-auto flex h-10 w-full max-w-md items-center gap-3 rounded-xl border border-line bg-panel2/70 px-3.5 text-left text-sm text-faint
              transition hover:border-accent/50 hover:bg-panel2 sm:ml-auto max-sm:w-10 max-sm:justify-center max-sm:px-0"
            aria-label="Rechercher (Ctrl K)"
          >
            <Search size={16} className="shrink-0 text-muted transition-colors group-hover:text-accent" />
            <span className="flex-1 truncate max-sm:hidden">Rechercher joueur, club, page...</span>
            <span className="hidden items-center gap-1 sm:flex"><kbd className="kbd">Ctrl</kbd><kbd className="kbd">K</kbd></span>
          </button>

          <button type="button" onClick={toggle} className="btn btn-ghost !p-2.5"
            title={theme === "dark" ? "Passer en mode jour" : "Passer en mode nuit"}
            aria-label={theme === "dark" ? "Passer en mode jour" : "Passer en mode nuit"}>
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button type="button" onClick={() => setSettingsOpen(true)} className="btn btn-ghost !p-2.5 max-sm:hidden"
            title="Reglages" aria-label="Reglages">
            <Settings size={17} />
          </button>

          {/* Club entraine : verrouille pour les non-admin (leur club vient du jeton). */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={isAdmin ? () => setMenuOpen((o) => !o) : undefined}
              disabled={!isAdmin}
              title={isAdmin ? "Changer de club entraine" : "Club verrouille par tes droits d'acces"}
              aria-haspopup={isAdmin ? "menu" : undefined} aria-expanded={isAdmin ? menuOpen : undefined}
              className={`flex items-center gap-2.5 rounded-xl border border-line bg-panel px-2 py-1.5 transition
                ${isAdmin ? "cursor-pointer hover:border-accent/50" : "cursor-default"}`}
            >
              {ownClub ? (
                <ClubBadge clubId={ownClub.id} size={30} />
              ) : (
                <div className="grid h-[30px] w-[30px] place-items-center rounded-full bg-accentstrong text-xs font-bold text-white">FC</div>
              )}
              <div className="hidden text-left leading-tight md:block">
                <div className="max-w-[150px] truncate text-[13px] font-semibold text-ink">{ownClub?.nom ?? "Club non defini"}</div>
                <div className="text-[11px] text-faint">Club entraine</div>
              </div>
              {isAdmin ? <ChevronDown size={14} className="text-faint max-md:hidden" /> : <Lock size={12} className="text-faint max-md:hidden" />}
            </button>

            {isAdmin && menuOpen && (
              <div role="menu" className="pop-in glass panel-pop absolute right-0 top-[calc(100%+8px)] z-40 max-h-[420px] min-w-[290px] overflow-auto py-2">
                <div className="h-section px-4 py-2">Changer de club entraine</div>
                {clubs.length === 0 && (
                  <div className="px-4 py-2 text-xs text-muted">
                    Aucun club charge. Importez des feuilles FMI ou demarrez le backend.
                  </div>
                )}
                {clubs.map((c) => {
                  const active = c.id === ownClubId;
                  return (
                    <button
                      key={c.id} role="menuitem"
                      onClick={() => switchClub(c.id)}
                      disabled={switching}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-accent/[0.08] ${active ? "bg-accent/[0.1]" : ""}`}
                    >
                      <ClubBadge clubId={c.id} size={24} />
                      <div className="min-w-0 flex-1">
                        <div className={`truncate text-sm ${active ? "font-semibold text-accent" : "text-ink"}`}>{c.nom}</div>
                        {c.ville && <div className="truncate text-[11px] text-faint">{c.ville}</div>}
                      </div>
                      {active && <Check size={14} className="text-accent" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </header>

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
