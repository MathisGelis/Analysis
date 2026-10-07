// src/features/joueurs/components/EffectifPage.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Save, Search, Trash2, X } from "lucide-react";

import { api } from "@/shared/lib/api";
import { useOwnClubId } from "@/features/equipes/lib/own-club-context";
import { useOwnEquipe } from "@/features/equipes/lib/own-equipe-context";
import { Modal } from "@/shared/ui/Modal";
import { Select } from "@/shared/ui/Select";
import { optionsSimples } from "@/shared/lib/selecteur";
import type { Joueur } from "@/shared/lib/types";
import { debug } from "@/shared/lib/debug";
import { postesCompacts } from "@/features/joueurs/lib/postes";
import { classeBadgeMutation, STATUTS_MUTATION } from "@/features/tactique/lib/mutations";
import { useFeedback } from "@/shared/lib/feedback-context";
import { COLONNES_TRI, sensParDefaut, trierEffectif, type CleTri, type Sens } from "@/features/joueurs/lib/tri-effectif";

import { JoueurAddModal } from "./JoueurAddModal";
import { FatigueBar } from "./FatigueBar";

const POSTES = ["TOUS","GB","DD","DC","DG","MD","MC","MO","AT","AG","AD","MIL"];
const OPTIONS_POSTES_FILTRE = optionsSimples(POSTES);
const OPTIONS_POSTES = optionsSimples(POSTES.filter((p) => p !== "TOUS"));
const OPTIONS_TRI = COLONNES_TRI.map((c) => ({ valeur: c.cle, libelle: `Tri · ${c.libelle}` }));

export default function EffectifPage() {
  const { notifier, confirmer } = useFeedback();
  const CLUB_PROPRE_ID = useOwnClubId();
  const { equipeId } = useOwnEquipe();   // <- equipe selectionnee globalement
  const router = useRouter();
  const [joueurs, setJoueurs] = useState<Joueur[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [posteFilter, setPosteFilter] = useState("TOUS");
  const [tri, setTri] = useState<{ cle: CleTri; sens: Sens }>({ cle: "matchs", sens: "desc" });
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
    r = trierEffectif(r, tri.cle, tri.sens);
    return r;
  }, [joueurs, q, posteFilter, tri]);

  // Clic sur un en-tete : meme colonne = on inverse le sens ; autre colonne = son sens naturel.
  const trierPar = useCallback((cle: CleTri) => {
    setTri((t) => (t.cle === cle ? { cle, sens: t.sens === "asc" ? "desc" : "asc" } : { cle, sens: sensParDefaut(cle) }));
  }, []);

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
          <Select valeur={posteFilter} onChange={setPosteFilter} className="btn" ariaLabel="Filtrer par poste" options={OPTIONS_POSTES_FILTRE} recherche={false}/>
          <div className="flex items-center gap-1">
            <Select valeur={tri.cle} onChange={(v)=>{ const cle = v as CleTri; setTri({ cle, sens: sensParDefaut(cle) }); }}
              className="btn" ariaLabel="Trier l'effectif par" options={OPTIONS_TRI} recherche={false} largeurListe={200}/>
            <button type="button" className="btn !p-2.5" onClick={() => setTri((t) => ({ ...t, sens: t.sens === "asc" ? "desc" : "asc" }))}
              aria-label={tri.sens === "asc" ? "Ordre croissant, inverser" : "Ordre decroissant, inverser"}
              title={tri.sens === "asc" ? "Croissant" : "Decroissant"}>
              {tri.sens === "asc" ? <ArrowUp size={14}/> : <ArrowDown size={14}/>}
            </button>
          </div>
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
              <ThTri cle="nom" tri={tri} onTri={trierPar}>Joueur</ThTri>
              <ThTri cle="poste" tri={tri} onTri={trierPar}>Poste</ThTri>
              <ThTri cle="matchs" tri={tri} onTri={trierPar} className="text-center" titre="Matchs joues">Mat.</ThTri>
              <ThTri cle="titularisations" tri={tri} onTri={trierPar} className="hidden text-center min-[1100px]:table-cell" titre="Titularisations">Titu</ThTri>
              <ThTri cle="minutes" tri={tri} onTri={trierPar} className="hidden min-[1280px]:table-cell">Minutes</ThTri>
              <ThTri cle="note" tri={tri} onTri={trierPar} className="hidden min-[1440px]:table-cell">Note</ThTri>
              <ThTri cle="fatigue" tri={tri} onTri={trierPar} className="hidden lg:table-cell">Fatigue</ThTri>
              <ThTri cle="buts" tri={tri} onTri={trierPar} className="text-center" titre="Buts">B</ThTri>
              <ThTri cle="passes" tri={tri} onTri={trierPar} className="text-center" titre="Passes decisives">PD</ThTri>
              <ThTri cle="jaunes" tri={tri} onTri={trierPar} titre="Cartons jaunes">CJ</ThTri>
              <ThTri cle="rouges" tri={tri} onTri={trierPar} titre="Cartons rouges">CR</ThTri>
              <ThTri cle="statut" tri={tri} onTri={trierPar} className="hidden min-[1440px]:table-cell">Statut</ThTri>
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
                        <div className="mt-0.5"><span className="badge badge-danger !px-1.5 !py-0 text-[10px]!">{j.typeDiscipline}</span></div>
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

/* ---- En-tete de colonne triable : un bouton dans le <th>, l'etat est annonce par aria-sort. ---- */
function ThTri({
  cle, tri, onTri, children, className = "", titre,
}: {
  cle: CleTri; tri: { cle: CleTri; sens: Sens }; onTri: (c: CleTri) => void;
  children: React.ReactNode; className?: string; titre?: string;
}) {
  const actif = tri.cle === cle;
  const libelle = COLONNES_TRI.find((c) => c.cle === cle)?.libelle ?? "";
  return (
    <th className={className} aria-sort={actif ? (tri.sens === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onTri(cle)}
        className={`group inline-flex items-center gap-1 uppercase tracking-[inherit] transition-colors hover:text-ink ${actif ? "text-ink" : ""}`}
        title={`Trier par ${(titre ?? libelle).toLowerCase()}`}>
        {children}
        {actif
          ? (tri.sens === "asc" ? <ArrowUp size={11} aria-hidden /> : <ArrowDown size={11} aria-hidden />)
          : <ArrowDown size={11} aria-hidden className="opacity-0 transition-opacity group-hover:opacity-40 group-focus-visible:opacity-40" />}
      </button>
    </th>
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
            <Select valeur={form.poste} onChange={(v)=>set("poste", v)} ariaLabel="Poste" options={OPTIONS_POSTES}/>
          </Field>
          <Field label="Numero"><input type="number" className="inp"
            value={form.numeroFavori ?? ""} onChange={(e)=>set("numeroFavori", e.target.value? +e.target.value: undefined)}/></Field>
          <Field label="Statut">
            <Select valeur={form.statutMutation} onChange={(v)=>set("statutMutation", v)} ariaLabel="Statut" options={optionsSimples(STATUTS_MUTATION)}/>
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
