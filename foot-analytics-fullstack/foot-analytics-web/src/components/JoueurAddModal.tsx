"use client";
// src/components/JoueurAddModal.tsx
//
// Modale d'ajout d'un joueur a un effectif. Deux modes :
//   - "Existant" : recherche dans toute la base, autocomplete. Permet
//     de re-attacher un joueur d'une saison precedente sans le ressaisir
//     (utile au debut d'une nouvelle saison ou il rejoint l'equipe).
//   - "Nouveau" : formulaire libre. Tous les champs sont OPTIONNELS
//     sauf le nom. Pas de stats de match (matchs, buts, etc.) — elles
//     se construiront automatiquement avec les FMI futures.

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Modal } from "@/components/Modal";
import {
  Plus, Save, Search, User, UserPlus, X,
} from "lucide-react";

const POSTES = ["G", "DC", "DD", "DG", "MD", "MC", "MO", "AD", "AG", "BU"];
const PIEDS = ["", "Droit", "Gauche", "Mixte"];
const STATUTS_MUTATION = ["Pas mutation", "Mutation", "Mutation hors delai"];

interface JoueurExistant {
  id: string;
  nom: string;
  prenom?: string | null;
  licence?: string | null;
  poste?: string | null;
  clubId?: string | null;
  equipesAttachees?: string[] | null;
}

