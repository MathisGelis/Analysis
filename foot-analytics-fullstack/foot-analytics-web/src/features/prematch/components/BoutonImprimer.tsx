"use client";
// src/features/prematch/components/BoutonImprimer.tsx
//
// "Imprimer / PDF" : ouvre la boite d'impression du navigateur (qui propose l'enregistrement en
// PDF). Pendant l'impression, la page passe en theme jour pour sortir sur fond blanc, que
// l'impression parte du bouton ou d'un Ctrl+P.

import { useEffect } from "react";
import { Printer } from "lucide-react";

export function BoutonImprimer({ libelle = "Imprimer / PDF" }: { libelle?: string }) {
  useEffect(() => {
    const racine = document.documentElement;
    let theme: string | null = null;
    const avant = () => { theme = racine.getAttribute("data-theme"); racine.setAttribute("data-theme", "light"); };
    const apres = () => { if (theme) racine.setAttribute("data-theme", theme); theme = null; };
    window.addEventListener("beforeprint", avant);
    window.addEventListener("afterprint", apres);
    return () => {
      window.removeEventListener("beforeprint", avant);
      window.removeEventListener("afterprint", apres);
      apres();
    };
  }, []);

  return (
    <button type="button" onClick={() => window.print()} className="btn btn-primary text-sm print:hidden">
      <Printer size={14} aria-hidden /> {libelle}
    </button>
  );
}
