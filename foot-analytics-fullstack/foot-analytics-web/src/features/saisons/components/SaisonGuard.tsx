"use client";
// src/features/saisons/components/SaisonGuard.tsx
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
import { AlertCircle, Info } from "lucide-react";

import { useOwnEquipe } from "@/features/equipes/lib/own-equipe-context";
import { api } from "@/shared/lib/api";
import { estLectureSeule, modeSaison } from "@/features/saisons/lib/saison-mode";
import type { Saison } from "@/shared/lib/types";

import { BoutonSaisonEnCours } from "./BoutonSaisonEnCours";

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
  const { saisonId } = useOwnEquipe();
  const [saisons, setSaisons] = useState<Saison[]>([]);

  useEffect(() => {
    (async () => { setSaisons(await api.saisons()); })();
  }, []);

  const saisonActive = saisons.find((x) => x.actif) ?? null;
  const saisonChoisie = saisons.find((x) => x.id === saisonId) ?? null;
  const mode = modeSaison(saisonChoisie, saisonActive);
  const lectureSeule = estLectureSeule(mode);

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
          {saisonActive && <BoutonSaisonEnCours />}
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
