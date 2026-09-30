"use client";
// src/components/SaisonGuard.tsx
//
// Bloque l'acces a une page si la saison selectionnee dans le switcher
// (bas de sidebar) n'est pas la saison "en cours" (= active).
//
// Usage : pour les pages dont les actions n'ont de sens que sur la
// saison courante — typiquement /tactique (analyse en temps reel) ou
// /calendrier (planning futur). Pour les saisons passees, ces vues
// n'apportent rien d'utile.
//
// Mode "warn-only" : on n'empeche pas le rendu, on l'enveloppe d'un
// overlay informatif avec un bouton "Revenir a la saison en cours".

import { useEffect, useState } from "react";
import { useOwnEquipe } from "@/lib/own-equipe-context";
import { api } from "@/lib/api";
import { AlertCircle, ArrowRight } from "lucide-react";

export function SaisonGuard({
  children, libelle = "Cette page",
}: {
  children: React.ReactNode;
  libelle?: string;
}) {
  const { saisonId, setEquipe } = useOwnEquipe();
  const [saisons, setSaisons] = useState<any[]>([]);
  const [equipes, setEquipes] = useState<any[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const [s, e] = await Promise.all([api.saisons(), api.equipes()]);
      setSaisons(s);
      setEquipes(e);
      setReady(true);
    })();
  }, []);

  if (!ready) return <>{children}</>;

  const saisonActive = saisons.find((x: any) => x.actif);
  const saisonChoisie = saisons.find((x: any) => x.id === saisonId);
  // OK si saison active OU si rien n'est encore selectionne (= page
  // initiale apres login, on laisse passer).
  if (!saisonChoisie || saisonChoisie.actif) {
    return <>{children}</>;
  }

  async function revenirSaisonActive() {
    if (!saisonActive) return;
    // Trouver une equipe sur la saison active pour poser le cookie
    // correctement (sinon le switcher reste sur la mauvaise saison).
    const candidates = equipes.filter((eq: any) => eq.saisonId === saisonActive.id);
    const first = candidates[0];
    setEquipe(first?.id ?? null, saisonActive.id);
    await fetch("/api/own-equipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        equipeId: first?.id ?? null,
        saisonId: saisonActive.id,
      }),
    });
    window.location.reload();
  }

  return (
    <div className="panel p-8 text-center fade-up">
      <div className="w-12 h-12 rounded-full bg-amber/15 grid place-items-center mx-auto mb-4">
        <AlertCircle size={22} className="text-amber"/>
      </div>
      <h2 className="font-display text-xl font-bold text-ink mb-2">
        {libelle} n'est pas disponible sur cette saison
      </h2>
      <p className="text-sm text-muted mb-1">
        Tu consultes actuellement la saison <strong className="text-ink">{saisonChoisie.nom}</strong>{" "}
        qui n'est pas la saison en cours.
      </p>
      <p className="text-xs text-faint max-w-md mx-auto mb-6">
        Cette page n'a de sens que sur la saison active : elle sert au
        suivi en temps reel ou a la preparation des matchs a venir.
        Reviens a la saison active pour y acceder.
      </p>
      {saisonActive ? (
        <button onClick={revenirSaisonActive} className="btn btn-turf">
          Revenir a {saisonActive.nom} <ArrowRight size={14}/>
        </button>
      ) : (
        <p className="text-xs text-danger">
          Aucune saison active definie. Va dans /admin pour en activer une.
        </p>
      )}
    </div>
  );
}
