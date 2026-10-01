"use client";
// src/app/admin/utilisateurs/page.tsx
//
// Gestion des comptes, pour deux profils (le backend verifie les droits) :
//  - l'administrateur : tous les comptes, de tous les clubs, avec le choix du role
//    (administrateur, referent de club, educateur) ;
//  - le referent d'un club : seulement les comptes de ses educateurs, dans son club et
//    sur les equipes de son club.
// Le login est calcule auto a partir du prenom + nom. Chaque compte affiche son createur.
//
// Un educateur recoit : des equipes de la SAISON ACTUELLE (par niveau, "Seniors D2" : la poule change d'une saison a
// l'autre, l'equipe non) et les saisons de l'historique qu'il peut consulter (voir lib/acces-saisons.ts).

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getCachedUser, type User } from "@/lib/auth";
import { Modal } from "@/components/Modal";
import { Select } from "@/components/Select";
import {
  idsDesNiveaux, libelleNiveau, modeSaisons, niveauxAttribuables, niveauxCoches, resumeSaisons, saisonActuelle,
  saisonsPassees, type ModeSaisons,
} from "@/lib/acces-saisons";
import {
  KeyRound, Pencil, Plus, Save, ShieldCheck, Trash2, UserCog, X,
} from "lucide-react";

const LIBELLE_ROLE: Record<string, string> = { admin: "Admin", referent: "Referent", user: "Educateur" };
import { useFeedback } from "@/lib/feedback-context";

const dateFr = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "");

function buildLogin(prenom: string, nom: string) {
  const p = (prenom ?? "").trim();
  const n = (nom ?? "").trim();
  if (!p || !n) return "";
  return (p[0] + n).replace(/\s+/g, "").toUpperCase();
}

