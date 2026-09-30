"use client";
// src/components/SeanceModal.tsx
//
// Modale unique de creation / edition d'une seance d'entrainement.
// Utilisee a la fois par /entrainements (liste + edition) et par
// /calendrier (creation in-place). Garder un seul composant assure
// que les deux pages restent toujours synchronisees (champs, UX,
// preview de charge, selection des presents...).

import { useState } from "react";
import { Check, Save, Users, X } from "lucide-react";
import { Modal } from "@/components/Modal";
import { TimePicker24 } from "@/components/TimePicker24";
import { api } from "@/lib/api";

export const TYPES = [
  "Tactique", "Physique", "Technique", "Recup", "Activation", "Pre-match",
];

// Espaces de jeu, avec leur facteur de modulation de charge (juste pour
// l'affichage du libelle / preview cote front ; le backend fait le calcul
// reel via calcCharge).
export const ESPACES = [
  { id: "terrain_entier", label: "Terrain entier",   facteur: 1.00 },
  { id: "demi_terrain",   label: "Demi-terrain",     facteur: 1.15 },
  { id: "quart_terrain",  label: "Quart de terrain", facteur: 1.30 },
  { id: "espace_reduit",  label: "Espace reduit",    facteur: 1.40 },
  { id: "salle",          label: "Salle",            facteur: 0.90 },
  { id: "autre",          label: "Autre",            facteur: 1.00 },
];
export const FACTEURS_TYPE: Record<string, number> = {
  Physique: 1.20, "Pre-match": 1.00, Tactique: 0.85,
  Technique: 0.75, Activation: 0.40, Recup: 0.30,
};

export function labelEspace(id?: string | null) {
  return ESPACES.find((e) => e.id === id)?.label ?? id ?? "";
}
export function previewCharge(
  duree: number, intensite: number, type: string, espace: string,
): number {
  const fT = FACTEURS_TYPE[type] ?? 0.85;
  const fE = ESPACES.find((e) => e.id === espace)?.facteur ?? 1.00;
  return Math.round(duree * intensite * fT * fE);
}

export interface JoueurLite {
  id: string; nom: string; prenom?: string;
  numeroFavori?: number | null;
  poste?: string | null;
}
export interface Seance {
  id: string;
  date?: string; jour?: string; heure?: string;
  type?: string; theme?: string;
  dureeMin: number; intensite?: number; charge: number;
  terrain?: string; espace?: string;
  presents: number; total: number;
  joueursPresents?: string[];
}

