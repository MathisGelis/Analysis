// src/components/AddMatchButton.tsx
"use client";

// Ajout manuel d'un match (a utiliser quand la FMI est indisponible).
// Permet de saisir les metadonnees + (optionnellement) la composition des
// deux equipes. Si l'utilisateur clique "Charger l'effectif", on importe les
// joueurs du club depuis l'API, qu'il peut ensuite cocher comme titulaires.
// Apres creation : POST /matchs puis POST /derivation/rebuild pour
// recalculer effectifs et classement.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { useOwnEquipe } from "@/lib/own-equipe-context";
import { Modal } from "@/components/Modal";
import type { Club, Joueur } from "@/lib/types";
import {
  Award, ChevronDown, ChevronRight, Plus, Save, Trash2, UserPlus, Users, X,
} from "lucide-react";

type CompoLigne = {
  uid: string;            // identifiant local pour la liste React
  numero?: number;
  nom: string;
  prenom?: string;
  licence?: string;
  titulaire: boolean;
  capitaine: boolean;
};

type ArbLigne = {
  uid: string;
  nomComplet: string;    // ex. "Jeremy FARGEOT" — sera split en upsert
  role: "principal" | "assistant1" | "assistant2" | "4e" | "autre";
  note?: number;
};

let uidCounter = 0;
const nextUid = () => `c${++uidCounter}`;

