"use client";
// src/features/shell/components/NavProgress.tsx
//
// Fine barre de progression en haut de l'ecran pendant une navigation. Le
// serveur calcule chaque page (appels API) : sans retour visuel, un clic
// semblait ne rien faire. La barre demarre au clic sur un lien interne et se
// termine quand l'adresse change.

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

function Barre() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [etat, setEtat] = useState<"repos" | "charge" | "fin">("repos");
  const minuteur = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Fin de navigation : la cle adresse + parametres a change.
  useEffect(() => {
    setEtat((e) => (e === "charge" ? "fin" : e));
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setEtat("repos"), 350);
    return () => clearTimeout(minuteur.current);
  }, [pathname, search]);

  // Debut : clic sur un lien interne qui change vraiment de page.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      clearTimeout(minuteur.current);
      setEtat("charge");
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-x-0 top-0 z-60 h-[3px] pointer-events-none"
      style={{ opacity: etat === "repos" ? 0 : 1, transition: "opacity 250ms ease" }}
    >
      <div
        className="h-full origin-left"
        style={{
          backgroundImage: "linear-gradient(90deg, rgb(var(--accent-strong)), rgb(var(--accent-2)))",
          boxShadow: "0 0 12px rgb(var(--accent) / .7)",
          width: etat === "repos" ? "0%" : etat === "charge" ? "82%" : "100%",
          transition: etat === "charge" ? "width 6s cubic-bezier(.1,.6,.2,1)" : "width 200ms ease-out",
        }}
      />
    </div>
  );
}

export function NavProgress() {
  return (
    <Suspense fallback={null}>
      <Barre />
    </Suspense>
  );
}
