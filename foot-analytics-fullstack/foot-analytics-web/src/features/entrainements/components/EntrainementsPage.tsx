// src/features/entrainements/components/EntrainementsPage.tsx
"use client";

// Planning + presences. Effectif filtre sur l'EQUIPE PROPRE selectionnee
// dans la sidebar (pas tout le club). Charge calculee en UA-RPE (methode
// Foster) qui prend en compte duree, intensite, type, ET espace de jeu.

import { useEffect, useMemo, useState } from "react";
import {
  Calendar, Check, Clock, Dumbbell, MapPin, Maximize2,
  Pencil, Plus, Save, Trash2, Users, X,
} from "lucide-react";

import { api } from "@/shared/lib/api";
import { useOwnEquipe } from "@/features/equipes/lib/own-equipe-context";
import { useOwnClubId } from "@/features/equipes/lib/own-club-context";
import { Modal } from "@/shared/ui/Modal";
import { DatePicker } from "@/shared/ui/DatePicker";
import { Select } from "@/shared/ui/Select";
import { optionsSimples } from "@/shared/lib/selecteur";
import { Sparkline } from "@/shared/ui/Charts";
import { useFeedback } from "@/shared/lib/feedback-context";

const TYPES = ["Tactique","Physique","Technique","Recup","Activation","Pre-match"];

// Espaces de jeu, avec leur facteur de modulation de charge (juste pour
// l'affichage du libelle / preview cote front ; le backend fait le calcul
// reel via calcCharge).
const ESPACES = [
  { id: "terrain_entier", label: "Terrain entier",  facteur: 1.00 },
  { id: "demi_terrain",   label: "Demi-terrain",    facteur: 1.15 },
  { id: "quart_terrain",  label: "Quart de terrain",facteur: 1.30 },
  { id: "espace_reduit",  label: "Espace reduit",   facteur: 1.40 },
  { id: "salle",          label: "Salle",           facteur: 0.90 },
  { id: "autre",          label: "Autre",           facteur: 1.00 },
];
const FACTEURS_TYPE: Record<string, number> = {
  Physique: 1.20, "Pre-match": 1.00, Tactique: 0.85,
  Technique: 0.75, Activation: 0.40, Recup: 0.30,
};

function labelEspace(id?: string | null) {
  return ESPACES.find((e) => e.id === id)?.label ?? id ?? "";
}
function previewCharge(duree: number, intensite: number, type: string, espace: string): number {
  const fT = FACTEURS_TYPE[type] ?? 0.85;
  const fE = ESPACES.find((e) => e.id === espace)?.facteur ?? 1.00;
  return Math.round(duree * intensite * fT * fE);
}

interface JoueurLite {
  id: string; nom: string; prenom?: string; numeroFavori?: number | null;
  poste?: string | null;
}
interface Seance {
  id: string; date?: string; jour?: string; heure?: string; type?: string;
  theme?: string; dureeMin: number; intensite?: number; charge: number;
  terrain?: string; espace?: string;
  presents: number; total: number;
  joueursPresents?: string[];
  equipeId?: string;
}

