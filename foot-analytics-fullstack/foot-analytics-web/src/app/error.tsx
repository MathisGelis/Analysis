"use client";
// src/app/error.tsx
//
// Erreur de rendu d'une page : la coquille (barre laterale, recherche) reste
// affichee et l'utilisateur peut reessayer ou revenir au dashboard, au lieu
// d'un ecran d'erreur Next brut.

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { debug } from "@/lib/debug";

export default function Erreur({
  error, reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => { debug("[error.tsx]", error); }, [error]);

  // Les pages appellent l'API : le cas le plus courant est un backend arrete.
  const apiInjoignable = /API \d+|fetch failed|ECONNREFUSED/i.test(error.message ?? "");

  return (
    <div className="max-w-xl mx-auto mt-16 panel p-8 text-center fade-up" role="alert">
      <div className="w-12 h-12 rounded-full bg-danger/15 grid place-items-center mx-auto mb-4">
        <AlertTriangle size={22} className="text-danger" />
      </div>
      <div className="h-section">Erreur</div>
      <h1 className="font-display text-2xl font-bold text-ink mt-1">
        Cette page n'a pas pu s'afficher
      </h1>
      <p className="text-sm text-muted mt-3 leading-relaxed">
        {apiInjoignable
          ? "Le serveur de donnees ne repond pas correctement. Verifie que l'API tourne (par defaut sur le port 4000), puis reessaie."
          : "Un probleme inattendu est survenu pendant le chargement. Reessayer suffit souvent."}
      </p>
      {error.digest && (
        <p className="text-[11px] text-faint font-mono mt-2">Reference : {error.digest}</p>
      )}
      <div className="flex items-center justify-center gap-2 mt-6">
        <button onClick={reset} className="btn btn-turf">
          <RefreshCw size={14} /> Reessayer
        </button>
        <Link href="/" className="btn btn-ghost">
          <Home size={14} /> Dashboard
        </Link>
      </div>
    </div>
  );
}