export function JoueurAddModal({
  equipeId, equipeNom, onClose, onSaved,
}: {
  equipeId: string;
  equipeNom?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"existant" | "nouveau">("existant");

  return (
    <Modal open={true} onClose={onClose} maxWidth="max-w-2xl">
      <div className="flex items-center gap-3 pb-4 mb-5 border-b border-line">
        <div className="w-10 h-10 rounded-lg bg-turf/15 grid place-items-center shrink-0">
          <UserPlus size={18} className="text-turf"/>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-lg font-bold text-ink leading-tight">
            Ajouter un joueur a l'effectif
          </h2>
          {equipeNom && (
            <p className="text-xs text-muted mt-0.5">Equipe : {equipeNom}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-md grid place-items-center hover:bg-line/40 text-faint hover:text-ink transition"
          title="Fermer"
        >
          <X size={15}/>
        </button>
      </div>

      {/* Toggle mode */}
      <div className="flex gap-1.5 mb-5">
        <button
          onClick={() => setMode("existant")}
          className={`flex-1 px-3 py-2 rounded-md text-xs font-semibold border transition flex items-center justify-center gap-1.5 ${
            mode === "existant"
              ? "bg-turf/15 border-turf/40 text-turf"
              : "border-line text-muted hover:bg-line/30"
          }`}
        >
          <Search size={12}/> Joueur existant
        </button>
        <button
          onClick={() => setMode("nouveau")}
          className={`flex-1 px-3 py-2 rounded-md text-xs font-semibold border transition flex items-center justify-center gap-1.5 ${
            mode === "nouveau"
              ? "bg-turf/15 border-turf/40 text-turf"
              : "border-line text-muted hover:bg-line/30"
          }`}
        >
          <UserPlus size={12}/> Nouveau joueur
        </button>
      </div>

      {mode === "existant" ? (
        <ExistantPanel equipeId={equipeId} onClose={onClose} onSaved={onSaved}/>
      ) : (
        <NouveauPanel equipeId={equipeId} onClose={onClose} onSaved={onSaved}/>
      )}
    </Modal>
  );
}

/* ---- Mode "Joueur existant" : recherche + attach ---- */

function ExistantPanel({
  equipeId, onClose, onSaved,
}: {
  equipeId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<JoueurExistant[]>([]);
  const [loading, setLoading] = useState(false);
  const [attaching, setAttaching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Debounce recherche
  useEffect(() => {
    setError(null);
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api.searchJoueurs(q.trim());
        setResults(r);
      } catch (e: any) {
        setError(e?.message ?? "Erreur de recherche");
      } finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function attach(j: JoueurExistant) {
    setAttaching(j.id); setError(null);
    try {
      await api.attachJoueur(equipeId, j.id);
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? "Echec de l'attachement");
      setAttaching(null);
    }
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-[10px] uppercase tracking-[0.18em] text-faint font-semibold">Rechercher</span>
        <input
          autoFocus
          className="inp mt-1"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tape le nom (2 caracteres minimum)..."
        />
        <p className="text-[10px] text-faint mt-1">
          La recherche cherche dans toute la base : joueurs de saisons
          precedentes, autres clubs si import croise...
        </p>
      </label>

      {error && (
        <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="max-h-[340px] overflow-y-auto panel-inset p-2">
        {q.trim().length < 2 ? (
          <p className="text-xs text-faint text-center py-6">
            Saisis au moins 2 caracteres pour rechercher.
          </p>
        ) : loading ? (
          <p className="text-xs text-faint text-center py-6">Recherche...</p>
        ) : results.length === 0 ? (
          <p className="text-xs text-faint text-center py-6">
            Aucun joueur trouve. Essaie "Nouveau joueur" ci-dessus pour le creer.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {results.map((j) => {
              const dejaDansCette = (j.equipesAttachees ?? []).includes(equipeId);
              return (
                <li key={j.id} className="flex items-center gap-3 py-2 px-1">
                  <div className="w-8 h-8 rounded-full bg-line/40 grid place-items-center text-faint">
                    <User size={14}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-ink truncate">
                      {j.prenom} {j.nom}
                    </div>
                    <div className="text-[10px] text-faint">
                      {j.licence ? `Licence ${j.licence}` : "Sans licence"}
                      {j.poste && ` · ${j.poste}`}
                    </div>
                  </div>
                  {dejaDansCette ? (
                    <span className="badge text-[10px]">Deja dans l'effectif</span>
                  ) : (
                    <button
                      onClick={() => attach(j)}
                      disabled={attaching === j.id}
                      className="btn btn-turf text-[10px]"
                    >
                      <Plus size={10}/> {attaching === j.id ? "..." : "Ajouter"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-4 mt-5 border-t border-line">
        <button className="btn" onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}

/* ---- Mode "Nouveau joueur" : formulaire libre ---- */

function NouveauPanel({
  equipeId, onClose, onSaved,
}: {
  equipeId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    prenom: "",
    nom: "",
    licence: "",
    dateNaissance: "",
    poste: "",
    numeroFavori: "",
    piedFort: "",
    tailleCm: "",
    poidsKg: "",
    statutMutation: "Pas mutation",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setError(null);
    if (!form.nom.trim()) { setError("Le nom est requis."); return; }
    setSaving(true);
    try {
      await api.createJoueurDansEquipe(equipeId, {
        nom: form.nom.trim(),
        prenom: form.prenom.trim() || null,
        licence: form.licence.trim() || null,
        dateNaissance: form.dateNaissance || null,
        poste: form.poste || null,
        numeroFavori: form.numeroFavori ? parseInt(form.numeroFavori, 10) : null,
        piedFort: form.piedFort || null,
        tailleCm: form.tailleCm ? parseInt(form.tailleCm, 10) : null,
        poidsKg: form.poidsKg ? parseInt(form.poidsKg, 10) : null,
        statutMutation: form.statutMutation,
      });
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? "Erreur lors de la creation");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Prenom">
          <input className="inp" value={form.prenom}
            onChange={(e) => set("prenom", e.target.value)}/>
        </Field>
        <Field label="Nom *">
          <input className="inp" value={form.nom} autoFocus
            onChange={(e) => set("nom", e.target.value)}/>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Licence FFF">
          <input className="inp" value={form.licence}
            onChange={(e) => set("licence", e.target.value)}
            placeholder="2570521234567"/>
        </Field>
        <Field label="Date de naissance">
          <input type="date" className="inp" value={form.dateNaissance}
            onChange={(e) => set("dateNaissance", e.target.value)}/>
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Poste">
          <select className="inp" value={form.poste}
            onChange={(e) => set("poste", e.target.value)}>
            <option value="">—</option>
            {POSTES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Numero">
          <input type="number" min={1} max={99} className="inp"
            value={form.numeroFavori}
            onChange={(e) => set("numeroFavori", e.target.value)}/>
        </Field>
        <Field label="Pied">
          <select className="inp" value={form.piedFort}
            onChange={(e) => set("piedFort", e.target.value)}>
            {PIEDS.map((p) => <option key={p} value={p}>{p || "—"}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Taille (cm)">
          <input type="number" min={140} max={220} className="inp"
            value={form.tailleCm}
            onChange={(e) => set("tailleCm", e.target.value)}/>
        </Field>
        <Field label="Poids (kg)">
          <input type="number" min={40} max={150} className="inp"
            value={form.poidsKg}
            onChange={(e) => set("poidsKg", e.target.value)}/>
        </Field>
        <Field label="Statut mutation">
          <select className="inp" value={form.statutMutation}
            onChange={(e) => set("statutMutation", e.target.value)}>
            {STATUTS_MUTATION.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </div>

      {error && (
        <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <p className="text-[10px] text-faint">
        Les stats de match (matchs, buts, cartons) ne sont pas demandees :
        elles seront calculees automatiquement quand des FMI seront importees.
      </p>

      <div className="flex justify-end gap-2 pt-4 mt-5 border-t border-line">
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn btn-turf" onClick={save} disabled={saving}>
          <Save size={14}/> {saving ? "Creation..." : "Creer et ajouter"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.18em] text-faint font-semibold">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
