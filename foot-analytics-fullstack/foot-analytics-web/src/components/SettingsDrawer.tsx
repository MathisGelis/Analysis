"use client";
// src/components/SettingsDrawer.tsx
//
// Drawer (panneau coulissant droit) pour les preferences utilisateur.
// Pour l'instant : juste le toggle theme. Pensé pour grandir (langue,
// densite, raccourcis clavier...).

import { useEffect } from "react";
import { Moon, Sun, X, Monitor } from "lucide-react";
import { useTheme } from "@/lib/theme-context";

export function SettingsDrawer({
  open, onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { theme, set } = useTheme();

  // Echap pour fermer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Bloque scroll body quand ouvert.
  useEffect(() => {
    if (open) {
      const old = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = old; };
    }
  }, [open]);

  function handlePickDark() {
    // eslint-disable-next-line no-console
    console.debug("[theme] pick dark");
    set("dark");
  }
  function handlePickLight() {
    // eslint-disable-next-line no-console
    console.debug("[theme] pick light");
    set("light");
  }
  function handlePickSystem() {
    // Reset preference -> respect systeme. Pas de pose de cookie.
    // eslint-disable-next-line no-console
    console.debug("[theme] pick system");
    try {
      localStorage.removeItem("fa.theme");
      document.cookie = "fa_theme=; path=/; max-age=0";
    } catch {}
    const sys = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    set(sys);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden
      />

      {/* Drawer */}
      <aside
        className={`fixed top-0 right-0 z-50 h-full w-[380px] max-w-[90vw]
          panel shadow-pop transition-transform duration-300 ease-smooth
          ${open ? "translate-x-0" : "translate-x-full"}`}
        style={{ borderRadius: 0, borderLeftWidth: 1, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: 0 }}
        role="dialog"
        aria-label="Parametres"
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-line">
          <div>
            <div className="h-section">Reglages</div>
            <h2 className="font-display text-xl font-bold text-ink mt-0.5">Preferences</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg grid place-items-center hover:bg-line/40 text-faint hover:text-ink transition"
            aria-label="Fermer"
          >
            <X size={16}/>
          </button>
        </div>

        <div className="px-6 py-6 space-y-8 overflow-y-auto h-[calc(100%-80px)]">

          {/* Section : Apparence */}
          <section>
            <div className="h-section mb-3">Apparence</div>
            <p className="text-xs text-muted mb-4 leading-relaxed">
              Choisis le mode qui te va le mieux selon le moment.
              Sombre pour les longues sessions le soir, clair au bureau.
            </p>

            <div className="grid grid-cols-3 gap-2">
              <ThemeChoice
                active={theme === "dark"}
                onClick={handlePickDark}
                icon={<Moon size={18}/>}
                label="Sombre"
                hint="Defaut"
              />
              <ThemeChoice
                active={theme === "light"}
                onClick={handlePickLight}
                icon={<Sun size={18}/>}
                label="Clair"
                hint="Bureau"
              />
              <ThemeChoice
                active={false}
                onClick={handlePickSystem}
                icon={<Monitor size={18}/>}
                label="Systeme"
                hint="Auto"
              />
            </div>

            {/* Indicateur courant pour confirmer visuellement le clic */}
            <div className="mt-4 panel-inset px-3 py-2 text-[11px] text-muted flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-turf pulse-live"/>
              Mode actuel : <span className="text-ink font-semibold">{theme === "dark" ? "Sombre" : "Clair"}</span>
            </div>
          </section>

          {/* Section : a propos */}
          <section>
            <div className="h-section mb-3">A propos</div>
            <div className="panel-inset p-4 text-xs text-muted leading-relaxed">
              <p className="font-display font-bold text-ink mb-1">Foot Analytics</p>
              <p>Console d'analyse et de suivi pour staff de football amateur.</p>
              <p className="mt-2 text-faint">Version dev · 2025-2026</p>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}

function ThemeChoice({
  active, onClick, icon, label, hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 px-3 py-4 rounded-lg border-2 transition-all cursor-pointer
        ${active
          ? "border-turf/60 bg-turf/[0.08]"
          : "border-line hover:border-line2 bg-panel2"
        }`}
      aria-pressed={active}
    >
      <span className={active ? "text-turf" : "text-muted"}>{icon}</span>
      <span className={`text-xs font-semibold ${active ? "text-ink" : "text-muted"}`}>
        {label}
      </span>
      <span className="text-[10px] text-faint uppercase tracking-wider">{hint}</span>
    </button>
  );
}
