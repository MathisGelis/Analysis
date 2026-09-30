"use client";
// src/components/AppShell.tsx
//
// Coquille de l'application connectee : barre laterale (rail repliable sur
// bureau, tiroir sur mobile), barre du haut, palette de commandes et zone de
// contenu. L'etat "replie" est memorise dans un cookie lu par le serveur : la
// page arrive deja dans le bon etat, sans clignotement.

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { CommandPalette } from "@/components/CommandPalette";

export function AppShell({
  children, sidebarRepliee,
}: { children: React.ReactNode; sidebarRepliee: boolean }) {
  const pathname = usePathname();
  const [replie, setReplie] = useState(sidebarRepliee);
  const [mobileOuvert, setMobileOuvert] = useState(false);
  const [paletteOuverte, setPaletteOuverte] = useState(false);

  const basculerReplie = useCallback(() => {
    setReplie((r) => {
      document.cookie = `fa_sidebar=${r ? "deplie" : "replie"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      return !r;
    });
  }, []);

  // Le tiroir mobile se ferme a chaque navigation.
  useEffect(() => { setMobileOuvert(false); }, [pathname]);

  // Raccourcis : Ctrl/Cmd + K partout, "/" hors d'un champ de saisie.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null;
      const saisie = !!cible && (cible.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOuverte((o) => !o);
      } else if (e.key === "/" && !saisie && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setPaletteOuverte(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        replie={replie} onBasculerReplie={basculerReplie}
        mobileOuvert={mobileOuvert} onFermerMobile={() => setMobileOuvert(false)}
      />
      <main className="relative z-10 min-w-0 flex-1">
        <TopBar onOuvrirMenu={() => setMobileOuvert(true)} onOuvrirPalette={() => setPaletteOuverte(true)} />
        <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
      <CommandPalette ouverte={paletteOuverte} onFermer={() => setPaletteOuverte(false)} />
    </div>
  );
}
