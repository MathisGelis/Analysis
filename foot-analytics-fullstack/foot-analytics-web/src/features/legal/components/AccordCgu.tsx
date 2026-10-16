"use client";
// src/features/legal/components/AccordCgu.tsx
//
// Acceptation des conditions d'utilisation : tant que le compte n'a pas accepte la version courante (VERSION_CGU),
// une fenetre bloquante la presente. L'acceptation (version + date) est enregistree par l'API (POST /auth/cgu) et
// tracee dans le journal d'audit.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileCheck2, LogOut } from "lucide-react";

import { api, messageApi } from "@/shared/lib/api";
import { deconnecter } from "@/features/auth/lib/auth";
import { useUtilisateur } from "@/features/auth/lib/session-context";

import { doitAccepterCgu, VERSION_CGU } from "../lib/legal";

export function AccordCgu() {
  const router = useRouter();
  const utilisateur = useUtilisateur();
  const [accepte, setAccepte] = useState(false);
  const [coche, setCoche] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  if (accepte || !doitAccepterCgu(utilisateur)) return null;

  async function accepter() {
    setEnvoi(true); setErreur(null);
    try {
      await api.accepterCgu(VERSION_CGU);
      setAccepte(true);
      router.refresh();
    } catch (e) {
      setErreur(messageApi(e, "Enregistrement impossible"));
      setEnvoi(false);
    }
  }

  return (
    <div className="fixed inset-0 z-80 grid place-items-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      role="dialog" aria-modal="true" aria-labelledby="titre-cgu">
      <div className="panel w-full max-w-md space-y-4 p-6 shadow-pop">
        <h2 id="titre-cgu" className="flex items-center gap-2 font-display text-xl font-bold text-ink">
          <FileCheck2 size={18} className="text-accent" /> Conditions d'utilisation
        </h2>
        <p className="text-sm leading-relaxed text-muted">
          {utilisateur?.cguVersion ? "Les conditions d'utilisation ont change." : "Bienvenue."} Avant de continuer, lis les{" "}
          <Link href="/cgu" target="_blank" className="text-accent underline underline-offset-2">conditions d'utilisation</Link> et la{" "}
          <Link href="/confidentialite" target="_blank" className="text-accent underline underline-offset-2">politique de confidentialite</Link>.
          En bref : donnees reservees a la preparation sportive du club, compte personnel, pas d'extraction massive, et des
          statistiques qui restent une aide a la decision.
        </p>
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" className="mt-1" checked={coche} onChange={(e) => setCoche(e.target.checked)} />
          <span>J'ai lu et j'accepte les conditions d'utilisation (version {VERSION_CGU}).</span>
        </label>
        {erreur && <p role="alert" className="text-sm text-danger">{erreur}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn" onClick={() => void deconnecter()}>
            <LogOut size={14} /> Me deconnecter
          </button>
          <button type="button" className="btn btn-accent" disabled={!coche || envoi} onClick={accepter}>
            {envoi ? "Enregistrement..." : "Accepter et continuer"}
          </button>
        </div>
      </div>
    </div>
  );
}
