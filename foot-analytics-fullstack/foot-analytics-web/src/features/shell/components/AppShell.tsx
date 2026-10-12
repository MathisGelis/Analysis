"use client";
// src/features/shell/components/AppShell.tsx
//
// Coquille de l'application connectee : barre laterale (navigation ; rail
// repliable sur bureau, tiroir sur mobile), barre du haut (recherche de fiches)
// et zone de contenu. L'etat "replie" est memorise dans un cookie lu par le serveur : la
// page arrive deja dans le bon etat, sans clignotement.

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { EVENEMENT_RECHERCHE } from "@/features/recherche/components/RechercheGlobale";

import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({
  children, sidebarRepliee,
}: { children: React.ReactNode; sidebarRepliee: boolean }) {
  const pathname = usePathname();
  const [replie, setReplie] = useState(sidebarRepliee);
  const [mobileOuvert, setMobileOuvert] = useState(false);

  const basculerReplie = useCallback(() => {
    setReplie((r) => {
      document.cookie = `fa_sidebar=${r ? "deplie" : "replie"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      return !r;
    });
  }, []);

  // Le tiroir mobile se ferme a chaque navigation.
  useEffect(() => { setMobileOuvert(false); }, [pathname]);

  // Raccourcis : Ctrl/Cmd + K partout, "/" hors d'un champ de saisie. Ils placent le curseur dans la barre de recherche.
  useEffect(() => {
    const chercher = () => window.dispatchEvent(new Event(EVENEMENT_RECHERCHE));
    const onKey = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null;
      const saisie = !!cible && (cible.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        chercher();
      } else if (e.key === "/" && !saisie && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        chercher();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-screen">
      {/* Lien d'evitement : le clavier saute la navigation et va droit au contenu. */}
      <a href="#contenu"
        className="sr-only print:hidden focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-90 focus:rounded-xl focus:bg-accentstrong focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white">
        Aller au contenu
      </a>
      <Sidebar
        replie={replie} onBasculerReplie={basculerReplie}
        mobileOuvert={mobileOuvert} onFermerMobile={() => setMobileOuvert(false)}
      />
      <main className="relative z-10 min-w-0 flex-1">
        <TopBar onOuvrirMenu={() => setMobileOuvert(true)} />
        <div id="contenu" tabIndex={-1} className="mx-auto max-w-[1500px] px-4 py-6 outline-none sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
