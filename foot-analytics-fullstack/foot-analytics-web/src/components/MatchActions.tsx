// src/components/MatchActions.tsx
"use client";

// Boutons Modifier / Supprimer affiches sur la fiche match.
// La modification est limitee aux champs simples (journee, date, scores, statut).
// Apres modif ou suppression, on rafraichit la route ou redirige vers /matchs.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, messageApi } from "@/lib/api";
import { Modal } from "@/components/Modal";
import { DatePicker } from "@/components/DatePicker";
import { Select } from "@/components/Select";
import type { Match } from "@/lib/types";
import { Pencil, Save, Trash2, X } from "lucide-react";
import { useFeedback } from "@/lib/feedback-context";

const STATUTS = [
  { valeur: "joue", libelle: "Joue" },
  { valeur: "prevu", libelle: "Prevu" },
  { valeur: "reporte", libelle: "Reporte" },
  { valeur: "annule", libelle: "Annule" },
];

export function MatchActions({ match }: { match: Match }) {
  const { notifier, confirmer } = useFeedback();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    journee: match.journee ?? "",
    date: match.date ?? "",
    heure: match.heure ?? "",
    competition: match.competition ?? "",
    poule: match.poule ?? "",
    terrain: match.terrain ?? "",
    scoreDom: match.scoreDom,
    scoreExt: match.scoreExt,
    statut: (match as any).statut ?? "joue",
    formationDom: (match as any).formationDom ?? "",
    formationExt: (match as any).formationExt ?? "",
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setSaving(true); setError(null);
    try {
      await api.updateMatch(match.id, form as any);
      await api.rebuildDerivation().catch(() => undefined);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError("Echec : " + messageApi(e));
      setSaving(false);
    }
  }

  async function remove() {
    if (!(await confirmer({
      titre: `Supprimer ce match ?`,
      message: `Journee ${match.journee}, score ${match.scoreDom}–${match.scoreExt}. Les compositions, evenements et liens arbitres seront aussi supprimes.`,
      danger: true,
    }))) return;
    try {
      await api.deleteMatch(match.id);
      await api.rebuildDerivation().catch(() => undefined);
      router.push("/matchs");
    } catch (e) {
      notifier.erreur("Suppression impossible : " + (e as Error).message);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button className="btn" onClick={() => setOpen(true)}>
          <Pencil size={13}/> Modifier
        </button>
        <button className="btn" onClick={remove}>
          <Trash2 size={13}/> Supprimer
        </button>
      </div>

      {open && (
        <Modal open={open} onClose={() => setOpen(false)} maxWidth="max-w-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-bold text-ink">Modifier le match</h2>
            <button className="btn text-xs" onClick={() => setOpen(false)}>
              <X size={14}/>
            </button>
          </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Journee">
                <input className="inp" value={form.journee}
                  onChange={(e) => set("journee", e.target.value)}/>
              </Field>
              <Field label="Date">
                <DatePicker valeur={form.date} onChange={(v) => set("date", v)} ariaLabel="Date" effacable={false}/>
              </Field>
              <Field label="Heure">
                <input className="inp" value={form.heure}
                  onChange={(e) => set("heure", e.target.value)}/>
              </Field>
              <Field label="Competition">
                <input className="inp" value={form.competition}
                  onChange={(e) => set("competition", e.target.value)}/>
              </Field>
              <Field label="Poule">
                <input className="inp" value={form.poule}
                  onChange={(e) => set("poule", e.target.value)}/>
              </Field>
              <Field label="Terrain">
                <input className="inp" value={form.terrain}
                  onChange={(e) => set("terrain", e.target.value)}/>
              </Field>
              <Field label="Score domicile">
                <input type="number" min={0} className="inp" value={form.scoreDom}
                  onChange={(e) => set("scoreDom", +e.target.value)}/>
              </Field>
              <Field label="Score exterieur">
                <input type="number" min={0} className="inp" value={form.scoreExt}
                  onChange={(e) => set("scoreExt", +e.target.value)}/>
              </Field>
              <Field label="Statut">
                <Select valeur={form.statut} onChange={(v) => set("statut", v)} ariaLabel="Statut" options={STATUTS}/>
              </Field>
              <Field label="Formation dom">
                <input className="inp" value={form.formationDom}
                  onChange={(e) => set("formationDom", e.target.value)}/>
              </Field>
              <Field label="Formation ext">
                <input className="inp" value={form.formationExt}
                  onChange={(e) => set("formationExt", e.target.value)}/>
              </Field>
            </div>

            {error && <p className="text-danger text-xs mt-3">{error}</p>}

            <div className="flex justify-end gap-2 mt-5">
              <button className="btn" onClick={() => setOpen(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                <Save size={14}/> {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
        </Modal>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="stat-label">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
