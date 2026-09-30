// src/components/Pitch.tsx
//
// Terrain vu de dessus avec joueurs disposes selon une formation textuelle.
// Toutes les couleurs utilisent les CSS vars du theme.

export interface JoueurTerrain {
  numero: number;
  nom: string;
  carton?: "jaune" | "rouge";
  capitaine?: boolean;
  /** Pastille de statut de mutation : "M" (mute) ou "HD" (mute hors delai). */
  marque?: "M" | "HD" | null;
  /** Indisponible (blesse, suspendu) : contour rouge, nom barre. */
  indisponible?: boolean;
}

interface PitchProps {
  formation: string | null | undefined;       // ex. "4-2-3-1" ; null = dispositif inconnu (4-4-2 par defaut)
  /**
   * Un joueur par poste, dans l'ordre du terrain (gardien d'abord). `null` = poste vide (cercle en
   * pointilles) ; au-dela de la fin du tableau, rien n'est dessine.
   */
  joueurs: (JoueurTerrain | null)[];
  /** Libelles des postes vides ("GB", "DEF 1"...), dans le meme ordre. */
  libellesPostes?: string[];
  /** Rend les postes cliquables (et focusables au clavier) : composition interactive. */
  onSelectionne?: (index: number) => void;
  indexSelectionne?: number | null;
  couleur?: string;
  titre?: string;
  oriente?: "haut" | "bas";
}

/** Dispositif utilise quand la formation est absente ou illisible. */
const FORMATION_DEFAUT = "4-4-2";

function parseFormation(f: string | null | undefined): number[] {
  const lignes = (f ?? FORMATION_DEFAUT)
    .split(/[-\s]+/).map((n) => +n).filter((n) => n > 0);
  // Chaine non vide mais illisible ("?", "n/a") : repli sur le defaut.
  if (lignes.length === 0) return [1, 4, 4, 2];
  return [1, ...lignes];  // ajoute le gardien
}

export function Pitch({
  formation, joueurs, libellesPostes, onSelectionne, indexSelectionne, couleur = "rgb(var(--accent))", titre, oriente = "haut",
}: PitchProps) {
  const lignes = parseFormation(formation);
  const formationConnue = !!formation && formation.trim().length > 0;
  const formationAffichee = formationConnue ? formation : `${FORMATION_DEFAUT} (par defaut)`;
  const W = 320, H = 460;
  const padT = 24, padB = 24;
  const usable = H - padT - padB;
  const placements: { x: number; y: number; lineIndex: number; idx: number }[] = [];
  lignes.forEach((nb, li) => {
    const y = padT + (usable * (li + 0.5)) / lignes.length;
    for (let i = 0; i < nb; i++) {
      const x = (W * (i + 1)) / (nb + 1);
      placements.push({ x, y: oriente === "haut" ? y : H - y, lineIndex: li, idx: i });
    }
  });

  return (
    <div className="panel p-3">
      {titre && (
        <div className="flex items-center justify-between mb-2">
          <div className="h-section">{titre}</div>
          <span className="badge badge-accent">{formationAffichee}</span>
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-md">
        <defs>
          {/* Pelouse : utilise --surface-2 et --bg du theme */}
          <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--surface-2))" />
            <stop offset="100%" stopColor="rgb(var(--bg))" />
          </linearGradient>
          <pattern id="stripes" width="40" height="40" patternUnits="userSpaceOnUse">
            <rect width="40" height="40" fill="url(#grass)" />
            <rect width="40" height="20" fill="rgb(var(--accent) / 0.03)" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#stripes)" />
        {/* Lignes du terrain : couleur --line-strong pour lisibilite. */}
        <g stroke="rgb(var(--line-strong))" strokeWidth="1" fill="none">
          <rect x="6" y="6" width={W - 12} height={H - 12} />
          <line x1="6" x2={W - 6} y1={H / 2} y2={H / 2} />
          <circle cx={W / 2} cy={H / 2} r="40" />
          <rect x={(W - 140) / 2} y="6" width="140" height="56" />
          <rect x={(W - 60) / 2} y="6" width="60" height="20" />
          <rect x={(W - 140) / 2} y={H - 62} width="140" height="56" />
          <rect x={(W - 60) / 2} y={H - 26} width="60" height="20" />
        </g>
        {/* Joueurs : couleur rouge/amber selon carton, sinon accent */}
        {placements.map((p, i) => {
          const j = joueurs[i];
          if (j === undefined) return null;
          const interactif = !!onSelectionne;
          const choisi = indexSelectionne === i;
          const groupe = {
            transform: `translate(${p.x},${p.y})`,
            ...(interactif ? {
              role: "button" as const, tabIndex: 0, style: { cursor: "pointer", outline: "none" },
              "aria-label": j ? `${j.nom}, poste ${i + 1}` : `Poste ${libellesPostes?.[i] ?? i + 1} vide`,
              "aria-pressed": choisi,
              onClick: () => onSelectionne!(i),
              onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectionne!(i); } },
            } : {}),
          };
          if (!j) {
            return (
              <g key={i} {...groupe}>
                {choisi && <circle r="18" fill="none" stroke="rgb(var(--accent))" strokeWidth="1.5" opacity=".7" />}
                <circle r="13" fill="rgb(var(--bg))" stroke="rgb(var(--line-strong))" strokeWidth="1.5" strokeDasharray="3 3" />
                <text textAnchor="middle" dy="4" fontSize="13" fill="rgb(var(--faint))">+</text>
                <text textAnchor="middle" y="26" fontSize="8" fontWeight="600" fill="rgb(var(--faint))"
                  fontFamily="'Bricolage Grotesque Variable', ui-sans-serif, sans-serif">{libellesPostes?.[i] ?? ""}</text>
              </g>
            );
          }
          const c = j.indisponible || j.carton === "rouge" ? "rgb(var(--danger))"
            : j.carton === "jaune" ? "rgb(var(--amber))" : couleur;
          return (
            <g key={i} {...groupe}>
              {choisi && <circle r="18" fill="none" stroke="rgb(var(--accent))" strokeWidth="1.5" opacity=".7" />}
              <circle r="13" fill="rgb(var(--bg))" stroke={c} strokeWidth="2" />
              <text textAnchor="middle" dy="3.6" fontSize="11" fontWeight="700"
                fill={c} fontFamily="'Bricolage Grotesque Variable', ui-sans-serif, sans-serif">
                {j.numero}
              </text>
              <text textAnchor="middle" y="26" fontSize="8.5" fontWeight="600"
                fill="rgb(var(--ink))" textDecoration={j.indisponible ? "line-through" : undefined}
                fontFamily="'Bricolage Grotesque Variable', ui-sans-serif, sans-serif">
                {j.nom.split(" ")[0].slice(0, 9)}
                {j.capitaine && (
                  <tspan dx="2" fill="rgb(var(--amber))" fontSize="7">(C)</tspan>
                )}
              </text>
              {j.marque && (
                <g transform="translate(8,-19)">
                  <rect x="-1" y="-7" width={j.marque === "HD" ? 17 : 12} height="11" rx="5.5"
                    fill={j.marque === "HD" ? "rgb(var(--danger))" : "rgb(var(--amber))"} stroke="rgb(var(--bg))" strokeWidth="1.5" />
                  <text x={j.marque === "HD" ? 7.5 : 5} y="1.2" textAnchor="middle" fontSize="6.5" fontWeight="800" fill="rgb(var(--bg))"
                    fontFamily="'Bricolage Grotesque Variable', ui-sans-serif, sans-serif">{j.marque}</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
