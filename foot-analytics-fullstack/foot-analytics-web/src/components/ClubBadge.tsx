"use client";
// src/components/ClubBadge.tsx
//
// Ecusson de club genere (SVG) : initiales du nom, teinte et motif determines
// par l'identifiant du club, couleurs prises sur les variables du theme (suit
// le mode clair / sombre). Un club qui a une vraie couleur en base (jeu de
// demo) la garde. Un club inconnu du layout affiche un ecusson neutre "?".

import { useClub } from "@/lib/clubs-context";
import { identiteClub } from "@/lib/club-identite";
import { getClub } from "@/data/demo";

interface Props {
  clubId: string;
  size?: number;
  className?: string;
}

// Forme de l'ecusson (viewBox 32x32) et ses quatre motifs, decoupes dans la forme.
const ECU = "M16 2 L28 6.5 V16 C28 22.5 22.8 27.6 16 30 C9.2 27.6 4 22.5 4 16 V6.5 Z";
const MOTIFS = [
  null,                                            // 0 : uni
  <rect key="m1" x="0" y="13" width="32" height="6" />,          // 1 : bandeau
  <rect key="m2" x="16" y="0" width="16" height="32" />,         // 2 : ecartele
  <path key="m3" d="M4 8 L16 16 L28 8 V14 L16 22 L4 14 Z" />,   // 3 : chevron
];

export function ClubBadge({ clubId, size = 28, className = "" }: Props) {
  const club = useClub(clubId) ?? getClub(clubId);
  const id = identiteClub(club ?? { id: clubId, nom: "" });
  const inconnu = !club;

  // Couleurs : variables du theme, ou couleur perso (hex) du club.
  const couleur = id.couleurPerso ?? `rgb(var(--${inconnu ? "faint" : id.teinte}))`;
  const remplissage = id.couleurPerso ? `${id.couleurPerso}26` : `rgb(var(--${inconnu ? "faint" : id.teinte}) / .16)`;
  const motif = MOTIFS[id.motif];
  const clipId = `ecu-${clubId}`.replace(/[^a-zA-Z0-9_-]/g, "");
  const initiales = inconnu ? "?" : id.initiales;
  const taillePolice = initiales.length >= 3 ? 8.5 : 10.5;

  return (
    <span
      role="img"
      aria-label={club?.nom ?? "Club inconnu"}
      title={club?.nom ?? "Club inconnu"}
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
        <defs>
          <clipPath id={clipId}><path d={ECU} /></clipPath>
        </defs>
        {/* Fond de l'ecusson + motif decoupe dedans */}
        <path d={ECU} fill="rgb(var(--surface-2))" />
        <path d={ECU} fill={remplissage} />
        {motif && (
          <g clipPath={`url(#${clipId})`} fill={couleur} opacity="0.28">{motif}</g>
        )}
        <path d={ECU} fill="none" stroke={couleur} strokeWidth="1.5" strokeLinejoin="round" />
        <text
          x="16" y="19.6" textAnchor="middle"
          fontFamily="Geist, Inter, sans-serif" fontWeight="800"
          fontSize={taillePolice} letterSpacing="0.3" fill={couleur}
        >
          {initiales}
        </text>
      </svg>
    </span>
  );
}
