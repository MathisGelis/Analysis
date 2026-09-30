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

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") || "/";
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
    <div className="min-h-screen flex items-center justify-center bg-bg p-4">
      <form onSubmit={submit} className="panel p-8 w-full max-w-sm space-y-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Foot Analytics</h1>
          <p className="text-sm text-muted">Connexion staff technique</p>
        </div>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-faint">Identifiant</span>
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value.toUpperCase())}
            placeholder="MLEMAIRE"
            autoFocus
            autoCapitalize="characters"
            className="select-fm mt-1 font-mono tracking-wider"
            spellCheck={false}
          />
          <span className="text-[10px] text-faint mt-1 block">
            Format : 1ere lettre du prenom + nom, en MAJUSCULES
          </span>
        </label>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-faint">Mot de passe</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="select-fm mt-1"
          />
        </label>

        {error && (
          <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !login.trim() || !password}
          className="btn btn-turf w-full flex items-center justify-center gap-2"
        >
          <LogIn size={14} />
          {loading ? "Connexion..." : "Se connecter"}
        </button>
      </form>
    </div>
  );
}
