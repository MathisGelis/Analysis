"use client";
// src/components/SaisonGuard.tsx
//
// Encadre une page dont les ACTIONS n'ont de sens que sur la saison en
// cours ou a venir (/tactique, /calendrier). La LECTURE reste toujours
// possible : consulter la tactique d'un match passe ou le calendrier d'une
// ancienne saison est legitime.
//
//  - saison active ou a venir : la page s'affiche normalement (on peut
//    preparer la saison suivante) ;
//  - saison passee : la page s'affiche avec un bandeau "consultation
//    seule" et les enfants sont informes via useLectureSeule() pour
//    desactiver leurs boutons d'ajout / modification / suppression.

import { createContext, useContext, useEffect, useState } from "react";
import { useOwnEquipe } from "@/lib/own-equipe-context";
import { useOwnClubId } from "@/lib/own-club-context";
import { api } from "@/lib/api";
import { equipeEquivalente } from "@/lib/empreinte-equipe";
import { estLectureSeule, modeSaison } from "@/lib/saison-mode";
import type { Equipe, Saison } from "@/lib/types";
import { AlertCircle, ArrowRight, Info } from "lucide-react";

const LectureSeuleCtx = createContext(false);

/** True quand la saison consultee est une archive : masquer / desactiver les ecritures. */
export function useLectureSeule(): boolean {
  return useContext(LectureSeuleCtx);
}

export function SaisonGuard({
  children, libelle = "Cette page",
}: {
  children: React.ReactNode;
  libelle?: string;
}) {
  const { saisonId, equipeId, setEquipe } = useOwnEquipe();
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
  const saisonChoisie = saisons.find((x) => x.id === saisonId) ?? null;
  const mode = modeSaison(saisonChoisie, saisonActive);
  const lectureSeule = estLectureSeule(mode);

  async function revenirSaisonActive() {
    if (!saisonActive) return;
    // Equipe de MON club sur la saison active : l'equivalent de l'equipe
    // actuelle si elle existe, sinon la premiere.
    const courante = equipes.find((eq) => eq.id === equipeId) ?? null;
    const candidates = equipes.filter((eq) => eq.saisonId === saisonActive.id);
    const cible = (courante && candidates.find((eq) => equipeEquivalente(eq, courante)))
      ?? candidates[0] ?? null;
    setEquipe(cible?.id ?? null, saisonActive.id);
    await fetch("/api/own-equipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ equipeId: cible?.id ?? null, saisonId: saisonActive.id }),
    });
    window.location.reload();
  }

  return (
    <LectureSeuleCtx.Provider value={lectureSeule}>
      {mode === "passee" && saisonChoisie && (
        <div className="panel-inset p-3 mb-4 flex items-center gap-3 flex-wrap border-l-2 border-amber fade-up">
          <AlertCircle size={16} className="text-amber shrink-0"/>
          <p className="text-xs text-muted flex-1 min-w-[16rem]">
            <strong className="text-ink">{libelle}</strong> : saison{" "}
            <strong className="text-ink">{saisonChoisie.nom}</strong> archivee, en
            consultation seule. Les ajouts et modifications sont reserves a la
            saison en cours{saisonActive ? ` (${saisonActive.nom})` : ""}.
          </p>
          {saisonActive && (
            <button onClick={revenirSaisonActive} className="btn btn-ghost text-xs">
              Revenir a {saisonActive.nom} <ArrowRight size={12}/>
            </button>
          )}
        </div>
      )}
      {mode === "future" && saisonChoisie && (
        <div className="panel-inset p-3 mb-4 flex items-center gap-3 border-l-2 border-sky fade-up">
          <Info size={16} className="text-sky shrink-0"/>
          <p className="text-xs text-muted">
            Saison <strong className="text-ink">{saisonChoisie.nom}</strong> a venir :
            tu prepares la saison, les ajouts sont autorises.
          </p>
        </div>
      )}
      {children}
    </LectureSeuleCtx.Provider>
  );
}
