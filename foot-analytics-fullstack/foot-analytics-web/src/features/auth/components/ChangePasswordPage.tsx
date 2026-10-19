"use client";
// src/features/auth/components/ChangePasswordPage.tsx
//
// Choix du mot de passe a la 1ere connexion (le mot de passe temporaire ne sert qu'a ca) ou plus tard, volontairement.
// La politique (12 caracteres minimum, pas de mot de passe courant ni de nom...) est appliquee par l'API ; on en
// rappelle l'essentiel ici. Le changement ferme les autres sessions du compte. Apres succes -> redirect from (ou /).

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Key } from "lucide-react";

import { api, messageApi } from "@/shared/lib/api";
import { useUtilisateur } from "@/features/auth/lib/session-context";
import { cheminInterne } from "@/features/auth/lib/redirection";

import { AuthShell } from "./AuthShell";

const LONGUEUR_MIN = 12;

export default function ChangePasswordPage() {
  const params = useSearchParams();
  const from = cheminInterne(params.get("from"));
  const u = useUtilisateur();

  const [oldP, setOldP] = useState("");
  const [newP, setNewP] = useState("");
  const [confirmP, setConfirmP] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newP.length < LONGUEUR_MIN) { setError(`Le nouveau mot de passe doit faire au moins ${LONGUEUR_MIN} caracteres.`); return; }
    if (newP !== confirmP) { setError("La confirmation ne correspond pas."); return; }
    if (newP === oldP) { setError("Le nouveau mot de passe doit etre different de l'ancien."); return; }
    setLoading(true);
    try {
      // Le serveur Next repose les cookies de session (nouvelle session, les autres sont fermees).
      await api.authChangePassword(oldP, newP);
      // Full reload : meme raison que sur /login, les Server Components
      // doivent re-rendre avec la nouvelle session.
      window.location.href = from;
    } catch (e: any) {
      setError(messageApi(e, "Erreur"));
      setLoading(false);
    }
  }

  const champ = (label: string, value: string, set: (v: string) => void, extra: object = {}) => (
    <label className="block">
      <span className="text-[13px] font-semibold text-ink">{label}</span>
      <input type="password" value={value} onChange={(e) => set(e.target.value)} className="inp mt-1.5 !py-3" {...extra} />
    </label>
  );

  return (
    <AuthShell>
      <h1 className="font-display text-3xl font-bold text-ink">Nouveau mot de passe</h1>
      {u && (
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Bonjour {u.prenom} {u.nom}. Pour votre securite, definissez un mot de passe personnel.
        </p>
      )}

      <form onSubmit={submit} className="mt-8 space-y-5">
        {champ("Mot de passe actuel (ou temporaire)", oldP, setOldP, { autoFocus: true, autoComplete: "current-password" })}
        {champ(`Nouveau mot de passe (${LONGUEUR_MIN} caracteres minimum)`, newP, setNewP, { autoComplete: "new-password", minLength: LONGUEUR_MIN })}
        <p className="-mt-3 text-xs leading-relaxed text-faint">
          Une phrase facile a retenir fait l'affaire (ex. quatre mots). Evite ton nom, ton login et les mots de passe
          courants : ils sont refuses.
        </p>
        {champ("Confirmer", confirmP, setConfirmP, { autoComplete: "new-password" })}

        {error && (
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !oldP || !newP || !confirmP}
          className="btn btn-accent w-full !py-3 text-[15px]"
        >
          <Key size={16} />
          {loading ? "Enregistrement..." : "Definir le mot de passe"}
        </button>
      </form>
    </AuthShell>
  );
}
