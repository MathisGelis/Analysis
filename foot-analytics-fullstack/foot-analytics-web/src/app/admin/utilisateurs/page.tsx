"use client";
// src/app/admin/utilisateurs/page.tsx
//
// Page admin (role=admin requis cote backend). Liste les utilisateurs
// + permet d'en creer, editer, supprimer. Le login est calcule auto a
// partir du prenom + nom.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getCachedUser } from "@/lib/auth";
import { Modal } from "@/components/Modal";
import {
  KeyRound, Pencil, Plus, Save, ShieldCheck, Trash2, UserCog, X,
} from "lucide-react";

function buildLogin(prenom: string, nom: string) {
  const p = (prenom ?? "").trim();
  const n = (nom ?? "").trim();
  if (!p || !n) return "";
  return (p[0] + n).replace(/\s+/g, "").toUpperCase();
}

export default function AdminUtilisateurs() {
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [clubs, setClubs] = useState<any[]>([]);
  const [equipes, setEquipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  // Verifier le role cote client (UX); le guard reel est cote backend.
  useEffect(() => {
    const u = getCachedUser();
    if (u && u.role !== "admin") router.replace("/");
  }, [router]);

  async function reload() {
    setLoading(true);
    try {
      const [u, c, e] = await Promise.all([api.utilisateurs(), api.clubs(), api.equipes()]);
      setUsers(u); setClubs(c); setEquipes(e);
    } finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, []);

  async function onDelete(id: string) {
    if (!confirm("Supprimer ce compte ? Cette action est irreversible.")) return;
    try {
      await api.deleteUtilisateur(id);
      await reload();
    } catch (e: any) {
      alert(e?.message ?? "Erreur");
    }
  }

  return (
    <div className="space-y-6 fade-up">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="h-section flex items-center gap-2">
            <ShieldCheck size={11} className="text-turf"/>Administration
          </div>
          <h1 className="font-display text-2xl font-bold text-ink">Comptes utilisateurs</h1>
        </div>
        <button className="btn btn-turf" onClick={() => setAdding(true)}>
          <Plus size={14}/> Nouveau compte
        </button>
      </header>

      <section className="panel p-5">
        {loading ? (
          <p className="text-muted text-sm">Chargement…</p>
        ) : users.length === 0 ? (
          <p className="text-muted text-sm py-6 text-center">Aucun compte.</p>
        ) : (
          <table className="table-fm">
            <thead>
              <tr>
                <th>Login</th>
                <th>Nom</th>
                <th>Role</th>
                <th>Club</th>
                <th>Equipes</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const club = clubs.find((c) => c.id === u.clubId);
                const userEqs = (u.equipeIds ?? []).map((id: string) =>
                  equipes.find((e) => e.id === id)?.nom ?? id.slice(0, 6),
                );
                return (
                  <tr key={u.id}>
                    <td className="font-mono font-bold">{u.login}</td>
                    <td>{u.prenom} {u.nom}</td>
                    <td>
                      <span className={`badge ${u.role === "admin" ? "badge-turf" : ""}`}>
                        {u.role === "admin" ? "Admin" : "User"}
                      </span>
                    </td>
                    <td className="text-xs text-muted">
                      {u.role === "admin" ? "—" : (club?.nom ?? "—")}
                    </td>
                    <td className="text-xs text-muted">
                      {userEqs.length === 0 ? "—" : userEqs.join(" · ")}
                    </td>
                    <td>
                      {u.mustChangePassword
                        ? <span className="badge badge-amber text-[10px]">Mdp a changer</span>
                        : <span className="badge text-[10px]">Actif</span>}
                    </td>
                    <td className="text-right">
                      <div className="flex gap-1 justify-end">
                        <button className="btn text-[10px]" onClick={() => setEditing(u)}>
                          <Pencil size={10}/>
                        </button>
                        <button className="btn text-[10px] text-danger" onClick={() => onDelete(u.id)}>
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
        <UserForm clubs={clubs} equipes={equipes}
          onClose={() => setAdding(false)}
          onSaved={async () => { setAdding(false); await reload(); }} />
      )}
      {editing && (
        <UserForm clubs={clubs} equipes={equipes} user={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await reload(); }} />
      )}
    </div>
  );
}

function UserForm({
  user, clubs, equipes, onClose, onSaved,
}: {
  user?: any;
  clubs: any[];
  equipes: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!user?.id;
  const [prenom, setPrenom] = useState(user?.prenom ?? "");
  const [nom, setNom] = useState(user?.nom ?? "");
  const [role, setRole] = useState<"admin" | "user">(user?.role ?? "user");
  const [clubId, setClubId] = useState<string>(user?.clubId ?? "");
  const [equipeIds, setEquipeIds] = useState<Set<string>>(
    () => new Set(user?.equipeIds ?? []),
  );
  const [resetPassword, setResetPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);

  const login = buildLogin(prenom, nom);
  const equipesFiltrees = role === "user" && clubId
    ? equipes.filter((e) => e.clubId === clubId)
    : equipes;

  function toggleEquipe(id: string) {
    setEquipeIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function submit() {
    setError(null);
    if (!prenom.trim() || !nom.trim()) { setError("Prenom et nom requis."); return; }
    if (role === "user" && !clubId) { setError("Selectionne un club pour un compte utilisateur."); return; }
    setSaving(true);
    try {
      if (isEdit) {
        const payload: any = { prenom, nom, role };
        payload.clubId = role === "admin" ? null : clubId;
        payload.equipeIds = role === "admin" ? [] : [...equipeIds];
        if (resetPassword) payload.resetPassword = resetPassword;
        await api.updateUtilisateur(user.id, payload);
        onSaved();
      } else {
        const res = await api.createUtilisateur({
          prenom, nom, role,
          clubId: role === "admin" ? undefined : clubId,
          equipeIds: role === "admin" ? [] : [...equipeIds],
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
            <KeyRound size={18} className="text-turf"/> Compte cree
          </h2>
          <p className="text-sm text-muted">
            Communique ces credentials au nouvel utilisateur. Le mot de
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
          <button className="btn btn-turf w-full" onClick={onSaved}>OK</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={true} onClose={onClose} maxWidth="max-w-xl">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-ink flex items-center gap-2">
            <UserCog size={18} className="text-turf"/>
            {isEdit ? "Modifier le compte" : "Nouveau compte"}
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

        <Field label="Role">
          <div className="flex gap-2">
            {["user", "admin"].map((r) => (
              <button key={r}
                onClick={() => setRole(r as any)}
                className={`btn text-xs ${role === r ? "btn-turf" : ""}`}>
                {r === "admin" ? "Administrateur" : "Utilisateur (staff)"}
              </button>
            ))}
          </div>
        </Field>

        {role === "user" && (
          <>
            <Field label="Club autorise">
              <select className="select-fm" value={clubId}
                onChange={(e) => { setClubId(e.target.value); setEquipeIds(new Set()); }}>
                <option value="">— Selectionne un club —</option>
                {clubs.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </Field>

            {clubId && (
              <Field label={`Equipes accessibles (${equipeIds.size} / ${equipesFiltrees.length})`}>
                <div className="grid grid-cols-2 gap-1 max-h-48 overflow-auto panel-inset p-2">
                  {equipesFiltrees.length === 0 ? (
                    <p className="text-xs text-muted col-span-2 text-center py-3">
                      Aucune equipe pour ce club.
                    </p>
                  ) : equipesFiltrees.map((e) => {
                    const on = equipeIds.has(e.id);
                    return (
                      <label key={e.id}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer ${
                          on ? "bg-turf/10 text-ink" : "text-muted hover:bg-line/40"
                        }`}>
                        <input type="checkbox" checked={on} onChange={() => toggleEquipe(e.id)}/>
                        <span className="flex-1 truncate">{e.nom}</span>
                        <span className="text-[9px] text-faint">{e.competitionLibelle}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-[10px] text-faint mt-1">
                  Aucune coche = acces a toutes les equipes du club.
                </p>
              </Field>
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
          <button className="btn btn-turf" onClick={submit} disabled={saving}>
            <Save size={14}/>
            {saving ? "Sauvegarde…" : (isEdit ? "Enregistrer" : "Creer le compte")}
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
