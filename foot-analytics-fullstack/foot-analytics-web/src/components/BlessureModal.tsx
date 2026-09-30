"use client";
// src/components/BlessureModal.tsx
//
// Formulaire d'ajout/edition d'une blessure. Champs :
// - Joueur (preselect ou liste)
// - Date debut
// - Date retour (optionnel — vide tant que blessure en cours)
// - Region (select des parties du corps, alignees sur CorpsHumain)
// - Details (textarea libre — "IRM prevu", "Reprise progressive"...)
//
// Le statut est derive automatiquement : si date de retour < aujourd'hui
// -> "Retabli", sinon "Indisponible".

import { useState, useEffect } from "react";
import { Modal } from "@/components/Modal";
import { api } from "@/lib/api";
import { Save, X } from "lucide-react";

// Regions du corps groupees pour le select. Aligne sur les zones
// reconnues par le composant CorpsHumain.
export const REGIONS = [
  { group: "Tete & tronc", items: [
    "Tete", "Cou", "Epaule gauche", "Epaule droite",
    "Torse", "Dos", "Cotes", "Abdomen",
  ]},
  { group: "Membre superieur", items: [
    "Bras gauche", "Bras droit", "Coude gauche", "Coude droit",
    "Poignet gauche", "Poignet droit", "Main gauche", "Main droite",
  ]},
  { group: "Hanches", items: [
    "Hanche gauche", "Hanche droite", "Bassin", "Aine",
  ]},
  { group: "Cuisse", items: [
    "Cuisse gauche", "Cuisse droite",
    "Ischio-jambier gauche", "Ischio-jambier droit",
    "Quadriceps gauche", "Quadriceps droit",
    "Adducteurs",
  ]},
  { group: "Genou", items: [
    "Genou gauche", "Genou droit",
    "Ligament croise gauche", "Ligament croise droit",
    "Menisque gauche", "Menisque droit",
  ]},
  { group: "Jambe", items: [
    "Mollet gauche", "Mollet droit",
    "Tibia gauche", "Tibia droit",
  ]},
  { group: "Cheville & pied", items: [
    "Cheville gauche", "Cheville droite",
    "Pied gauche", "Pied droit",
    "Talon gauche", "Talon droit",
  ]},
];

const STATUTS = ["Indisponible", "Reprise", "Retabli"];

interface JoueurLite {
  id: string;
  nom: string;
  prenom?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  blessure?: any;                 // si edit, sinon undefined = creation
  joueurs: JoueurLite[];
  joueurId?: string;              // pre-fixe si appele depuis fiche joueur
}

