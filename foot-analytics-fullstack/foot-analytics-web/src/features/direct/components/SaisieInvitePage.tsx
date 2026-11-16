"use client";

// src/features/direct/components/SaisieInvitePage.tsx
//
// La page d'un saisisseur invite : il ouvre son lien (une seule fois), sa session reste sur son appareil, puis il retrouve le direct
// de SON match, et seulement lui. Pas de compte, pas de menu : rien d'autre de l'application n'est atteignable d'ici.

import { useEffect, useMemo, useState } from "react";

import { ApiError } from "@/shared/lib/api";
import { Spinner } from "@/shared/ui/Spinner";

import { appelInvite, garderSessionInvite, lireSessionInvite, oublierSessionInvite, sourceInvite, type SessionInvite } from "../lib/source-direct";
import DirectPage from "./DirectPage";

type Phase = { etape: "ouverture" } | { etape: "pret"; s: SessionInvite } | { etape: "refus"; titre: string; texte: string };

const REFUS_LIEN: Record<number, [string, string]> = {
  404: ["Lien invalide ou expiré", "Ce lien n'est pas valide ou a expiré. Demande-en un nouveau au staff."],
  410: ["Lien déjà utilisé", "Ce lien a déjà été ouvert sur un appareil. Si c'est le tien, rouvre simplement cette page ; sinon demande un nouveau lien."],
};

export function SaisieInvitePage({ jeton }: { jeton?: string }) {
  const [phase, setPhase] = useState<Phase>({ etape: "ouverture" });

  useEffect(() => {
    let vivant = true;
    (async () => {
      const garde = lireSessionInvite();
      if (!jeton) {
        if (garde) { setPhase({ etape: "pret", s: garde }); return; }
        setPhase({ etape: "refus", titre: "Pas d'invitation", texte: "Ouvre le lien que le staff t'a envoyé." });
        return;
      }
      try {
        const r = await appelInvite<SessionInvite>(null, "/ouvrir", { method: "POST", body: JSON.stringify({ jeton }) });
        garderSessionInvite(r);
        // Le jeton du lien n'a plus d'usage : on l'enleve de la barre d'adresse et de l'historique.
        window.history.replaceState(null, "", "/saisie");
        if (vivant) setPhase({ etape: "pret", s: r });
      } catch (e) {
        // Un lien deja consomme par CET appareil (rechargement avant le remplacement de l'adresse) : on reprend sa session.
        if (garde) { window.history.replaceState(null, "", "/saisie"); if (vivant) setPhase({ etape: "pret", s: garde }); return; }
        const statut = e instanceof ApiError ? e.statut : 0;
        const [titre, texte] = REFUS_LIEN[statut] ?? ["Connexion impossible", "Impossible de joindre le serveur. Vérifie ta connexion puis recharge la page."];
        if (vivant) setPhase({ etape: "refus", titre, texte });
      }
    })();
    return () => { vivant = false; };
  }, [jeton]);

  if (phase.etape === "ouverture") return <div className="flex justify-center p-16" role="status" aria-label="Ouverture de l'invitation"><Spinner taille={24} /></div>;
  if (phase.etape === "refus") {
    return (
      <div className="panel mx-4 mt-10 space-y-3 p-6 text-center sm:mx-auto sm:max-w-lg">
        <h1 className="font-display text-xl font-bold text-ink">{phase.titre}</h1>
        <p className="text-sm text-muted">{phase.texte}</p>
      </div>
    );
  }
  return <SaisieOuverte s={phase.s} onFin={(titre, texte) => { oublierSessionInvite(); setPhase({ etape: "refus", titre, texte }); }} />;
}

/** Le direct de l'invite ; si sa session est revoquee ou expiree, il le sait tout de suite et sa session locale est effacee. */
function SaisieOuverte({ s, onFin }: { s: SessionInvite; onFin: (titre: string, texte: string) => void }) {
  const source = useMemo(() => sourceInvite(s.session, s.matchId), [s.session, s.matchId]);
  useEffect(() => {
    let vivant = true;
    const verifier = async () => {
      try { await source.charger(); }
      catch (e) { if (vivant && e instanceof ApiError && e.statut === 401) onFin("Accès terminé", "Ton invitation a expiré ou le staff a coupé l'accès. Demande un nouveau lien si besoin."); }
    };
    void verifier();
    const t = setInterval(() => void verifier(), 10_000);
    return () => { vivant = false; clearInterval(t); };
  }, [source, onFin]);
  return <div className="mx-auto w-full max-w-5xl p-4 pt-5 sm:p-6"><DirectPage matchId={s.matchId} source={source} /></div>;
}