export default function AdminUtilisateurs() {
  const { notifier, confirmer } = useFeedback();
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [clubs, setClubs] = useState<any[]>([]);
  const [equipes, setEquipes] = useState<any[]>([]);
  const [saisons, setSaisons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [moi, setMoi] = useState<User | null>(null);
  const estReferent = moi?.role === "referent";

  // Verifier le role cote client (UX); le guard reel est cote backend.
  useEffect(() => {
    const u = getCachedUser();
    setMoi(u);
    if (u && u.role !== "admin" && u.role !== "referent") router.replace("/");
  }, [router]);

  async function reload() {
    setLoading(true);
    try {
      const [u, c, e, sa] = await Promise.all([api.utilisateurs(), api.clubs(), api.equipes(), api.saisons()]);
      setUsers(u); setClubs(c); setEquipes(e); setSaisons(sa);
    } finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, []);

  async function onDelete(id: string) {
    if (!(await confirmer({ titre: "Supprimer ce compte ?", message: "Cette action est irreversible.", danger: true }))) return;
    try {
      await api.deleteUtilisateur(id);
      await reload();
      notifier.succes("Compte supprime.");
    } catch (e: any) {
      notifier.erreur(e?.message ?? "Erreur");
    }
  }

  return (
    <div className="space-y-6 fade-up">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="h-section flex items-center gap-2">
            <ShieldCheck size={11} className="text-accent"/>{estReferent ? "Mon club" : "Administration"}
          </div>
          <h1 className="font-display text-2xl font-bold text-ink">{estReferent ? "Mes educateurs" : "Comptes utilisateurs"}</h1>
          {estReferent && (
            <p className="mt-1 max-w-xl text-xs text-muted">
              Cree un compte pour chacun de tes educateurs : il ne voit que ton club, et seulement les equipes que tu coches
              (aucune coche = toutes les equipes du club). Son mot de passe initial est a lui transmettre ; il devra le changer a sa premiere connexion.
            </p>
          )}
        </div>
        <button className="btn btn-accent" onClick={() => setAdding(true)}>
          <Plus size={14}/> {estReferent ? "Nouvel educateur" : "Nouveau compte"}
        </button>
      </header>

      <section className="panel p-5">
        {loading ? (
          <p className="text-muted text-sm">Chargement…</p>
        ) : users.length === 0 ? (
          <p className="text-muted text-sm py-6 text-center">{estReferent ? "Aucun educateur pour l'instant : cree son premier compte." : "Aucun compte."}</p>
        ) : (
          <table className="table-fm">
            <thead>
              <tr>
                <th>Login</th>
                <th>Nom</th>
                {!estReferent && <th>Role</th>}
                {!estReferent && <th>Club</th>}
                <th>Equipes</th>
                <th>Saisons</th>
                <th>Cree par</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const club = clubs.find((c) => c.id === u.clubId);
                // Une equipe s'affiche par son niveau ("Seniors D2"), jamais par sa poule.
                const userEqs = [...new Set((u.equipeIds ?? []).map((id: string) => {
                  const eq = equipes.find((e) => e.id === id);
                  return eq ? libelleNiveau(eq) : id.slice(0, 6);
                }))] as string[];
                return (
                  <tr key={u.id}>
                    <td className="font-mono font-bold">{u.login}</td>
                    <td>{u.prenom} {u.nom}</td>
                    {!estReferent && (
                      <td>
                        <span className={`badge ${u.role === "admin" || u.role === "referent" ? "badge-accent" : ""}`}>
                          {LIBELLE_ROLE[u.role] ?? u.role}
                        </span>
                      </td>
                    )}
                    {!estReferent && (
                      <td className="text-xs text-muted">
                        {u.role === "admin" ? "—" : (club?.nom ?? "—")}
                      </td>
                    )}
                    <td className="text-xs text-muted">
                      {userEqs.length === 0 ? (u.role === "admin" ? "—" : "Toutes") : userEqs.join(" · ")}
                    </td>
                    <td className="text-xs text-muted">
                      {u.role === "user" ? resumeSaisons(u, saisons) : "—"}
                    </td>
                    <td className="text-xs" data-testid={`createur-${u.login}`}>
                      {u.createur ? (
                        <>
                          <div className="text-ink">{u.createur.prenom} {u.createur.nom}</div>
                          <div className="whitespace-nowrap font-mono text-[10px] text-faint">{u.createur.login}{u.createdAt ? ` · ${dateFr(u.createdAt)}` : ""}</div>
                        </>
                      ) : u.createurSupprime ? (
                        <>
                          <div className="text-muted">Compte supprime</div>
                          {u.createdAt && <div className="text-[10px] text-faint">{dateFr(u.createdAt)}</div>}
                        </>
                      ) : (
                        <span className="text-faint" title="Compte anterieur au suivi du createur, ou creation initiale">—</span>
                      )}
                    </td>
                    <td>
                      {u.mustChangePassword
                        ? <span className="badge badge-amber text-[10px]">Mdp a changer</span>
                        : <span className="badge text-[10px]">Actif</span>}
                    </td>
                    <td className="text-right">
                      <div className="flex gap-1 justify-end">
                        <button className="btn text-[10px]" onClick={() => setEditing(u)} aria-label={`Modifier ${u.login}`} title="Modifier">
                          <Pencil size={10}/>
                        </button>
                        <button className="btn text-[10px] text-danger" onClick={() => onDelete(u.id)} aria-label={`Supprimer ${u.login}`} title="Supprimer">
                          <Trash2 size={10}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {adding && (
        <UserForm clubs={clubs} equipes={equipes} saisons={saisons} acteur={moi}
          onClose={() => setAdding(false)}
          onSaved={async () => { setAdding(false); await reload(); }} />
      )}
      {editing && (
        <UserForm clubs={clubs} equipes={equipes} saisons={saisons} acteur={moi} user={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await reload(); }} />
      )}
    </div>
  );
}

function UserForm({
  user, clubs, equipes, saisons, acteur, onClose, onSaved,
}: {
  user?: any;
  clubs: any[];
  equipes: any[];
  saisons: any[];
  /** Le gestionnaire connecte : un referent est enferme dans son club et ne cree que des educateurs. */
  acteur: User | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!user?.id;
  const [prenom, setPrenom] = useState(user?.prenom ?? "");
  const [nom, setNom] = useState(user?.nom ?? "");
  const estReferent = acteur?.role === "referent";
  const [role, setRole] = useState<"admin" | "referent" | "user">(estReferent ? "user" : (user?.role ?? "user"));
  const [clubId, setClubId] = useState<string>(estReferent ? (acteur?.clubId ?? "") : (user?.clubId ?? ""));
  // Equipes : celles de la SAISON ACTUELLE du club, par niveau ("Seniors D2", sans la poule). Pour un compte existant,
  // les niveaux coches sont ceux qu'il voit deja (son equipe peut dater d'une saison precedente, avec une autre poule).
  const saisonCourante = useMemo(() => saisonActuelle(saisons), [saisons]);
  const [cochees, setCochees] = useState<Set<string>>(() => {
    const club = estReferent ? (acteur?.clubId ?? "") : (user?.clubId ?? "");
    return niveauxCoches(niveauxAttribuables(equipes, club, saisonCourante?.id ?? null), equipes, user?.equipeIds ?? []);
  });
  // Saisons : saison actuelle seule (defaut d'un nouveau compte), saisons passees choisies, ou toutes.
  const [mode, setMode] = useState<ModeSaisons>(() => (user?.id ? modeSaisons(user) : "courante"));
  const [saisonsChoisies, setSaisonsChoisies] = useState<Set<string>>(() => new Set(user?.saisonIds ?? []));
  const [resetPassword, setResetPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);

  const login = buildLogin(prenom, nom);
  const avecClub = role !== "admin";
  const niveaux = useMemo(
    () => niveauxAttribuables(equipes, clubId, saisonCourante?.id ?? null),
    [equipes, clubId, saisonCourante],
  );
  const passees = useMemo(() => saisonsPassees(saisons), [saisons]);

  function basculer<T>(ensemble: Set<T>, appliquer: (s: Set<T>) => void, valeur: T) {
    const n = new Set(ensemble);
    if (n.has(valeur)) n.delete(valeur); else n.add(valeur);
    appliquer(n);
  }

  /** Ce que le compte voit comme saisons : "toutes", ou la saison actuelle + les saisons passees cochees. */
  const accesSaisons = {
    toutesSaisons: mode === "toutes",
    saisonIds: mode === "choix" ? [...saisonsChoisies] : [],
  };

  async function submit() {
    setError(null);
    if (!prenom.trim() || !nom.trim()) { setError("Prenom et nom requis."); return; }
    if (avecClub && !clubId) { setError("Selectionne un club pour ce compte."); return; }
    setSaving(true);
    try {
      if (isEdit) {
        const payload: any = { prenom, nom, role };
        payload.clubId = role === "admin" ? null : clubId;
        payload.equipeIds = role === "admin" || role === "referent" ? [] : idsDesNiveaux(niveaux, cochees);
        if (role === "user") Object.assign(payload, accesSaisons);
        if (estReferent) delete payload.role;     // un referent ne change pas le role d'un compte
        if (resetPassword) payload.resetPassword = resetPassword;
        await api.updateUtilisateur(user.id, payload);
        onSaved();
      } else {
        const res = await api.createUtilisateur({
          prenom, nom, role,
          clubId: role === "admin" ? undefined : clubId,
          // Un referent a deja acces a toutes les equipes de son club : aucune liste a enregistrer.
          equipeIds: role === "admin" || role === "referent" ? [] : idsDesNiveaux(niveaux, cochees),
          ...(role === "user" ? accesSaisons : {}),
        });
        // Afficher le mdp initial dans la modale puis recharger.
        setCreatedPassword(res.initialPassword);
      }
    } catch (e: any) {
      setError(e?.message ?? "Erreur");
    } finally { setSaving(false); }
  }

  if (createdPassword) {
    return (
      <Modal open={true} onClose={() => { onSaved(); }} maxWidth="max-w-md">
        <div className="space-y-4">
          <h2 className="font-display text-xl font-bold text-ink flex items-center gap-2">
            <KeyRound size={18} className="text-accent"/> Compte cree
          </h2>
          <p className="text-sm text-muted">
            Communique ces credentials {estReferent ? "a ton educateur" : "au nouvel utilisateur"}. Le mot de
            passe devra etre change a sa premiere connexion.
          </p>
          <div className="panel-inset p-4 space-y-2">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-faint">Identifiant</span>
              <div className="font-mono font-bold text-lg tracking-wider">{login}</div>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-faint">Mot de passe initial</span>
              <div className="font-mono font-bold text-lg text-amber">{createdPassword}</div>
            </div>
          </div>
          <button className="btn btn-accent w-full" onClick={onSaved}>OK</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={true} onClose={onClose} maxWidth="max-w-xl">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-ink flex items-center gap-2">
            <UserCog size={18} className="text-accent"/>
            {isEdit ? "Modifier le compte" : (estReferent ? "Nouvel educateur" : "Nouveau compte")}
          </h2>
          <button onClick={onClose} className="btn text-xs"><X size={14}/></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Prenom">
            <input className="select-fm" value={prenom}
              onChange={(e) => setPrenom(e.target.value)} placeholder="Mathis"/>
          </Field>
          <Field label="Nom">
            <input className="select-fm" value={nom}
              onChange={(e) => setNom(e.target.value)} placeholder="Lemaire"/>
          </Field>
        </div>

        <Field label="Identifiant (calcule)">
          <div className="select-fm bg-panel text-ink font-mono font-bold tracking-wider">
            {login || "—"}
          </div>
        </Field>

        {!estReferent && (
          <Groupe label="Role">
            <div className="flex flex-wrap gap-2">
              {([["user", "Educateur (staff)"], ["referent", "Referent de club"], ["admin", "Administrateur"]] as const).map(([r, libelle]) => (
                <button key={r} type="button" aria-pressed={role === r}
                  onClick={() => setRole(r)}
                  className={`btn text-xs ${role === r ? "btn-accent" : ""}`}>
                  {libelle}
                </button>
              ))}
            </div>
            {role === "referent" && (
              <p className="mt-1 text-[10px] text-faint">
                Acces a son club et a toutes ses equipes ; peut creer et gerer les comptes de ses educateurs.
              </p>
            )}
          </Groupe>
        )}

        {avecClub && (
          <>
            {!estReferent && (
              <Field label="Club autorise">
                <Select className="select-fm" valeur={clubId} ariaLabel="Club autorise"
                  onChange={(v) => { setClubId(v); setCochees(new Set()); }}
                  options={[{ valeur: "", libelle: "— Selectionne un club —" }, ...clubs.map((c) => ({ valeur: c.id, libelle: c.nom }))]}/>
              </Field>
            )}
            {estReferent && (
              <Field label="Club">
                <div className="select-fm bg-panel text-ink">{clubs.find((c) => c.id === clubId)?.nom ?? "Mon club"}</div>
              </Field>
            )}

            {clubId && role !== "referent" && (
              <Groupe label={`Equipes attribuees${saisonCourante ? ` · saison ${saisonCourante.nom}` : ""} (${cochees.size} / ${niveaux.length})`}>
                <div className="grid grid-cols-1 gap-1 max-h-48 overflow-auto panel-inset p-2 sm:grid-cols-2">
                  {niveaux.length === 0 ? (
                    <p className="text-xs text-muted col-span-2 text-center py-3">
                      Aucune equipe de ce club sur la saison actuelle.
                    </p>
                  ) : niveaux.map((n) => {
                    const on = cochees.has(n.cle);
                    return (
                      <label key={n.cle}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer ${
                          on ? "bg-accent/10 text-ink" : "text-muted hover:bg-line/40"
                        }`}>
                        <input type="checkbox" checked={on} onChange={() => basculer(cochees, setCochees, n.cle)}/>
                        <span className="flex-1 truncate">{n.libelle}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-[10px] text-faint mt-1">
                  Aucune coche = acces a toutes les equipes du club. L'equipe attribuee reste la sienne d'une saison a l'autre,
                  meme si sa poule change.
                </p>
              </Groupe>
            )}

            {role === "user" && (
              <Groupe label="Saisons consultables">
                <div className="flex flex-wrap gap-2">
                  {([["courante", "Cette saison uniquement"], ["choix", "Choisir des saisons"], ["toutes", "Toutes les saisons"]] as const).map(([m, libelle]) => (
                    <button key={m} type="button" aria-pressed={mode === m}
                      onClick={() => setMode(m)}
                      className={`btn text-xs ${mode === m ? "btn-accent" : ""}`}>
                      {libelle}
                    </button>
                  ))}
                </div>
                {mode === "choix" && (
                  <div className="mt-2 grid grid-cols-2 gap-1 max-h-40 overflow-auto panel-inset p-2 sm:grid-cols-3">
                    {passees.length === 0 ? (
                      <p className="col-span-full py-2 text-center text-xs text-muted">Aucune saison passee en base.</p>
                    ) : passees.map((sa) => {
                      const on = saisonsChoisies.has(sa.id);
                      return (
                        <label key={sa.id}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer ${
                            on ? "bg-accent/10 text-ink" : "text-muted hover:bg-line/40"
                          }`}>
                          <input type="checkbox" checked={on} onChange={() => basculer(saisonsChoisies, setSaisonsChoisies, sa.id)}/>
                          <span className="tabular-nums">{sa.nom}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                <p className="text-[10px] text-faint mt-1" data-testid="resume-saisons">
                  {mode === "toutes"
                    ? "Voit toutes les saisons, y compris celles qui seront creees."
                    : `Voit la saison actuelle${saisonCourante ? ` (${saisonCourante.nom})` : ""}${
                        mode === "choix" && saisonsChoisies.size > 0
                          ? ` + ${passees.filter((x) => saisonsChoisies.has(x.id)).map((x) => x.nom).join(" · ")}`
                          : ""
                      } et les suivantes${mode === "courante" ? ", pas l'historique" : ""}.`}
                </p>
              </Groupe>
            )}
          </>
        )}

        {isEdit && (
          <Field label="Reinitialiser le mot de passe (optionnel)">
            <input className="select-fm" placeholder="Laisser vide pour ne pas changer"
              value={resetPassword} onChange={(e) => setResetPassword(e.target.value)}/>
            <p className="text-[10px] text-faint mt-1">
              Si renseigne, l'utilisateur devra le changer a sa prochaine connexion.
            </p>
          </Field>
        )}

        {error && (
          <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn btn-accent" onClick={submit} disabled={saving}>
            <Save size={14}/>
            {saving ? "Sauvegarde…" : (isEdit ? "Enregistrer" : "Creer le compte")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Un groupe de plusieurs commandes (boutons, cases) : pas un <label>, qui activerait la premiere commande au moindre clic. */
function Groupe({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <span className="text-[10px] uppercase tracking-wider text-faint">{label}</span>
      <div className="mt-1">{children}</div>
    </div>
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
