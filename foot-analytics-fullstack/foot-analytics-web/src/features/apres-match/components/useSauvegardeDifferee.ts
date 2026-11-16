"use client";

// src/features/apres-match/components/useSauvegardeDifferee.ts
//
// Enregistrer ce qu'on tape sans bouton : chaque cle (un joueur, un arbitre) attend 600 ms de calme, puis part. `enAttente` dit
// s'il reste quelque chose a envoyer ; `vider` envoie tout de suite (bouton « Enregistrer »).

import { useCallback, useEffect, useRef, useState } from "react";

const CALME_MS = 600;

export function useSauvegardeDifferee() {
  const taches = useRef(new Map<string, { minuteur: ReturnType<typeof setTimeout>; envoyer: () => Promise<void> }>());
  const [enAttente, setEnAttente] = useState(0);
  const [enCours, setEnCours] = useState(0);

  const lancer = useCallback(async (envoyer: () => Promise<void>) => {
    setEnCours((n) => n + 1);
    try { await envoyer(); } finally { setEnCours((n) => n - 1); }
  }, []);

  const programmer = useCallback((cle: string, envoyer: () => Promise<void>) => {
    const ancienne = taches.current.get(cle);
    if (ancienne) clearTimeout(ancienne.minuteur);
    const minuteur = setTimeout(() => { taches.current.delete(cle); setEnAttente(taches.current.size); void lancer(envoyer); }, CALME_MS);
    taches.current.set(cle, { minuteur, envoyer });
    setEnAttente(taches.current.size);
  }, [lancer]);

  const vider = useCallback(async () => {
    const toutes = [...taches.current.values()];
    taches.current.clear();
    setEnAttente(0);
    toutes.forEach((t) => clearTimeout(t.minuteur));
    await Promise.all(toutes.map((t) => lancer(t.envoyer)));
  }, [lancer]);

  useEffect(() => () => { taches.current.forEach((t) => clearTimeout(t.minuteur)); }, []);
  return { programmer, vider, enAttente, enCours };
}
