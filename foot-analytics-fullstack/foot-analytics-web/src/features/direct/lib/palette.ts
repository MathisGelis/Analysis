"use client";

// src/features/direct/lib/palette.ts
//
// La palette des maquettes du direct (vert citron sur bleu nuit) : l'attribut data-direct est pose sur <html> tant que l'ecran est
// ouvert, car les feuilles passent par un portail hors de la page (voir globals.css).

import { useEffect } from "react";

export function usePaletteDirect() {
  useEffect(() => {
    document.documentElement.setAttribute("data-direct", "");
    return () => document.documentElement.removeAttribute("data-direct");
  }, []);
}
