// src/features/shell/components/Logo.tsx
//
// Marque de l'application : un carre arrondi degrade violet -> bleu, traverse
// par les lignes d'un terrain (rond central + ligne mediane). Les couleurs
// viennent des variables du theme.

import { useId } from "react";

export function Logo({ size = 40, className = "" }: { size?: number; className?: string }) {
  // Identifiant unique par instance : plusieurs logos coexistent (barre laterale,
  // tiroir mobile) et un degrade defini dans un SVG masque (display: none) n'est
  // pas resolu par les autres, qui s'affichaient alors sans fond.
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`fa-logo-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "rgb(var(--accent-strong))" }} />
          <stop offset="1" style={{ stopColor: "rgb(var(--accent-2))" }} />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="12" fill={`url(#fa-logo-${id})`} />
      <g fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".95">
        <circle cx="20" cy="20" r="7.5" />
        <path d="M20 7v26" />
        <path d="M7 14.5h4.5v11H7M33 14.5h-4.5v11H33" opacity=".7" />
      </g>
      <circle cx="20" cy="20" r="2" fill="#fff" />
    </svg>
  );
}
