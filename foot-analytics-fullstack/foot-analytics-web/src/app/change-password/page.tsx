"use client";
// src/app/change-password/page.tsx
//
// Forme le mdp lors de la 1ere connexion (ou pour le changer
// volontairement plus tard). Apres succes -> redirect from (ou /).

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { getCachedUser, setSession } from "@/lib/auth";
import { Key } from "lucide-react";
import { cheminInterne } from "@/lib/redirection";

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4">
      <form onSubmit={submit} className="panel p-8 w-full max-w-sm space-y-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Changer le mot de passe</h1>
          {u && (
            <p className="text-sm text-muted">
              Bonjour {u.prenom} {u.nom}. Pour des raisons de securite, tu dois
              definir un nouveau mot de passe.
            </p>
          )}
        </div>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-faint">Ancien mot de passe</span>
          <input type="password" value={oldP}
            onChange={(e) => setOldP(e.target.value)} autoFocus
            className="select-fm mt-1"/>
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-faint">Nouveau mot de passe (6 caracteres min)</span>
          <input type="password" value={newP}
            onChange={(e) => setNewP(e.target.value)}
            className="select-fm mt-1"/>
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-faint">Confirmer</span>
          <input type="password" value={confirmP}
            onChange={(e) => setConfirmP(e.target.value)}
            className="select-fm mt-1"/>
        </label>

        {error && (
          <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !oldP || !newP || !confirmP}
          className="btn btn-turf w-full flex items-center justify-center gap-2"
        >
          <Key size={14}/>
          {loading ? "Enregistrement..." : "Definir le mot de passe"}
        </button>
      </form>
    </div>
  );
}