export function AddMatchButton({ clubs }: { clubs: Club[] }) {
  const router = useRouter();
  const { saisonId } = useOwnEquipe();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [form, setForm] = useState({
    journee: "",
    date: "",
    competition: "Seniors D2 / Phase Unique",
    poule: "C",
    clubDom: clubs[0]?.id ?? "",
    clubExt: clubs[1]?.id ?? "",
    scoreDom: 0,
    scoreExt: 0,
    terrain: "",
    statut: "joue",
  });

  // Compositions par cote (facultatives)
  const [compoDom, setCompoDom] = useState<CompoLigne[]>([]);
  const [compoExt, setCompoExt] = useState<CompoLigne[]>([]);
  const [openCompo, setOpenCompo] = useState(false);
  // Arbitres (facultatif)
  const [arbitres, setArbitres] = useState<ArbLigne[]>([]);
  const [openArb, setOpenArb] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function reset() {
    setForm({
      journee: "", date: "", competition: "Seniors D2 / Phase Unique", poule: "C",
      clubDom: clubs[0]?.id ?? "", clubExt: clubs[1]?.id ?? "",
      scoreDom: 0, scoreExt: 0, terrain: "", statut: "joue",
    });
    setCompoDom([]); setCompoExt([]); setOpenCompo(false);
    setArbitres([]); setOpenArb(false);
    setError(null); setInfo(null);
  }

  async function chargerEffectif(cote: "dom" | "ext") {
    const clubId = cote === "dom" ? form.clubDom : form.clubExt;
    if (!clubId) return;
    try {
      // Effectif de la SAISON selectionnee : l'equipe du club qui joue dans la
      // competition et la poule du formulaire, sinon la seule/premiere equipe.
      // (Tous les joueurs passes par le club, toutes saisons, donnaient des
      // compositions pleines d'anciens.)
      const equipes = await api.equipes({ clubId, saisonId: saisonId ?? undefined });
      const equipe = equipes.find((e: any) =>
        e.poule === form.poule && e.competitionLibelle === form.competition) ?? equipes[0];
      const joueurs: Joueur[] = equipe ? await api.effectifEquipe(equipe.id) : [];
      if (!joueurs.length) {
        setInfo("Aucun joueur dans l'effectif de cette saison. Importez des feuilles FMI ou ajoutez les manuellement.");
        return;
      }
      const lignes: CompoLigne[] = [...joueurs]
        .sort((a, b) => (a.numeroFavori ?? 99) - (b.numeroFavori ?? 99))
        .map((j: Joueur) => ({
          uid: nextUid(),
          numero: j.numeroFavori ?? undefined,
          nom: j.nom,
          prenom: j.prenom ?? "",
          licence: (j as any).licence ?? "",
          // Heuristique : on coche titulaire pour les 11 premiers (par numero).
          titulaire: false,
          capitaine: false,
        }));
      // pre-cocher les 11 premiers comme titulaires
      lignes.slice(0, 11).forEach((l) => (l.titulaire = true));
      (cote === "dom" ? setCompoDom : setCompoExt)(lignes);
      setOpenCompo(true);
      setInfo(`${lignes.length} joueur(s) charge(s) cote ${cote === "dom" ? "domicile" : "exterieur"}.`);
    } catch (e) {
      setError("Impossible de charger l'effectif : " + (e as Error).message);
    }
  }

  function ajouterLigne(cote: "dom" | "ext") {
    const newLine: CompoLigne = {
      uid: nextUid(), nom: "", prenom: "", titulaire: false, capitaine: false,
    };
    (cote === "dom" ? setCompoDom : setCompoExt)((arr) => [...arr, newLine]);
    setOpenCompo(true);
  }

  function modifierLigne(
    cote: "dom" | "ext", uid: string, patch: Partial<CompoLigne>,
  ) {
    const setter = cote === "dom" ? setCompoDom : setCompoExt;
    setter((arr) => arr.map((l) => (l.uid === uid ? { ...l, ...patch } : l)));
  }

  function supprimerLigne(cote: "dom" | "ext", uid: string) {
    const setter = cote === "dom" ? setCompoDom : setCompoExt;
    setter((arr) => arr.filter((l) => l.uid !== uid));
  }

  async function save() {
    setError(null); setInfo(null);
    if (!form.clubDom || !form.clubExt) {
      setError("Selectionnez les deux equipes.");
      return;
    }
    if (form.clubDom === form.clubExt) {
      setError("Les deux equipes doivent etre differentes.");
      return;
    }
    setSaving(true);

    // Normalise les compositions : on ignore les lignes sans nom.
    const buildCompos = (lignes: CompoLigne[], cote: "dom" | "ext") =>
      lignes
        .filter((l) => l.nom.trim().length > 0)
        .map((l) => ({
          cote,
          numero: l.numero ?? 0,
          nom: l.nom.trim().toUpperCase(),
          prenom: (l.prenom ?? "").trim(),
          licence: l.licence?.trim() || undefined,
          titulaire: l.titulaire,
          capitaine: l.capitaine,
        }));
    const compositions = [
      ...buildCompos(compoDom, "dom"),
      ...buildCompos(compoExt, "ext"),
    ];

    try {
      const payload: any = { ...form };
      if (compositions.length) payload.compositions = compositions;
      const created = await api.createMatch(payload);

      // Liens arbitres : on cree d'abord l'arbitre (si necessaire),
      // puis on l'attache au match avec son role et sa note eventuelle.
      const arbValides = arbitres.filter((a) => a.nomComplet.trim().length > 0);
      for (const a of arbValides) {
        try {
          // Heuristique simple : majuscules = nom, le reste = prenom.
          const parts = a.nomComplet.trim().replace(/\s+/g, " ").split(" ");
          const nomParts = parts.filter((p) => p === p.toUpperCase() && /[A-Z]/.test(p));
          const prenomParts = parts.filter((p) => !(p === p.toUpperCase() && /[A-Z]/.test(p)));
          const nom = (nomParts.join(" ") || a.nomComplet).trim();
          const prenom = prenomParts.join(" ") || undefined;
          const arb = await api.createArbitre({ nom, prenom });
          await api.linkArbitre({
            matchId: (created as any).id,
            arbitreId: arb.id, role: a.role,
            ...(a.note != null ? { note: a.note } : {}),
          });
        } catch {
          // ignore : un arbitre rate ne doit pas bloquer la creation du match.
        }
      }

      // Recalcul effectifs (cumul matchs, cartons, minutes) + classement
      // + cumuls arbitres.
      await api.rebuildDerivation().catch(() => undefined);
      setSaving(false);
      setOpen(false);
      reset();
      router.refresh();
    } catch (e) {
      setError("Echec : le backend est-il demarre ? " + (e as Error).message);
      setSaving(false);
    }
  }

  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        <Plus size={14} /> Ajouter un match
      </button>

      {open && (
        <Modal open={open} onClose={() => setOpen(false)} maxWidth="max-w-4xl">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display text-xl font-bold text-ink">Ajouter un match</h2>
            <button className="btn text-xs" onClick={() => setOpen(false)}>
              <X size={14} />
            </button>
          </div>
            <p className="text-xs text-muted mb-4">
              Saisie manuelle (en l'absence de feuille FMI exploitable). La
              composition est facultative — si vous la renseignez, les cumuls
              des joueurs sont recalcules automatiquement.
            </p>

            {/* metadonnees */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Journee">
                <input className="inp" placeholder="J22" value={form.journee}
                  onChange={(e) => set("journee", e.target.value)} />
              </Field>
              <Field label="Date">
                <input type="date" className="inp" value={form.date}
                  onChange={(e) => set("date", e.target.value)} />
              </Field>
              <Field label="Competition">
                <input className="inp" value={form.competition}
                  onChange={(e) => set("competition", e.target.value)} />
              </Field>
              <Field label="Terrain (optionnel)">
                <input className="inp" value={form.terrain}
                  onChange={(e) => set("terrain", e.target.value)} />
              </Field>

              <Field label="Equipe a domicile">
                <select className="inp" value={form.clubDom}
                  onChange={(e) => set("clubDom", e.target.value)}>
                  {clubs.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </Field>
              <Field label="Score">
                <input type="number" min={0} className="inp" value={form.scoreDom}
                  onChange={(e) => set("scoreDom", +e.target.value)} />
              </Field>
              <Field label="Equipe a l'exterieur">
                <select className="inp" value={form.clubExt}
                  onChange={(e) => set("clubExt", e.target.value)}>
                  {clubs.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </Field>
              <Field label="Score">
                <input type="number" min={0} className="inp" value={form.scoreExt}
                  onChange={(e) => set("scoreExt", +e.target.value)} />
              </Field>
            </div>

            {/* compositions (collapsible) */}
            <button
              onClick={() => setOpenCompo((o) => !o)}
              className="mt-5 mb-3 w-full text-left flex items-center gap-2 panel-inset px-3 py-2 hover:bg-line/40"
            >
              {openCompo ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Users size={14} className="text-accent" />
              <span className="font-display font-bold text-ink">
                Compositions (facultatif)
              </span>
              <span className="text-xs text-muted ml-auto">
                {compoDom.length + compoExt.length} joueur(s)
              </span>
            </button>

            {openCompo && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <CompoEditor
                  titre={`Domicile — ${clubs.find((c) => c.id === form.clubDom)?.nom ?? ""}`}
                  cote="dom"
                  lignes={compoDom}
                  onCharger={() => chargerEffectif("dom")}
                  onAjouter={() => ajouterLigne("dom")}
                  onModifier={(uid, patch) => modifierLigne("dom", uid, patch)}
                  onSupprimer={(uid) => supprimerLigne("dom", uid)}
                />
                <CompoEditor
                  titre={`Exterieur — ${clubs.find((c) => c.id === form.clubExt)?.nom ?? ""}`}
                  cote="ext"
                  lignes={compoExt}
                  onCharger={() => chargerEffectif("ext")}
                  onAjouter={() => ajouterLigne("ext")}
                  onModifier={(uid, patch) => modifierLigne("ext", uid, patch)}
                  onSupprimer={(uid) => supprimerLigne("ext", uid)}
                />
              </div>
            )}

            {/* Arbitres (collapsible) */}
            <button
              onClick={() => setOpenArb((o) => !o)}
              className="mt-5 mb-3 w-full text-left flex items-center gap-2 panel-inset px-3 py-2 hover:bg-line/40"
            >
              {openArb ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Award size={14} className="text-accent" />
              <span className="font-display font-bold text-ink">
                Arbitres (facultatif)
              </span>
              <span className="text-xs text-muted ml-auto">
                {arbitres.length} arbitre(s)
              </span>
            </button>

            {openArb && (
              <ArbitresEditor
                lignes={arbitres}
                onAjouter={() => setArbitres((a) => [
                  ...a,
                  { uid: `a${Date.now()}-${a.length}`, nomComplet: "", role: nextDefaultRole(a) },
                ])}
                onModifier={(uid, patch) =>
                  setArbitres((arr) => arr.map((l) => l.uid === uid ? { ...l, ...patch } : l))
                }
                onSupprimer={(uid) =>
                  setArbitres((arr) => arr.filter((l) => l.uid !== uid))
                }
              />
            )}

            {info && <p className="text-accent text-xs mt-3">{info}</p>}
            {error && <p className="text-danger text-xs mt-3">{error}</p>}

            <div className="flex justify-end gap-2 mt-5">
              <button className="btn" onClick={() => setOpen(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                <Save size={14} /> {saving ? "Enregistrement…" : "Creer le match"}
              </button>
            </div>
        </Modal>
      )}
    </>
  );
}

/* ---- editeur de composition pour un cote ---- */
function CompoEditor({
  titre, cote, lignes, onCharger, onAjouter, onModifier, onSupprimer,
}: {
  titre: string;
  cote: "dom" | "ext";
  lignes: CompoLigne[];
  onCharger: () => void;
  onAjouter: () => void;
  onModifier: (uid: string, patch: Partial<CompoLigne>) => void;
  onSupprimer: (uid: string) => void;
}) {
  const titu = lignes.filter((l) => l.titulaire).length;
  return (
    <div className="panel-inset p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="font-display text-sm font-bold text-ink truncate">{titre}</div>
        <span className="badge badge-accent">{titu} titu / {lignes.length}</span>
      </div>
      <div className="flex gap-2 mb-2">
        <button className="btn text-xs" onClick={onCharger}>
          <Users size={11} /> Charger l'effectif
        </button>
        <button className="btn text-xs" onClick={onAjouter}>
          <UserPlus size={11} /> Joueur
        </button>
      </div>

      {lignes.length === 0 ? (
        <p className="text-xs text-muted py-3 text-center">
          Pas de composition. Cliquez sur « Charger l'effectif » ou « Joueur ».
        </p>
      ) : (
        <div className="max-h-[280px] overflow-auto -mx-1">
          <table className="table-fm">
            <thead>
              <tr>
                <th className="w-10">#</th>
                <th>Nom</th>
                <th>Prenom</th>
                <th className="text-center w-12">T</th>
                <th className="text-center w-12">C</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.uid}>
                  <td>
                    <input
                      type="number" min={0} max={99}
                      className="inp !py-1 !px-1.5 text-xs"
                      value={l.numero ?? ""}
                      onChange={(e) =>
                        onModifier(l.uid, { numero: e.target.value ? +e.target.value : undefined })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="inp !py-1 !px-1.5 text-xs"
                      placeholder="DUPONT"
                      value={l.nom}
                      onChange={(e) => onModifier(l.uid, { nom: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="inp !py-1 !px-1.5 text-xs"
                      placeholder="Jean"
                      value={l.prenom ?? ""}
                      onChange={(e) => onModifier(l.uid, { prenom: e.target.value })}
                    />
                  </td>
                  <td className="text-center">
                    <input
                      type="checkbox" checked={l.titulaire}
                      onChange={(e) => onModifier(l.uid, { titulaire: e.target.checked })}
                    />
                  </td>
                  <td className="text-center">
                    <input
                      type="checkbox" checked={l.capitaine}
                      onChange={(e) => onModifier(l.uid, { capitaine: e.target.checked })}
                    />
                  </td>
                  <td className="text-right">
                    <button className="btn text-xs" onClick={() => onSupprimer(l.uid)}>
                      <Trash2 size={11} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
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

/* ---- choix automatique du role pour le prochain arbitre ajoute ---- */
function nextDefaultRole(existants: ArbLigne[]): ArbLigne["role"] {
  const roles = existants.map((a) => a.role);
  if (!roles.includes("principal")) return "principal";
  if (!roles.includes("assistant1")) return "assistant1";
  if (!roles.includes("assistant2")) return "assistant2";
  if (!roles.includes("4e")) return "4e";
  return "autre";
}

/* ---- editeur de la liste d'arbitres ---- */
function ArbitresEditor({
  lignes, onAjouter, onModifier, onSupprimer,
}: {
  lignes: ArbLigne[];
  onAjouter: () => void;
  onModifier: (uid: string, patch: Partial<ArbLigne>) => void;
  onSupprimer: (uid: string) => void;
}) {
  return (
    <div className="panel-inset p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] text-muted">
          Saisir un nom complet par ligne (ex. « Jeremy FARGEOT »). Les
          majuscules sont detectees comme nom de famille.
        </p>
        <button className="btn text-xs" onClick={onAjouter}>
          <UserPlus size={11}/> Ajouter
        </button>
      </div>

      {lignes.length === 0 ? (
        <p className="text-xs text-muted py-3 text-center">
          Aucun arbitre saisi. Cliquez sur « Ajouter » si vous voulez en lier.
        </p>
      ) : (
        <table className="table-fm">
          <thead>
            <tr>
              <th>Nom complet</th>
              <th>Fonction</th>
              <th>Note</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.uid}>
                <td>
                  <input
                    className="inp !py-1 !px-1.5 text-xs"
                    placeholder="Jeremy FARGEOT"
                    value={l.nomComplet}
                    onChange={(e) => onModifier(l.uid, { nomComplet: e.target.value })}
                  />
                </td>
                <td>
                  <select
                    className="inp !py-1 !px-1.5 text-xs"
                    value={l.role}
                    onChange={(e) => onModifier(l.uid, { role: e.target.value as ArbLigne["role"] })}
                  >
                    <option value="principal">Principal</option>
                    <option value="assistant1">Assistant 1</option>
                    <option value="assistant2">Assistant 2</option>
                    <option value="4e">4e officiel</option>
                    <option value="autre">Autre</option>
                  </select>
                </td>
                <td>
                  <input
                    type="number" min={0} max={10} step={0.5}
                    className="inp !py-1 !px-1.5 text-xs w-16"
                    placeholder="—"
                    value={l.note ?? ""}
                    onChange={(e) => onModifier(l.uid, {
                      note: e.target.value === "" ? undefined : +e.target.value,
                    })}
                  />
                </td>
                <td className="text-right">
                  <button className="btn text-xs" onClick={() => onSupprimer(l.uid)}>
                    <Trash2 size={11}/>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