export function SeanceModal({
  equipeId, effectif, seance, defaultDate, onClose, onSaved,
}: {
  equipeId: string;
  effectif: JoueurLite[];
  seance?: Seance;       // si defini -> mode edit
  defaultDate?: string;  // pre-remplit la date (creation depuis calendrier)
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!seance?.id;
  const [form, setForm] = useState({
    equipeId,
    date: seance?.date ?? defaultDate ?? "",
    jour: seance?.jour ?? "",
    heure: seance?.heure ?? "19:30",
    type: seance?.type ?? "Tactique",
    theme: seance?.theme ?? "",
    dureeMin: seance?.dureeMin ?? 90,
    intensite: seance?.intensite ?? 6,
    terrain: seance?.terrain ?? "Honneur",
    espace: seance?.espace ?? "terrain_entier",
  });
  const [presents, setPresents] = useState<Set<string>>(
    () => new Set(seance?.joueursPresents ?? effectif.map((j) => j.id)),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function toggle(id: string) {
    setPresents((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function tousPresents() { setPresents(new Set(effectif.map((j) => j.id))); }
  function aucunPresent() { setPresents(new Set()); }

  async function save() {
    setSaving(true); setError(null);
    try {
      const payload = {
        ...form,
        joueursPresents: [...presents],
        total: effectif.length,
      };
      if (isEdit) {
        await api.updateEntrainement(seance!.id, payload);
      } else {
        await api.createEntrainement(payload);
      }
      onSaved();
    } catch (e) {
      setError("Echec : backend injoignable. " + (e as Error).message);
      setSaving(false);
    }
  }

  const chargePreview = previewCharge(
    form.dureeMin, form.intensite, form.type, form.espace,
  );
  const sortedEffectif = [...effectif].sort((a, b) =>
    (a.numeroFavori ?? 99) - (b.numeroFavori ?? 99),
  );

  return (
    <Modal open={true} onClose={onClose} maxWidth="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xl font-bold text-ink">
          {isEdit ? "Modifier la seance" : "Nouvel entrainement"}
        </h2>
        <button className="btn text-xs" onClick={onClose}><X size={14}/></button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Field label="Date">
          <input type="date" className="inp" value={form.date}
            onChange={(e) => set("date", e.target.value)}/>
        </Field>
        <Field label="Jour (libelle)">
          <input className="inp" value={form.jour}
            placeholder="Mar." onChange={(e) => set("jour", e.target.value)}/>
        </Field>
        <Field label="Heure">
          <TimePicker24 value={form.heure} onChange={(v) => set("heure", v)}/>
        </Field>
        <Field label="Type">
          <select className="inp" value={form.type}
            onChange={(e) => set("type", e.target.value)}>
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Espace">
          <select className="inp" value={form.espace}
            onChange={(e) => set("espace", e.target.value)}>
            {ESPACES.map((e) => (
              <option key={e.id} value={e.id}>{e.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Terrain">
          <input className="inp" value={form.terrain}
            onChange={(e) => set("terrain", e.target.value)}/>
        </Field>
        <Field label="Theme">
          <input className="inp" value={form.theme}
            placeholder="Sortie de balle / pressing"
            onChange={(e) => set("theme", e.target.value)}/>
        </Field>
        <Field label="Duree (min)">
          <input type="number" className="inp" value={form.dureeMin}
            onChange={(e) => set("dureeMin", +e.target.value)}/>
        </Field>
        <Field label="Intensite (RPE / 10)">
          <input type="number" min={1} max={10} className="inp"
            value={form.intensite}
            onChange={(e) => set("intensite", +e.target.value)}/>
        </Field>
        <Field label="Charge (auto)">
          <div className="inp bg-panel text-amber font-mono">
            {chargePreview} UA-RPE
          </div>
        </Field>
      </div>
      <p className="text-[10px] text-faint mt-1">
        Charge calculee live : duree x RPE x facteur_type ({(FACTEURS_TYPE[form.type] ?? 0.85).toFixed(2)})
        x facteur_espace ({(ESPACES.find((e) => e.id === form.espace)?.facteur ?? 1.00).toFixed(2)}).
      </p>

      {/* selection joueurs presents */}
      <div className="mt-5 panel-inset p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-accent"/>
            <span className="font-display font-bold text-ink text-sm">
              Joueurs presents
            </span>
            <span className="badge badge-accent">
              {presents.size} / {effectif.length}
            </span>
          </div>
          <div className="flex gap-2">
            <button className="btn text-xs" onClick={tousPresents}>
              <Check size={11}/> Tous
            </button>
            <button className="btn text-xs" onClick={aucunPresent}>
              <X size={11}/> Aucun
            </button>
          </div>
        </div>
        {effectif.length === 0 ? (
          <p className="text-xs text-muted py-3 text-center">
            Aucun joueur dans l'effectif de cette equipe. Importe une FMI.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-1 max-h-[280px] overflow-auto">
            {sortedEffectif.map((j) => {
              const checked = presents.has(j.id);
              return (
                <label key={j.id}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer ${
                    checked ? "bg-accent/10 text-ink" : "text-muted hover:bg-line/40"
                  }`}>
                  <input type="checkbox" checked={checked}
                    onChange={() => toggle(j.id)}/>
                  <span className="font-mono text-xs w-6 text-right text-faint">
                    {j.numeroFavori ?? "—"}
                  </span>
                  <span className="flex-1 truncate">
                    {j.prenom} {j.nom}
                  </span>
                  <span className="badge text-[9px] !px-1.5 !py-0">{j.poste}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {error && <p className="text-danger text-xs mt-3">{error}</p>}

      <div className="flex justify-end gap-2 mt-5">
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          <Save size={14}/>
          {saving ? "Enregistrement…" : (isEdit ? "Enregistrer" : "Creer la seance")}
        </button>
      </div>
    </Modal>
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
