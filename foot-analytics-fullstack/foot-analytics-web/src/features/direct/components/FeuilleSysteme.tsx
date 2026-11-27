"use client";

// src/features/direct/components/FeuilleSysteme.tsx
//
// Changer de systeme en cours de match : on choisit le nouveau dispositif, les joueurs sont replaces automatiquement (sans l'expulse), on peut
// echanger deux joueurs en les touchant l'un apres l'autre. Le changement est date a la minute : chaque tir, but et occasion est ensuite
// rattache au systeme en vigueur (voir le Data Hub : les dispositifs se repartissent au prorata des minutes).

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";

import { formationsProposees } from "@/features/tactique/lib/composition";
import { libelleFormation } from "@/shared/lib/formation";
import { Modal } from "@/shared/ui/Modal";

import { repartirDansSysteme, type EtatCompo, type SlotCompo } from "../lib/compo-direct";
import { libelleMinute } from "../lib/chrono";
import { TerrainCompo } from "./TerrainCompo";

export function FeuilleSysteme({
  compo, periode, minute, dureePeriodeMin, formationInitiale, correction, onValider, onFermer, onSupprimer,
}: {
  /** La compo juste avant le changement. */
  compo: EtatCompo; periode: number; minute: number; dureePeriodeMin: number;
  /** En correction : le dispositif deja saisi. */
  formationInitiale?: string | null; correction: boolean;
  onValider: (formation: string, ordreIds: string[]) => void; onFermer: () => void; onSupprimer?: () => void;
}) {
  const [formation, setFormation] = useState(formationInitiale ?? compo.formation);
  const [slots, setSlots] = useState<SlotCompo[]>(() => repartirDansSysteme(compo.slots, formationInitiale ?? compo.formation));
  const [choisi, setChoisi] = useState<number | null>(null);
  const minuteTexte = `${libelleMinute(minute, periode, dureePeriodeMin)}'`;
  const dispositifs = useMemo(() => formationsProposees(compo.formation), [compo.formation]);

  const choisirFormation = (f: string) => { setFormation(f); setSlots(repartirDansSysteme(compo.slots, f)); setChoisi(null); };
  // Deux touches : le premier joueur est marque, le second prend sa place (et inversement). Un poste vide peut recevoir un joueur.
  const toucher = (i: number) => {
    if (choisi === null) { setChoisi(i); return; }
    if (choisi !== i) setSlots((l) => l.map((s, k) => (k === choisi ? l[i] : k === i ? l[choisi] : s)));
    setChoisi(null);
  };
  const depart = useMemo(() => repartirDansSysteme(compo.slots, compo.formation), [compo.slots, compo.formation]);
  const deplaces = useMemo(() => new Set(slots.flatMap((s, i) => (s.joueur && depart[i]?.joueur?.id !== s.joueur.id ? [i] : []))), [slots, depart]);
  const inchange = formation === compo.formation && deplaces.size === 0 && !correction;

  return (
    <Modal open onClose={onFermer} maxWidth="max-w-md" titre="Changement de système">
      <div className="space-y-4">
        <header>
          <h2 className="font-display text-lg font-bold text-ink">Changement de système</h2>
          <div className="text-xs text-muted">{minuteTexte} · {periode === 1 ? "1re" : "2e"} période · actuel : {libelleFormation(compo.formation)}</div>
        </header>

        <div>
          <div className="mb-2 text-sm font-semibold text-ink">1 · Nouveau système</div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Nouveau système">
            {dispositifs.map((f) => (
              <button key={f} type="button" aria-pressed={formation === f} onClick={() => choisirFormation(f)}
                className={`btn !h-11 !rounded-full !px-3.5 text-sm font-bold ${formation === f ? "!border-accent bg-accent/15 text-accent" : ""}`}>
                {libelleFormation(f)}{f === compo.formation ? " · actuel" : ""}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-semibold text-ink">2 · Nouveaux postes</div>
          <TerrainCompo formation={formation} slots={slots} choisiIndex={choisi} etiquette="Échange" ton="sky" deplaces={deplaces}
            inactifs={() => false} onChoisir={(i) => toucher(i)} titre="Postes dans le nouveau système" />
          <p className="mt-2 text-xs text-muted">Les joueurs sont replacés automatiquement ; touche deux joueurs pour échanger leurs postes. Les joueurs cerclés de bleu ont changé de poste.</p>
        </div>

        <div className="panel-inset border-l-2 border-sky p-3">
          <div className="text-[13px] font-bold text-ink">Dans les stats</div>
          <p className="text-[13px] text-muted">Le système change à la {minuteTexte} : chaque tir, but et occasion est rattaché au système en vigueur à sa minute. Le Data Hub répartit les dispositifs au prorata des minutes jouées.</p>
        </div>

        <footer className="space-y-2 border-t border-line pt-3">
          {correction && onSupprimer && <button type="button" onClick={onSupprimer} className="btn w-full !border-danger/50 text-danger"><Trash2 size={15} aria-hidden /> Supprimer ce changement</button>}
          <button type="button" disabled={inchange} onClick={() => onValider(formation, slots.map((s) => s.joueur?.id ?? ""))} className="btn btn-primary !h-13 w-full text-base disabled:opacity-50">
            {correction ? "Enregistrer" : `Valider ${libelleFormation(formation)} · ${minuteTexte}`}
          </button>
        </footer>
      </div>
    </Modal>
  );
}
