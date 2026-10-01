"use client";
// src/features/shell/components/UserBadge.tsx
//
// Utilisateur connecte, en bas de la barre laterale : initiales, nom, lien de gestion
// des comptes (Administration pour l'admin, Mes educateurs pour le referent de club) et deconnexion.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";

import { clearSession, getCachedUser, User } from "@/features/auth/lib/auth";
import { lienGestionComptes } from "@/features/shell/lib/navigation";

export function UserBadge({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => { setUser(getCachedUser()); }, []);

  function logout() {
    clearSession();
    router.replace("/login");
  }

  if (!user) return <div className="px-4 py-3 text-xs text-faint">{compact ? "" : "Non connecte"}</div>;

  const gestion = lienGestionComptes(user.role);
  const IconeGestion = gestion?.icon;
  const initiales = `${user.prenom?.[0] ?? ""}${user.nom?.[0] ?? user.login?.[0] ?? ""}`.toUpperCase();

  if (compact) {
    return (
      <div className="flex flex-col items-center gap-2 py-3">
        {gestion && IconeGestion && (
          <Link href={gestion.href} className="btn btn-ghost !p-2" title={gestion.label} aria-label={gestion.label}>
            <IconeGestion size={16} />
          </Link>
        )}
        <button onClick={logout} className="btn btn-ghost !p-2 text-danger" title="Se deconnecter" aria-label="Se deconnecter">
          <LogOut size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 pb-3 pt-1">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accentstrong to-accent2 font-display text-sm font-bold text-white">
        {initiales}
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-semibold text-ink">{user.prenom} {user.nom}</div>
        <div className="flex items-center gap-1.5 text-[11px] text-faint">
          <span className="truncate font-mono">{user.login}</span>
          {user.role === "admin" && <span className="badge badge-accent !px-1.5 !py-0 !text-[10px]">Admin</span>}
          {user.role === "referent" && <span className="badge badge-accent !px-1.5 !py-0 !text-[10px]">Referent</span>}
        </div>
      </div>
      {gestion && IconeGestion && (
        <Link href={gestion.href} className="btn btn-ghost !p-2" title={gestion.label} aria-label={gestion.label}>
          <IconeGestion size={16} />
        </Link>
      )}
      <button onClick={logout} className="btn btn-ghost !p-2 hover:!text-danger" title="Se deconnecter" aria-label="Se deconnecter">
        <LogOut size={16} />
      </button>
    </div>
  );
}
