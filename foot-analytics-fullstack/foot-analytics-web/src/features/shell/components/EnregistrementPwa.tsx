"use client";
// src/features/shell/components/EnregistrementPwa.tsx
//
// Enregistre le service worker de l'application installable (public/sw.js : page hors ligne seulement). En production
// uniquement : en developpement, il ferait servir des pages perimees apres chaque modification.

import { useEffect } from "react";

export function EnregistrementPwa() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Sans service worker, le site marche normalement (seule la page hors ligne manque).
    });
  }, []);
  return null;
}
