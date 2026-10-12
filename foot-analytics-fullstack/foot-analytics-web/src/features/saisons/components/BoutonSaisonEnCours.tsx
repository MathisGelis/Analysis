"use client";
// src/features/saisons/components/BoutonSaisonEnCours.tsx
//
// Ramene la selection (equipe + saison) sur la saison en cours : l'equivalent de l'equipe actuelle sur cette saison si elle
// existe, sinon la premiere equipe du club. Utilise par le bandeau d'archive (SaisonGuard) et par la page "indisponible sur
// une saison passee".

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

import { equipeEquivalente } from "@/features/equipes/lib/empreinte-equipe";
import { useOwnClubId } from "@/features/equipes/lib/own-club-context";
import { useOwnEquipe } from "@/features/equipes/lib/own-equipe-context";
import { api } from "@/shared/lib/api";
import type { Equipe, Saison } from "@/shared/lib/types";

export function BoutonSaisonEnCours({ className = "btn btn-ghost text-xs", primaire = false }: { className?: string; primaire?: boolean }) {
  const { equipeId, setEquipe } = useOwnEquipe();
  const ownClubId = useOwnClubId();
  const [saisons, setSaisons] = useState<Saison[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);

  useEffect(() => {
    (async () => {
      const [s, e] = await Promise.all([api.saisons(), api.equipes(ownClubId)]);
      setSaisons(s);
      setEquipes(e);
    })();
  }, [ownClubId]);

  const saisonActive = saisons.find((x) => x.actif) ?? null;
  if (!saisonActive) return null;

  async function revenir() {
    const courante = equipes.find((eq) => eq.id === equipeId) ?? null;
    const candidates = equipes.filter((eq) => eq.saisonId === saisonActive!.id);
    const cible = (courante && candidates.find((eq) => equipeEquivalente(eq, courante))) ?? candidates[0] ?? null;
    setEquipe(cible?.id ?? null, saisonActive!.id);
    await fetch("/api/own-equipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ equipeId: cible?.id ?? null, saisonId: saisonActive!.id }),
    });
    window.location.reload();
  }

  return (
    <button type="button" onClick={revenir} className={primaire ? "btn btn-primary text-sm" : className}>
      Revenir a {saisonActive.nom} <ArrowRight size={12} aria-hidden />
    </button>
  );
}
