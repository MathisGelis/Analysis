"use client";
// src/app/login/page.tsx
//
// Page de connexion. Champ "login" auto-uppercased. Apres login reussi :
//  - Si mustChangePassword -> redirect /change-password?from=<from>
//  - Sinon -> redirect <from> (defaut /)

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { setSession } from "@/lib/auth";
import { LogIn } from "lucide-react";
import { cheminInterne } from "@/lib/redirection";
import { AuthShell } from "@/components/AuthShell";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  // Cible validee : jamais une URL externe (open redirect).
  const from = cheminInterne(params.get("from"));
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const res = await api.authLogin(login.trim().toUpperCase(), password);
      setSession(res.token, res.user);
      const dest = res.user.mustChangePassword
        ? `/change-password?from=${encodeURIComponent(from)}`
        : from;
      // window.location.href (et non router.replace) pour forcer un
      // full reload : les Server Components doivent re-rendre avec le
      // nouveau cookie `fa_token`, sinon les pages metier affichent
      // encore l'etat "non connecte" jusqu'au prochain F5 manuel.
      window.location.href = dest;
    } catch (e: any) {
      setError(e?.message ?? "Erreur de connexion");
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <h1 className="font-display text-3xl font-bold text-ink">Bon retour</h1>
      <p className="mt-1.5 text-sm text-muted">Connexion au staff technique.</p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <label className="block">
          <span className="text-[13px] font-semibold text-ink">Identifiant</span>
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value.toUpperCase())}
            placeholder="MLEMAIRE"
            autoFocus
            autoCapitalize="characters"
            autoComplete="username"
            className="inp mt-1.5 !py-3 font-mono tracking-wider"
            spellCheck={false}
          />
          <span className="mt-1.5 block text-xs text-faint">
            1ere lettre du prenom + nom, en majuscules.
          </span>
        </label>

        <label className="block">
          <span className="text-[13px] font-semibold text-ink">Mot de passe</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="inp mt-1.5 !py-3"
          />
        </label>

        {error && (
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !login.trim() || !password}
          className="btn btn-accent w-full !py-3 text-[15px]"
        >
          <LogIn size={16} />
          {loading ? "Connexion..." : "Se connecter"}
        </button>
      </form>
    </AuthShell>
  );
}
