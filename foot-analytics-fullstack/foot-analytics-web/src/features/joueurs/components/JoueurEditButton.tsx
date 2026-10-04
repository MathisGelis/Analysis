// src/features/joueurs/components/JoueurEditButton.tsx
"use client";

// Edition complete d'un joueur depuis sa fiche : poste, numero, statut
// (filtre selon "mon club"), morpho (taille/poids/pied). Note, forme et compteurs
// de matchs sont calcules par saison : ils ne s'editent pas ici.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Save, X } from "lucide-react";

import { api } from "@/shared/lib/api";
import { useOwnClubId } from "@/features/equipes/lib/own-club-context";
import { Modal } from "@/shared/ui/Modal";
import { DatePicker } from "@/shared/ui/DatePicker";
import { Select } from "@/shared/ui/Select";
import { optionsSimples } from "@/shared/lib/selecteur";
import type { Joueur } from "@/shared/lib/types";

const POSTES = ["GB", "DD", "DC", "DG", "MD", "MC", "MO", "AT", "AG", "AD", "MIL"];
const STATUTS_MINE = ["Pas mutation", "Mutation", "Mutation hors delai"];
const STATUTS_OTHERS = ["Non connu", "Pas mutation", "Mutation", "Mutation hors delai"];
const PIEDS = ["droit", "gauche", "ambidextre"];
const OPTIONS_POSTES = optionsSimples(POSTES);
const OPTIONS_PIEDS = [{ valeur: "", libelle: "—" }, ...optionsSimples(PIEDS)];

export function JoueurEditButton({ joueur }: { joueur: Joueur }) {
  const router = useRouter();
  const ownClubId = useOwnClubId();
  const isMine = joueur.clubId === ownClubId;

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    poste: joueur.poste ?? "MIL",
    numeroFavori: joueur.numeroFavori ?? undefined,
    statutMutation: joueur.statutMutation ?? (isMine ? "Pas mutation" : "Non connu"),
    commentaire: joueur.commentaire ?? "",
    tailleCm: joueur.tailleCm ?? undefined,
    poidsKg: joueur.poidsKg ?? undefined,
    piedFort: joueur.piedFort ?? undefined,
    dateNaissance: joueur.dateNaissance ?? "",
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setSaving(true); setError(null);
    try {
      // On envoie tous les champs renseignes (les undefined sont ignores
      // cote backend grace au DTO partiel).
      const payload: any = { ...form };
      // Si un champ est explicitement vide cote front, on le force a null
      // pour ne pas se voir refuse par les validators (ex: dateNaissance "").
      if (!payload.dateNaissance) delete payload.dateNaissance;
      if (!payload.piedFort) delete payload.piedFort;
      await api.updateJoueur(joueur.id, payload);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError("Echec : " + (e as Error).message);
      setSaving(false);
    }
  }

  const statuts = isMine ? STATUTS_MINE : STATUTS_OTHERS;

  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        <Pencil size={14} /> Modifier
      </button>

      {open && (
        <Modal open={open} onClose={() => setOpen(false)} maxWidth="max-w-2xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-bold text-ink">
              Modifier {joueur.prenom} {joueur.nom}
            </h2>
            <button className="btn text-xs" onClick={() => setOpen(false)}>
                <X size={14} />
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Poste">
                <Select valeur={form.poste} onChange={(v) => set("poste", v)} ariaLabel="Poste" options={OPTIONS_POSTES}/>
              </Field>
              <Field label="Numero">
                <input type="number" className="inp" value={form.numeroFavori ?? ""}
                  onChange={(e) => set("numeroFavori",
                    e.target.value ? +e.target.value : undefined)} />
              </Field>
              <Field label="Statut mutation">
                <Select valeur={form.statutMutation} onChange={(v) => set("statutMutation", v)} ariaLabel="Statut mutation"
                  options={optionsSimples(statuts)}/>
              </Field>

              <Field label="Date de naissance">
                <DatePicker naissance valeur={form.dateNaissance} onChange={(v) => set("dateNaissance", v)} ariaLabel="Date de naissance"/>
              </Field>

              <Field label="Taille (cm)">
                <input type="number" className="inp" value={form.tailleCm ?? ""}
                  onChange={(e) => set("tailleCm",
                    e.target.value ? +e.target.value : undefined)} />
              </Field>
              <Field label="Poids (kg)">
                <input type="number" className="inp" value={form.poidsKg ?? ""}
                  onChange={(e) => set("poidsKg",
                    e.target.value ? +e.target.value : undefined)} />
              </Field>
              <Field label="Pied fort">
                <Select valeur={form.piedFort ?? ""} onChange={(v) => set("piedFort", (v as any) || undefined)} ariaLabel="Pied fort"
                  options={OPTIONS_PIEDS}/>
              </Field>

              <div className="col-span-2 md:col-span-3">
                <Field label="Commentaire staff">
                  <input className="inp" value={form.commentaire}
                    onChange={(e) => set("commentaire", e.target.value)} />
                </Field>
              </div>
            </div>

            {error && <p className="text-danger text-xs mt-3">{error}</p>}

            <div className="flex justify-end gap-2 mt-5">
              <button className="btn" onClick={() => setOpen(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                <Save size={14} /> {saving ? "Enregistrement…" : "Enregistrer"}
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