export default function Entrainements() {
  const { notifier, confirmer } = useFeedback();
  const ownClubId = useOwnClubId();
  const { equipeId: ownEquipeId } = useOwnEquipe();
  const [seances, setSeances] = useState<Seance[]>([]);
  const [equipe, setEquipe] = useState<any | null>(null);
  const [effectif, setEffectif] = useState<JoueurLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Seance | null>(null);

  // Charge effectif filtre sur l'equipe propre.
  // - Si equipe propre selectionnee : charge son effectif et ses seances
  // - Sinon : etat vide. On ne fallback PAS sur equipes[0] (qui pourrait
  //   etre une equipe d'une autre saison — mixerait les donnees).
  useEffect(() => {
    (async () => {
      setLoading(true);
      const equipes = await api.equipes(ownClubId);
      let eq: any = null;
      if (ownEquipeId) eq = equipes.find((e: any) => e.id === ownEquipeId) ?? null;
      setEquipe(eq);
      if (eq) {
        const [eff, seancesData] = await Promise.all([
          api.effectifEquipe(eq.id),
          api.entrainements(eq.id),
        ]);
        // Une presence s'enregistre par identifiant de fiche : un joueur sans fiche ne peut pas etre
        // coche (et, sans identifiant, il partagerait sa case avec tous les autres joueurs sans fiche).
        setEffectif(eff.filter((j: any) => !!j.id));
        setSeances(seancesData);
      } else {
        setEffectif([]); setSeances([]);
      }
      setLoading(false);
    })();
  }, [ownClubId, ownEquipeId]);

  async function reload() {
    if (!equipe) return;
    setSeances(await api.entrainements(equipe.id));
  }
  async function onDelete(id: string) {
    if (!(await confirmer({ titre: "Supprimer cette seance ?", message: "Sa charge sort du calcul de fatigue des joueurs.", danger: true }))) return;
    try {
      await api.deleteEntrainement(id);
      await reload();
      notifier.succes("Seance supprimee.");
    } catch (e) {
      notifier.erreur("Suppression impossible : " + (e as Error).message);
    }
  }

  const chargeTotale = seances.reduce((s, x) => s + (x.charge ?? 0), 0);
  const chargeMoyenne = seances.length ? Math.round(chargeTotale / seances.length) : 0;

  return (
    <div className="space-y-6 fade-up">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="h-section">
            {equipe ? `${equipe.nom}${equipe.competitionLibelle ? ` · ${equipe.competitionLibelle}` : ""}` : "Aucune equipe"}
          </div>
          <h1 className="font-display text-2xl font-bold text-ink">Entrainements</h1>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setAdding(true)}
          disabled={!equipe || effectif.length === 0}
          title={!equipe ? "Aucune equipe selectionnee" : ""}
        >
          <Plus size={14}/> Nouvel entrainement
        </button>
      </header>

      {!loading && !equipe && (
        <section className="panel p-6 border-l-2 border-amber text-sm text-muted">
          Aucune equipe selectionnee. Choisis ton equipe dans le selecteur
          en bas de la sidebar.
        </section>
      )}

      {equipe && (
        <>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Seances" value={seances.length} icon={<Calendar size={14}/>}/>
            <Kpi label="Effectif" value={effectif.length} icon={<Users size={14}/>}/>
            <Kpi label="Charge totale" value={Math.round(chargeTotale)} suffix="UA-RPE" icon={<Dumbbell size={14}/>}/>
            <Kpi label="Charge moyenne / seance" value={chargeMoyenne} suffix="UA-RPE" icon={<Dumbbell size={14}/>}/>
          </section>

          <section>
            {loading ? (
              <p className="text-muted text-sm">Chargement…</p>
            ) : seances.length === 0 ? (
              <p className="text-muted text-sm py-6 text-center">
                Aucune seance enregistree pour cette equipe.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {seances.map((s) => (
                  <div key={s.id} className="panel-inset p-4 flex flex-col gap-2 relative group">
                    <div className="flex items-center justify-between">
                      <div className="font-display font-bold text-ink">
                        {s.jour ?? ""} <span className="text-muted font-light">{s.date}</span>
                      </div>
                      <span className={`badge ${
                        s.type === "Physique" ? "badge-danger"
                        : s.type === "Tactique" ? "badge-accent"
                        : s.type === "Pre-match" ? "badge-amber" : ""}`}>{s.type}</span>
                    </div>
                    <div className="text-sm text-ink font-semibold">{s.theme}</div>
                    <div className="text-[11px] text-muted flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1"><Clock size={10}/>{s.heure ?? "—"} · {s.dureeMin}'</span>
                      {s.terrain && <span className="flex items-center gap-1"><MapPin size={10}/>{s.terrain}</span>}
                      {s.espace && <span className="flex items-center gap-1"><Maximize2 size={10}/>{labelEspace(s.espace)}</span>}
                    </div>
                    <div className="flex items-center gap-4 mt-1">
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-[10px] text-faint uppercase tracking-wider">
                          <span>Charge</span><span>{Math.round(s.charge)} UA-RPE</span>
                        </div>
                        <div className="w-full bg-line h-1.5 rounded-full overflow-hidden mt-1">
                          <div className="h-full bg-amber" style={{ width: `${Math.min(s.charge/10, 100)}%` }}/>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-faint uppercase tracking-wider">Presents</div>
                        <div className="text-sm font-display font-bold">{s.presents}<span className="text-muted">/{s.total}</span></div>
                      </div>
                    </div>
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button className="btn text-[10px]" onClick={() => setEditing(s)} title="Modifier">
                        <Pencil size={10}/>
                      </button>
                      <button className="btn text-[10px] text-danger" onClick={() => onDelete(s.id)} title="Supprimer">
                        <Trash2 size={10}/>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel p-5">
            <div className="h-section mb-3">Charge par seance (UA-RPE)</div>
            <Sparkline values={seances.map((s) => s.charge)} width={620} height={120} color="rgb(var(--amber))"/>
            <p className="text-[11px] text-faint mt-2">
              Charge calculee via la methode session-RPE (Foster) :
              <span className="text-ink"> duree x intensite x facteur_type x facteur_espace</span>.
              Reference match officiel ~700-900 UA-RPE.
            </p>
          </section>
        </>
      )}

      {adding && equipe && (
        <SeanceForm
          equipeId={equipe.id}
          effectif={effectif}
          onClose={() => setAdding(false)}
          onSaved={async () => { setAdding(false); await reload(); }}
        />
      )}
      {editing && equipe && (
        <SeanceForm
          equipeId={equipe.id}
          effectif={effectif}
          seance={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await reload(); }}
        />
      )}
    </div>
  );
}

/* ---- formulaire add/edit ---- */
function SeanceForm({
  equipeId, effectif, seance, onClose, onSaved,
}: {
  equipeId: string;
  effectif: JoueurLite[];
  seance?: Seance;     // si defini -> mode edit
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!seance?.id;
  const [form, setForm] = useState({
    equipeId,
    date: seance?.date ?? "",
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
          <DatePicker valeur={form.date} onChange={(v)=>set("date", v)} ariaLabel="Date" effacable={false}/>
        </Field>
        <Field label="Jour (libelle)">
          <input className="inp" value={form.jour}
            placeholder="Mar." onChange={(e)=>set("jour", e.target.value)}/>
        </Field>
        <Field label="Heure">
          <input className="inp" value={form.heure}
            onChange={(e)=>set("heure", e.target.value)}/>
        </Field>
        <Field label="Type">
          <Select valeur={form.type} onChange={(v)=>set("type", v)} ariaLabel="Type" options={optionsSimples(TYPES)}/>
        </Field>
        <Field label="Espace">
          <Select valeur={form.espace} onChange={(v)=>set("espace", v)} ariaLabel="Espace"
            options={ESPACES.map((e) => ({ valeur: e.id, libelle: e.label }))}/>
        </Field>
        <Field label="Terrain">
          <input className="inp" value={form.terrain}
            onChange={(e)=>set("terrain", e.target.value)}/>
        </Field>
        <Field label="Theme">
          <input className="inp" value={form.theme}
            placeholder="Sortie de balle / pressing" onChange={(e)=>set("theme", e.target.value)}/>
        </Field>
        <Field label="Duree (min)">
          <input type="number" className="inp" value={form.dureeMin}
            onChange={(e)=>set("dureeMin", +e.target.value)}/>
        </Field>
        <Field label="Intensite (RPE / 10)">
          <input type="number" min={1} max={10} className="inp" value={form.intensite}
            onChange={(e)=>set("intensite", +e.target.value)}/>
        </Field>
        <Field label="Charge (auto)">
          <div className="inp bg-panel text-amber font-mono">{chargePreview} UA-RPE</div>
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
            <span className="badge badge-accent">{presents.size} / {effectif.length}</span>
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
                <label
                  key={j.id}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer ${
                    checked ? "bg-accent/10 text-ink" : "text-muted hover:bg-line/40"
                  }`}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggle(j.id)} />
                  <span className="font-mono text-xs w-6 text-right text-faint">
                    {j.numeroFavori ?? "—"}
                  </span>
                  <span className="flex-1 truncate">{j.prenom} {j.nom}</span>
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
          <Save size={14}/> {saving ? "Enregistrement…" : (isEdit ? "Enregistrer" : "Creer la seance")}
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
function Kpi({ label, value, suffix, icon }:{label:string;value:string|number;suffix?:string;icon?:React.ReactNode}) {
  return (
    <div className="stat-tile">
      <div className="flex items-center justify-between">
        <span className="stat-label">{label}</span>
        <span className="text-faint">{icon}</span>
      </div>
      <div className="stat-value tabular-nums">{value}</div>
      {suffix && <div className="stat-suffix">{suffix}</div>}
    </div>
  );
}
