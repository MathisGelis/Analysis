"use client";
// src/features/auth/components/ChangePasswordPage.tsx
//
// Forme le mdp lors de la 1ere connexion (ou pour le changer
// volontairement plus tard). Apres succes -> redirect from (ou /).

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Key } from "lucide-react";

import { api } from "@/shared/lib/api";
import { getCachedUser, setSession } from "@/features/auth/lib/auth";
import { cheminInterne } from "@/features/auth/lib/redirection";

import { AuthShell } from "./AuthShell";

export default function ChangePasswordPage() {
  const router = useRouter();
  const params = useSearchParams();
  const from = cheminInterne(params.get("from"));
  const u = getCachedUser();

  const [oldP, setOldP] = useState("");
  const [newP, setNewP] = useState("");
  const [confirmP, setConfirmP] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newP.length < 6) { setError("Le nouveau mot de passe doit faire au moins 6 caracteres."); return; }
    if (newP !== confirmP) { setError("La confirmation ne correspond pas."); return; }
    if (newP === oldP) { setError("Le nouveau mot de passe doit etre different de l'ancien."); return; }
    setLoading(true);
    try {
      await api.authChangePassword(oldP, newP);
      // Mettre a jour le cache user (mustChangePassword = false).
      if (u) {
        // On a pas forcement le token frais : reconnexion silencieuse.
        const res = await api.authLogin(u.login, newP);
        setSession(res.token, res.user);
      }
      // Full reload : meme raison que sur /login, les Server Components
      // doivent re-rendre avec le nouveau token a jour.
      window.location.href = from;
    } catch (e: any) {
      setError(e?.message ?? "Erreur");
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
        {champ("Ancien mot de passe", oldP, setOldP, { autoFocus: true, autoComplete: "current-password" })}
        {champ("Nouveau mot de passe (6 caracteres minimum)", newP, setNewP, { autoComplete: "new-password" })}
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
