// src/features/equipes/lib/own-equipe-context.tsx
"use client";

// Contexte React qui transporte l'equipeId et le saisonId
// selectionnes par le coach (depuis la sidebar). Mis a jour par le
// composant OwnEquipeSwitcher quand l'utilisateur change.

import { createContext, useContext, useState, useCallback, useEffect } from "react";

interface Ctx {
  equipeId: string | null;
  saisonId: string | null;
  setEquipe: (equipeId: string | null, saisonId: string | null) => void;
}

const C = createContext<Ctx>({
  equipeId: null, saisonId: null, setEquipe: () => {},
});

export function OwnEquipeProvider({
  initialEquipeId, initialSaisonId, children,
}: {
  initialEquipeId: string | null;
  initialSaisonId: string | null;
  children: React.ReactNode;
}) {
  const [equipeId, setEquipeId] = useState<string | null>(initialEquipeId);
  const [saisonId, setSaisonId] = useState<string | null>(initialSaisonId);

  // Garde le state synchro si le serveur change les cookies entre les
  // navigations (ex. apres api/own-equipe).
  useEffect(() => { setEquipeId(initialEquipeId); }, [initialEquipeId]);
  useEffect(() => { setSaisonId(initialSaisonId); }, [initialSaisonId]);

  const setEquipe = useCallback((eid: string | null, sid: string | null) => {
    setEquipeId(eid); setSaisonId(sid);
  }, []);

  return <C.Provider value={{ equipeId, saisonId, setEquipe }}>{children}</C.Provider>;
}

export function useOwnEquipe() {
  return useContext(C);
}