export function BlessureModal({ open, onClose, onSaved, blessure, joueurs, joueurId: lockedJoueurId }: Props) {
  const isEdit = !!blessure?.id;
  const today = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState<any>({
    joueurId: lockedJoueurId ?? blessure?.joueurId ?? "",
    localisation: blessure?.localisation ?? "",
    dateDebut: blessure?.dateDebut ?? today,
    retourEstime: blessure?.retourEstime ?? "",
    statut: blessure?.statut ?? "Indisponible",
    details: blessure?.details ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset si on rouvre la modale sur une nouvelle blessure.
  useEffect(() => {
    if (!open) return;
    setForm({
      joueurId: lockedJoueurId ?? blessure?.joueurId ?? "",
      localisation: blessure?.localisation ?? "",
      dateDebut: blessure?.dateDebut ?? today,
      retourEstime: blessure?.retourEstime ?? "",
      statut: blessure?.statut ?? "Indisponible",
      details: blessure?.details ?? "",
    });
    setError(null);
  }, [open, blessure, lockedJoueurId, today]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  // Synchronisation reciproque date retour <-> statut "Retabli".
  // - Si on saisit une date de retour : le statut passe a "Retabli"
  //   (la blessure est consideree terminee, peu importe quand).
  // - Si on selectionne le statut "Retabli" sans date de retour : on
  //   pose automatiquement la date du jour.
  // Les deux effets sont controles via setForm direct pour eviter les
  // boucles infinies d'effects qui se rappellent mutuellement.
  const onChangeDateRetour = (v: string) => {
    setForm((f: any) => ({
      ...f,
      retourEstime: v,
      // Si on saisit une date de retour, on passe en Retabli.
      // Si on l'efface, on revient en Indisponible.
      statut: v ? "Retabli" : (f.statut === "Retabli" ? "Indisponible" : f.statut),
    }));
  };
  const onChangeStatut = (v: string) => {
    setForm((f: any) => ({
      ...f,
      statut: v,
      // Statut "Retabli" sans date de retour ? on met aujourd'hui.
      retourEstime: v === "Retabli" && !f.retourEstime ? today : f.retourEstime,
    }));
  };

  const save = async () => {
    setError(null);
    if (!form.joueurId) { setError("Selectionne un joueur."); return; }
    if (!form.localisation) { setError("Selectionne une region."); return; }
    if (!form.dateDebut) { setError("Date de debut requise."); return; }

    const joueur = joueurs.find((j) => j.id === form.joueurId);
    const payload = {
      joueurId: form.joueurId,
      joueurNom: joueur ? `${joueur.prenom ?? ""} ${joueur.nom}`.trim() : undefined,
      localisation: form.localisation || undefined,
      dateDebut: form.dateDebut || undefined,
      retourEstime: form.retourEstime || undefined,
      statut: form.statut || undefined,
      details: form.details || undefined,
    };

    setSaving(true);
    try {
      if (isEdit) await api.updateBlessure(blessure.id, payload);
      else await api.createBlessure(payload);
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Erreur a la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="space-y-3 min-w-[28rem] max-w-[32rem]">
        <h2 className="font-display text-xl font-bold text-ink">
          {isEdit ? "Modifier la blessure" : "Ajouter une blessure"}
        </h2>
        {/* Joueur */}
        <Field label="Joueur">
          <select
            value={form.joueurId}
            onChange={(e) => set("joueurId", e.target.value)}
            disabled={!!lockedJoueurId}
            className="select-fm"
          >
            <option value="">— Selectionne —</option>
            {joueurs
              .slice()
              .sort((a, b) => `${a.prenom ?? ""} ${a.nom}`.localeCompare(`${b.prenom ?? ""} ${b.nom}`))
              .map((j) => (
                <option key={j.id} value={j.id}>
                  {j.prenom ?? ""} {j.nom}
                </option>
              ))}
          </select>
        </Field>

        {/* Region */}
        <Field label="Region">
          <select
            value={form.localisation}
            onChange={(e) => set("localisation", e.target.value)}
            className="select-fm"
          >
            <option value="">— Selectionne —</option>
            {REGIONS.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date debut">
            <input type="date"
              value={form.dateDebut}
              onChange={(e) => set("dateDebut", e.target.value)}
              className="select-fm"
            />
          </Field>
          <Field label="Date retour (si blessure terminee)">
            <input type="date"
              value={form.retourEstime}
              onChange={(e) => onChangeDateRetour(e.target.value)}
              className="select-fm"
              placeholder="—"
            />
          </Field>
        </div>

        {/* Statut */}
        <Field label="Statut">
          <select
            value={form.statut}
            onChange={(e) => onChangeStatut(e.target.value)}
            className="select-fm"
          >
            {STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>

        {/* Details */}
        <Field label="Details (notes, examen prevu...)">
          <textarea
            value={form.details}
            onChange={(e) => set("details", e.target.value)}
            placeholder="Ex : IRM prevu le 12/04, reprise course progressive..."
            rows={3}
            className="select-fm resize-none"
          />
        </Field>

        {error && (
          <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn text-xs flex items-center gap-1">
            <X size={11}/> Annuler
          </button>
          <button onClick={save} disabled={saving}
            className="btn btn-turf text-xs flex items-center gap-1">
            <Save size={11}/> {saving ? "Sauvegarde..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-faint">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
