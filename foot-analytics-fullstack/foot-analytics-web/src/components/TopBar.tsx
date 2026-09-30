// src/components/TopBar.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, Check, ChevronDown, Lock, Search, Settings } from "lucide-react";
import { api } from "@/lib/api";
import { useOwnClubId } from "@/lib/own-club-context";
import { ClubBadge } from "@/components/ClubBadge";
import { SettingsDrawer } from "@/components/SettingsDrawer";
import { getCachedUser } from "@/lib/auth";
import type { Club, Joueur } from "@/lib/types";

interface Hit {
  type: "joueur" | "club" | "arbitre";
  label: string;
  sub: string;
  href: string;
}

export function TopBar({ title }: { title?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const ownClubId = useOwnClubId();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [joueurs, setJoueurs] = useState<Joueur[]>([]);
  const [arbitres, setArbitres] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Seul un admin peut switcher de club entraine. Un user non-admin est
  // verrouille sur son clubId par les permissions (cf. maj 36/37).
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { setIsAdmin(getCachedUser()?.role === "admin"); }, []);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  // Vider la recherche a chaque changement de route (clic sidebar, lien…)
  useEffect(() => { setQ(""); }, [pathname]);

  // Fermer aussi au clic hors de la zone de recherche.
  useEffect(() => {
    if (!q) return;
    const onClick = (e: MouseEvent) => {
      if (!searchWrapRef.current?.contains(e.target as Node)) setQ("");
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setQ(""); };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [q]);

  // Charge clubs, joueurs et arbitres pour la recherche globale + le switcher.
  useEffect(() => {
    api.clubs().then(setClubs).catch(() => {});
    api.joueurs().then(setJoueurs).catch(() => {});
    api.arbitres().then(setArbitres).catch(() => {});
  }, []);

  const ownClub = clubs.find((c) => c.id === ownClubId);
  const coachInitials = (ownClub?.abbr ?? "FC").slice(0, 2).toUpperCase();
  const coachLabel = ownClub?.nom ?? "Club non defini";

  async function switchClub(clubId: string) {
    if (clubId === ownClubId) {
      setMenuOpen(false);
      return;
    }
    setSwitching(true);
    try {
      await fetch("/api/own-club", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId }),
      });
      setMenuOpen(false);
      // Recharge complete : les Server Components ET les Client Components
      // reprennent la nouvelle valeur (depuis le cookie / le provider).
      window.location.reload();
    } catch {
      setSwitching(false);
    }
  }

  const hits = useMemo<Hit[]>(() => {
    if (q.trim().length < 2) return [];
    const r = q.toLowerCase();
    const out: Hit[] = [];
    for (const j of joueurs) {
      if (
        j.nom.toLowerCase().includes(r) ||
        (j.prenom ?? "").toLowerCase().includes(r)
      ) {
        const club = clubs.find((c) => c.id === j.clubId);
        const clubLabel = club?.nom ?? "—";
        out.push({
          type: "joueur",
          label: `${j.prenom ?? ""} ${j.nom}`.trim(),
          // Pas de compteurs ici : ceux du joueur sont des cumuls toutes saisons.
          sub: `${clubLabel} · ${j.poste ?? "—"}`,
          href: `/joueur/${j.id}`,
        });
      }
      if (out.length >= 8) break;
    }
    for (const c of clubs) {
      if (c.nom.toLowerCase().includes(r)) {
        out.push({
          type: "club",
          label: c.nom,
          sub: c.ville ?? "",
          href: `/club/${c.id}`,
        });
      }
    }
    for (const a of arbitres) {
      const match = a.nom.toLowerCase().includes(r) ||
        (a.prenom ?? "").toLowerCase().includes(r);
      if (match) {
        const sub = [
          a.profil ? `Profil ${a.profil}` : null,
          `${a.matchsOfficies ?? 0} match${(a.matchsOfficies ?? 0) > 1 ? "s" : ""}`,
        ].filter(Boolean).join(" · ");
        out.push({
          type: "arbitre",
          label: `${a.prenom ? a.prenom + " " : ""}${a.nom}`.trim(),
          sub,
          href: `/arbitres/${a.id}`,
        });
      }
    }
    return out.slice(0, 12);
  }, [q, joueurs, clubs, arbitres]);

  // Ferme le menu profil au clic exterieur.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = () => setMenuOpen(false);
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [menuOpen]);

  return (
    <>
    <header className="sticky top-0 z-20 bg-base/85 backdrop-blur-md border-b border-line">
      <div className="px-6 py-3 flex items-center gap-4">
        <div className="font-display text-[15px] font-bold text-ink">
          {title ?? "Foot Analytics"}
        </div>

        <div ref={searchWrapRef} className="flex-1 max-w-xl mx-auto relative">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-line bg-panel">
            <Search size={14} className="text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher joueur, club, arbitre, saison…"
              className="bg-transparent outline-none text-sm flex-1 placeholder:text-faint"
            />
            <kbd className="hidden md:inline-flex text-[10px] font-mono text-faint border border-line px-1.5 rounded">
              ⌘ K
            </kbd>
          </div>
          {hits.length > 0 && (
            <div className="absolute top-[calc(100%+6px)] left-0 right-0 panel max-h-80 overflow-auto py-1.5 z-30">
              {hits.map((h, i) => (
                <Link
                  key={i}
                  href={h.href}
                  onClick={() => setQ("")}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-line/40"
                >
                  <span
                    className={`badge ${
                      h.type === "joueur" ? "badge-sky"
                      : h.type === "arbitre" ? "badge-turf"
                      : "badge-amber"
                    }`}
                  >
                    {h.type}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink truncate">{h.label}</div>
                    <div className="text-[11px] text-muted truncate">{h.sub}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <button className="btn">
          <Bell size={14} />
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="btn"
          title="Reglages"
          aria-label="Reglages"
        >
          <Settings size={14} />
        </button>

        {/* Profil coach + switcher de club entraine. Verrouille pour
            les utilisateurs non-admin (leur clubId vient du JWT). */}
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={isAdmin ? () => setMenuOpen((o) => !o) : undefined}
            disabled={!isAdmin}
            title={isAdmin ? "Changer de club entraine" : "Club verrouille par tes droits d'acces"}
            className={`flex items-center gap-2 px-2 py-1 rounded-md border border-line bg-panel transition ${
              isAdmin ? "hover:bg-line/40 cursor-pointer" : "cursor-default opacity-90"
            }`}
          >
            {ownClub ? (
              <ClubBadge clubId={ownClub.id} size={28} />
            ) : (
              <div className="w-7 h-7 rounded-full bg-turf grid place-items-center text-base text-xs font-bold">
                {coachInitials}
              </div>
            )}
            <div className="text-left leading-tight">
              <div className="text-xs font-semibold text-ink max-w-[160px] truncate">
                {coachLabel}
              </div>
              <div className="text-[10px] text-faint uppercase tracking-wider">
                Club entraine
              </div>
            </div>
            {isAdmin ? (
              <ChevronDown size={12} className="text-faint" />
            ) : (
              <Lock size={11} className="text-faint" />
            )}
          </button>

          {isAdmin && menuOpen && (
            <div className="absolute right-0 top-[calc(100%+6px)] z-40 panel min-w-[280px] max-h-[420px] overflow-auto py-1.5">
              <div className="px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-faint">
                Changer de club entraine
              </div>
              {clubs.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted">
                  Aucun club charge. Importez des feuilles FMI ou demarrez le
                  backend.
                </div>
              )}
              {clubs.map((c) => {
                const active = c.id === ownClubId;
                return (
                  <button
                    key={c.id}
                    onClick={() => switchClub(c.id)}
                    disabled={switching}
                    className={`w-full text-left flex items-center gap-2.5 px-3 py-2 hover:bg-line/40 ${
                      active ? "bg-turf/[0.08]" : ""
                    }`}
                  >
                    <ClubBadge clubId={c.id} size={22} />
                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-sm truncate ${
                          active ? "text-turf font-semibold" : "text-ink"
                        }`}
                      >
                        {c.nom}
                      </div>
                      {c.ville && (
                        <div className="text-[10px] text-faint truncate">
                          {c.ville}
                        </div>
                      )}
                    </div>
                    {active && <Check size={13} className="text-turf" />}
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
