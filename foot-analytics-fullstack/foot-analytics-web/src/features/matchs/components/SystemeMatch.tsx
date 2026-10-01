"use client";
// src/features/matchs/components/SystemeMatch.tsx
//
// Systeme de jeu (dispositif) d'un match, par cote. La feuille de match FMI n'en contient aucun : c'est une saisie
// du staff, qui alimente la prediction du systeme adverse (pre-match et page Predictions). Jusqu'a la saisie, on
// dit "non renseigne" plutot que d'afficher une valeur supposee.

import { useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "@/shared/lib/api";
import { FORMATIONS } from "@/features/tactique/lib/composition";
import { useFeedback } from "@/shared/lib/feedback-context";
import { Select } from "@/shared/ui/Select";
import { optionsSimples } from "@/shared/lib/selecteur";

const NON_RENSEIGNE = "";

export function SystemeMatch({
  matchId, cote, valeur, equipe,
}: { matchId: string; cote: "dom" | "ext"; valeur: string | null; equipe: string }) {
  const router = useRouter();
  const { notifier } = useFeedback();
  const [enCours, setEnCours] = useState(false);
  // Un dispositif deja saisi hors de la liste usuelle reste proposable.
  const formations = valeur && !(FORMATIONS as readonly string[]).includes(valeur) ? [...FORMATIONS, valeur] : [...FORMATIONS];
  const options = [{ valeur: NON_RENSEIGNE, libelle: "Non renseigne" }, ...optionsSimples(formations)];

  async function changer(nouvelle: string) {
    setEnCours(true);
    try {
      await api.updateMatch(matchId, { [cote === "dom" ? "formationDom" : "formationExt"]: nouvelle });
      notifier.succes(nouvelle ? `Systeme de ${equipe} : ${nouvelle}.` : `Systeme de ${equipe} efface.`);
      router.refresh();
    } catch (e) {
      notifier.erreur(`Enregistrement impossible : ${(e as Error).message}`);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="min-w-0 flex-1 truncate text-muted">{equipe}</span>
      <Select valeur={valeur ?? NON_RENSEIGNE} onChange={changer} disabled={enCours}
        className="btn !py-1 text-xs" ariaLabel={`Systeme de jeu de ${equipe}`} options={options} recherche={false}/>
    </label>
  );
}
