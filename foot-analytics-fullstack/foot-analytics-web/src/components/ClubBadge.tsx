// src/components/ClubBadge.tsx
//
// Badge de club genere dynamiquement (SVG). Gradient de fond utilise les
// CSS vars du theme pour suivre dark/light. La couleur club reste fixe
// (c'est l'identite visuelle).

import { getClub } from "@/data/demo";

interface Props {
  clubId: string;
  size?: number;
  className?: string;
}

export function ClubBadge({ clubId, size = 28, className = "" }: Props) {
  const club = getClub(clubId);
  if (!club) return null;
  const initials = (club.abbr ?? club.nom.slice(0, 3)).toUpperCase();
  const fg = club.couleur;
  return (
    <div
      className={`inline-flex items-center justify-center rounded-md border ${className}`}
      style={{
        width: size,
        height: size,
        // Gradient adaptatif : utilise surface + surface-2 du theme courant.
        background: "linear-gradient(160deg, rgb(var(--surface-2)), rgb(var(--surface)))",
        borderColor: fg + "60",
        boxShadow: `inset 0 0 0 1px ${fg}20, 0 0 12px -6px ${fg}80`,
      }}
      title={club.nom}
    >
      <svg viewBox="0 0 32 32" width={size * 0.7} height={size * 0.7}>
        <defs>
          <linearGradient id={`g-${clubId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fg} stopOpacity="1" />
            <stop offset="100%" stopColor={fg} stopOpacity="0.4" />
          </linearGradient>
        </defs>
        <path
          d="M16 1 L29 6 V16 C29 23 23 28.5 16 31 C9 28.5 3 23 3 16 V6 Z"
          fill="none"
          stroke={`url(#g-${clubId})`}
          strokeWidth="1.6"
        />
        <text
          x="16" y="20" textAnchor="middle"
          fontFamily="Geist, sans-serif"
          fontSize="10" fontWeight="800" fill={fg}
          letterSpacing="0.5"
        >
          {initials.slice(0, 3)}
        </text>
      </svg>
    </div>
  );
}
