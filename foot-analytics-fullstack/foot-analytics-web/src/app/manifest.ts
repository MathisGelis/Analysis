// src/app/manifest.ts
//
// Manifeste de l'application installable (PWA), servi en /manifest.webmanifest. Une fois installee (ecran d'accueil du
// telephone, ou « Installer » dans Chrome / Edge), elle s'ouvre en mode standalone : sans la barre du navigateur. Voir
// aussi public/sw.js (page hors ligne) et features/shell/components/EnregistrementPwa.tsx.

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Foot Analytics",
    short_name: "Foot Analytics",
    description: "Analyse et suivi de saison pour staff de football amateur.",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // Fond de l'ecran de lancement et barre d'etat : le bleu nuit de l'application.
    background_color: "#070A12",
    theme_color: "#070A12",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
