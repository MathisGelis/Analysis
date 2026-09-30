// src/app/effectif/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useOwnClubId } from "@/lib/own-club-context";
import { useOwnEquipe } from "@/lib/own-equipe-context";
import { Modal } from "@/components/Modal";
import { JoueurAddModal } from "@/components/JoueurAddModal";
import type { Joueur } from "@/lib/types";
import { Pencil, Plus, Save, Search, Trash2, X } from "lucide-react";
import { debug } from "@/lib/debug";
import { postesCompacts } from "@/lib/postes";
import { FatigueBar } from "@/components/FatigueBar";
import { classeBadgeMutation, STATUTS_MUTATION } from "@/lib/mutations";
import { useFeedback } from "@/lib/feedback-context";

const POSTES = ["TOUS","GB","DD","DC","DG","MD","MO","AT","AG","MIL"];

export default function EffectifPage() {
  const { notifier, confirmer } = useFeedback();
  const CLUB_PROPRE_ID = useOwnClubId();
  const { equipeId } = useOwnEquipe();   // <- equipe selectionnee globalement
  const router = useRouter();
  const [joueurs, setJoueurs] = useState<Joueur[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [posteFilter, setPosteFilter] = useState("TOUS");
  const [sort, setSort] = useState<"matchs"|"fatigue"|"discipline"|"nom">("matchs");
  const [edit, setEdit] = useState<Joueur | null>(null);
  const [creating, setCreating] = useState(false);
  // Nom de l'equipe selectionnee (pour l'afficher dans le header de la
  // modale d'ajout). On le derive en chargeant la liste des equipes.
  const [equipeNom, setEquipeNom] = useState<string>("");

  // Charge l'effectif filtre sur l'equipe propre selectionnee. Si aucune
  // n'est selectionnee (pas de cookie encore), on retombe sur l'effectif
  // global du club.
  const reload = useCallback(async () => {
    setLoading(true);
    if (equipeId) {
      debug("[effectif] reload equipe", equipeId);
      try {
        const data = await api.effectifEquipe(equipeId);
        debug("[effectif] effectif recu", data.length, "joueurs");
        try {
          const equipes = await api.equipes();
          const eq = equipes.find((e: any) => e.id === equipeId);
          setEquipeNom(eq?.nom ?? "");
        } catch { /* facultatif, pas critique */ }
        setJoueurs(data);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[effectif] erreur reload", err);
        setJoueurs([]);
      }
    } else {
      // Pas d'equipe -> etat vide (pas de fallback global au club qui
      // melangerait toutes les saisons)
      setJoueurs([]);
      setEquipeNom("");
    }
    setLoading(false);
  }, [equipeId]);
  useEffect(() => { reload(); }, [reload, CLUB_PROPRE_ID]);

  const data = useMemo(() => {
    let r = [...joueurs];
    if (q) {
      const t = q.toLowerCase();
      r = r.filter((j) =>
        j.nom.toLowerCase().includes(t) || (j.prenom ?? "").toLowerCase().includes(t));
    }
    if (posteFilter !== "TOUS") r = r.filter((j) => j.poste === posteFilter);
    r.sort((a, b) => {
      if (sort === "matchs") return b.matchs - a.matchs;
      // Les plus fatigues d'abord ; sans score (pas de charge recente connue) en dernier.
      if (sort === "fatigue") return (b.scoreFatigue ?? -1) - (a.scoreFatigue ?? -1);
      if (sort === "discipline")
        return (b.cartonsJaunes + b.cartonsRouges*3) - (a.cartonsJaunes + a.cartonsRouges*3);
      return a.nom.localeCompare(b.nom);
    });
    return r;
  }, [joueurs, q, posteFilter, sort]);

  async function handleDelete(j: Joueur) {
    if (!(await confirmer({
      titre: `Supprimer ${j.prenom} ${j.nom} ?`,
      message: "Le joueur est supprime de la base, toutes saisons confondues (ses stats de match restent dans les feuilles).",
      danger: true,
    }))) return;
    try {
      await api.deleteJoueur(j.id);
      await reload();
      notifier.succes(`${j.prenom} ${j.nom} supprime.`);
    } catch (e) {
      notifier.erreur("Suppression impossible : le backend est-il demarre ? " + (e as Error).message);
    }
  }

  // Maj rapide des buts / passes : mise a jour optimiste puis PUT ; la saisie
  // est enregistree pour l'equipe (donc la saison) affichee, jamais sur le
  // compteur global du joueur. En cas d'echec on remet l'ancienne valeur.
  async function patchStat(id: string, patch: { buts?: number; passesDecisives?: number }) {
    const prev = joueurs.find((x) => x.id === id);
    if (!prev || !equipeId) return;
    setJoueurs((arr) =>
      arr.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    );
    try {
      await api.definirStatEquipe(id, equipeId, patch);
    } catch (e) {
      setJoueurs((arr) => arr.map((x) => (x.id === id ? prev : x)));
      notifier.erreur("Sauvegarde impossible : " + (e as Error).message);
    }
  }

  return (
    <div className="space-y-6 fade-up">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="h-section">{equipeNom || "Aucune equipe selectionnee"}</div>
          <h1 className="font-display text-2xl font-bold text-ink">
            Effectif <span className="text-muted font-light">({data.length})</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-line bg-panel">
            <Search size={13} className="text-faint"/>
            <input
              value={q} onChange={(e)=>setQ(e.target.value)}
              placeholder="Filtrer par nom"
              className="bg-transparent outline-none text-sm w-44 placeholder:text-faint"
            />
          </div>
          <select value={posteFilter} onChange={(e)=>setPosteFilter(e.target.value)} className="btn">
            {POSTES.map(p=><option key={p} value={p}>{p}</option>)}
          </select>
          <select value={sort} onChange={(e)=>setSort(e.target.value as any)} className="btn">
            <option value="matchs">Tri · Matchs</option>
            <option value="fatigue">Tri · Fatigue</option>
            <option value="discipline">Tri · Discipline</option>
            <option value="nom">Tri · Nom</option>
          </select>
          <button className="btn btn-primary" onClick={()=>setCreating(true)}>
            <Plus size={14}/> Ajouter
          </button>
        </div>
      </header>

      <section className="panel p-5">
        {loading ? (
          <div className="text-sm text-muted py-8 text-center">Chargement de l'effectif…</div>
        ) : (
        <table className="table-fm table-dense">
          <thead>
            <tr>
              <th>Joueur</th><th>Poste</th>
              <th className="text-center">Mat.</th><th className="hidden text-center min-[1100px]:table-cell">Titu</th>
              <th className="hidden min-[1280px]:table-cell">Minutes</th>
              <th className="hidden min-[1440px]:table-cell">Note</th>
              <th className="hidden lg:table-cell">Fatigue</th>
              <th className="text-center" title="Buts">B</th>
              <th className="text-center" title="Passes decisives">PD</th>
              <th>CJ</th><th>CR</th>
              <th className="hidden min-[1440px]:table-cell">Statut</th>
              <th className="hidden 2xl:table-cell">Postes joues</th>
              <th className="col-fixe text-right"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {data.map((j)=>(
              <tr key={j.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-panel3 font-display text-sm font-bold text-muted"
                      title="Numero le plus porte cette saison">{j.numeroFavori ?? "—"}</span>
                    <div className="min-w-0 max-w-[13rem]">
                      <Link href={`/joueur/${j.id}`} className="font-semibold leading-snug text-ink transition-colors hover:text-accent">
                        {j.prenom} {j.nom}
                      </Link>
                      {j.typeDiscipline && (
                        <div className="mt-0.5"><span className="badge badge-danger !px-1.5 !py-0 !text-[10px]">{j.typeDiscipline}</span></div>
                      )}
                    </div>
                  </div>
                </td>
                <td><span className="badge">{j.poste}</span></td>
                <td className="text-center tabular-nums">{j.matchs}</td>
                <td className="hidden text-center tabular-nums min-[1100px]:table-cell">{j.titularisations}</td>
                <td className="hidden tabular-nums text-muted min-[1280px]:table-cell">{j.minutes}'</td>
                <td className="hidden font-semibold text-accent tabular-nums min-[1440px]:table-cell">{j.noteMoyenne?.toFixed(1)}</td>
                <td className="hidden lg:table-cell">
                  <FatigueBar score={j.scoreFatigue} detail={j.fatigueDetail} />
                </td>
                <td className="text-center">
                  <Stepper
                    value={j.buts ?? 0}
                    onChange={(v) => patchStat(j.id, { buts: v })}
                    color="accent"
                  />
                </td>
                <td className="text-center">
                  <Stepper
                    value={j.passesDecisives ?? 0}
                    onChange={(v) => patchStat(j.id, { passesDecisives: v })}
                    color="sky"
                  />
                </td>
                <td className="text-amber font-mono">{j.cartonsJaunes || ""}</td>
                <td className="text-danger font-mono">{j.cartonsRouges || ""}</td>
                <td className="hidden min-[1440px]:table-cell">
                  <span className={`badge ${classeBadgeMutation(j.statutMutation)}`}>{j.statutMutation}</span>
                </td>
                <td className="hidden whitespace-nowrap font-mono text-[11px] text-muted 2xl:table-cell" title={j.postes ?? undefined}>
                  {(() => {
                    const { visibles, restants } = postesCompacts(j.postes);
                    return visibles.length === 0 ? <span className="text-faint">—</span> : (
                      <>{visibles.join(" · ")}{restants > 0 && <span className="ml-1 text-faint">+{restants}</span>}</>
                    );
                  })()}
                </td>
                <td className="col-fixe">
                  <div className="flex items-center gap-1 justify-end">
                    <button className="btn !p-2" onClick={()=>setEdit(j)}
                      aria-label={`Modifier ${j.prenom} ${j.nom}`} title="Modifier">
                      <Pencil size={13}/>
                    </button>
                    <button className="btn !p-2 hover:!border-danger/50 hover:!text-danger" onClick={()=>handleDelete(j)}
                      aria-label={`Supprimer ${j.prenom} ${j.nom}`} title="Supprimer">
                      <Trash2 size={13}/>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </section>

      {edit && (
        <JoueurForm
          joueur={edit}
          clubId={CLUB_PROPRE_ID}
          onClose={() => setEdit(null)}
          onSaved={async () => { setEdit(null); await reload(); }}
        />
      )}

      {creating && equipeId && (
        <JoueurAddModal
          equipeId={equipeId}
          equipeNom={equipeNom}
          onClose={() => setCreating(false)}
          onSaved={async () => {
            debug("[effectif] onSaved -> reload effectif", equipeId);
            setCreating(false);
            await reload();
            // Force aussi un refresh Server Components (dashboard, etc.).
            router.refresh();
          }}
        />
      )}

      {creating && !equipeId && (
        <Modal open={true} onClose={() => setCreating(false)} maxWidth="max-w-md">
          <div className="space-y-3">
            <h2 className="font-display text-lg font-bold text-ink">
              Selectionne une equipe
            </h2>
            <p className="text-sm text-muted">
              Pour ajouter un joueur a l'effectif, il faut d'abord choisir
              une equipe via le selecteur en bas de la barre laterale.
            </p>
            <div className="flex justify-end">
              <button className="btn" onClick={() => setCreating(false)}>OK</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---- Drawer d'edition / creation ---- */
function JoueurForm({
  joueur, clubId, onClose, onSaved,
}: { joueur: Joueur | null; clubId: string; onClose: () => void; onSaved: () => void }) {
  const isNew = !joueur;
  const [form, setForm] = useState({
    nom: joueur?.nom ?? "",
    prenom: joueur?.prenom ?? "",
    poste: joueur?.poste ?? "MIL",
    numeroFavori: joueur?.numeroFavori ?? undefined,
    statutMutation: joueur?.statutMutation ?? "Pas mutation",
    commentaire: joueur?.commentaire ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setSaving(true); setError(null);
    try {
      if (isNew) {
        await api.createJoueur({ ...form, clubId });
      } else {
        await api.updateJoueur(joueur!.id, form);
      }
      onSaved();
    } catch (e) {
      setError("Echec : verifiez que le backend est demarre. " + (e as Error).message);
      setSaving(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} maxWidth="max-w-lg">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xl font-bold text-ink">
          {isNew ? "Ajouter un joueur" : `Modifier ${joueur!.prenom} ${joueur!.nom}`}
        </h2>
        <button className="btn text-xs" onClick={onClose}><X size={14}/></button>
      </div>

      <div className="grid grid-cols-2 gap-3">
          <Field label="Prenom"><input className="inp" value={form.prenom}
            onChange={(e)=>set("prenom", e.target.value)}/></Field>
          <Field label="Nom"><input className="inp" value={form.nom}
            onChange={(e)=>set("nom", e.target.value)}/></Field>
          <Field label="Poste">
            <select className="inp" value={form.poste} onChange={(e)=>set("poste", e.target.value)}>
              {POSTES.filter(p=>p!=="TOUS").map(p=><option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Numero"><input type="number" className="inp"
            value={form.numeroFavori ?? ""} onChange={(e)=>set("numeroFavori", e.target.value? +e.target.value: undefined)}/></Field>
          <Field label="Statut">
            <select className="inp" value={form.statutMutation}
              onChange={(e)=>set("statutMutation", e.target.value)}>
              {STATUTS_MUTATION.map((st)=><option key={st}>{st}</option>)}
            </select>
          </Field>
          <div className="col-span-2">
            <Field label="Commentaire staff"><input className="inp" value={form.commentaire}
              onChange={(e)=>set("commentaire", e.target.value)}/></Field>
          </div>
        </div>

        {error && <p className="text-danger text-xs mt-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            <Save size={14}/> {saving ? "Enregistrement…" : "Enregistrer"}
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

/* ---- Stepper compact (-) [N] (+) pour les stats editables en cellule. ---- */
function Stepper({
  value, onChange, min = 0, max = 99, color = "accent",
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number; max?: number;
  color?: "accent" | "sky";
}) {
  const c = color === "sky" ? "text-sky" : "text-accent";
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  return (
    <div className="inline-flex items-center gap-0.5">
      <button
        type="button"
        onClick={dec}
        className="w-5 h-5 grid place-items-center text-xs rounded border border-line bg-panel2 hover:bg-line/60 text-faint hover:text-ink"
        aria-label="diminuer"
      >−</button>
      <span className={`font-mono text-sm tabular-nums w-5 text-center ${value > 0 ? c : "text-faint"}`}>
        {value}
      </span>
      <button
        type="button"
        onClick={inc}
        className="w-5 h-5 grid place-items-center text-xs rounded border border-line bg-panel2 hover:bg-line/60 text-faint hover:text-ink"
        aria-label="augmenter"
      >+</button>
    </div>
  );
}
