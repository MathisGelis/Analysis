"use client";
// src/components/UserBadge.tsx
//
// Badge utilisateur affiche en bas de la sidebar : nom + login + lien
// admin (si role=admin) + bouton deconnexion.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearSession, getCachedUser, User } from "@/lib/auth";
import { LogOut, ShieldCheck } from "lucide-react";

export function UserBadge() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => { setUser(getCachedUser()); }, []);

  function logout() {
    clearSession();
    router.replace("/login");
  }

  if (!user) {
    return (
      <div className="px-3 py-2 border-t border-line text-xs text-faint">
        Non connecte
      </div>
    );
  }

  return (
    <div className="px-3 py-2 border-t border-line space-y-2">
      <div className="text-xs">
        <div className="font-mono font-bold text-ink truncate">{user.login}</div>
        <div className="text-[10px] text-faint truncate">
          {user.prenom} {user.nom}
          {user.role === "admin" && (
            <span className="ml-1 badge text-[8px] badge-turf">ADMIN</span>
          )}
        </div>
      </div>
      <div className="flex gap-1">
        {user.role === "admin" && (
          <Link href="/admin/utilisateurs"
            className="btn text-[10px] flex items-center gap-1 flex-1 justify-center"
            title="Administration">
            <ShieldCheck size={10}/> Admin
          </Link>
        )}
        <button onClick={logout}
          className="btn text-[10px] flex items-center gap-1 flex-1 justify-center text-danger"
          title="Se deconnecter">
          <LogOut size={10}/> Sortir
        </button>
      </div>
    </div>
  );
}
