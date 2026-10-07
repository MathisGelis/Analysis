// src/features/joueurs/components/CorpsHumain.tsx
//
// Silhouette frontale style FM/EA Sports avec points rouges sur les
// zones blessees. Le mapping localisation -> coordonnees fait
// correspondre les libelles FFF/FMI a une position du corps.

interface Blessure {
  id: string;
  localisation?: string | null;
  statut?: string | null;
  dateDebut?: string | null;
  retourEstime?: string | null;
}

// Coordonnees (viewBox 100 x 200) sur la silhouette.
// Les zones absentes (genou inconnu...) tombent sur "torse".
const ZONES: Record<string, { x: number; y: number }> = {
  // Tete
  tete: { x: 50, y: 22 },
  cou: { x: 50, y: 38 },
  // Tronc
  epaule_gauche: { x: 36, y: 50 },
  epaule_droite: { x: 64, y: 50 },
  torse: { x: 50, y: 70 },
  dos: { x: 50, y: 70 },
  abdomen: { x: 50, y: 88 },
  cotes: { x: 42, y: 75 },
  // Bras
  bras_gauche: { x: 28, y: 75 },
  bras_droit: { x: 72, y: 75 },
  coude_gauche: { x: 26, y: 92 },
  coude_droit: { x: 74, y: 92 },
  poignet_gauche: { x: 22, y: 110 },
  poignet_droit: { x: 78, y: 110 },
  main_gauche: { x: 20, y: 120 },
  main_droite: { x: 80, y: 120 },
  // Hanches
  hanche_gauche: { x: 42, y: 102 },
  hanche_droite: { x: 58, y: 102 },
  bassin: { x: 50, y: 105 },
  aine: { x: 50, y: 110 },
  pubis: { x: 50, y: 110 },
  // Cuisses
  cuisse_gauche: { x: 42, y: 130 },
  cuisse_droite: { x: 58, y: 130 },
  // Genoux
  genou_gauche: { x: 42, y: 152 },
  genou_droit: { x: 58, y: 152 },
  // Mollets / tibias
  mollet_gauche: { x: 42, y: 170 },
  mollet_droit: { x: 58, y: 170 },
  tibia_gauche: { x: 42, y: 170 },
  tibia_droit: { x: 58, y: 170 },
  // Chevilles / pieds
  cheville_gauche: { x: 42, y: 186 },
  cheville_droite: { x: 58, y: 186 },
  pied_gauche: { x: 42, y: 194 },
  pied_droit: { x: 58, y: 194 },
};

const ALIAS: Record<string, string> = {
  // mappings approximatifs depuis libelles FFF/FMI courants
  "tete": "tete", "cou": "cou", "nuque": "cou",
  "epaule": "epaule_droite", "clavicule": "epaule_droite",
  "thorax": "torse", "poitrine": "torse", "dos": "dos",
  "abdo": "abdomen", "ventre": "abdomen", "abdomen": "abdomen",
  "cote": "cotes", "cotes": "cotes",
  "bras": "bras_droit", "biceps": "bras_droit", "triceps": "bras_droit",
  "coude": "coude_droit", "poignet": "poignet_droit", "main": "main_droite", "doigt": "main_droite",
  "hanche": "hanche_droite", "bassin": "bassin",
  "aine": "aine", "pubis": "pubis", "adducteurs": "aine",
  "cuisse": "cuisse_droite", "ischio": "cuisse_droite", "quadriceps": "cuisse_droite",
  "genou": "genou_droit", "rotule": "genou_droit", "ligament": "genou_droit", "menisque": "genou_droit",
  "mollet": "mollet_droit", "tibia": "tibia_droit", "fibula": "tibia_droit",
  "cheville": "cheville_droite", "pied": "pied_droit",
  "talon": "pied_droit", "metatarse": "pied_droit", "orteil": "pied_droit",
};

function resolveZone(loc?: string | null) {
  if (!loc) return null;
  const norm = loc.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  // Match exact
  if (ZONES[norm.replace(/\s+/g, "_")]) return ZONES[norm.replace(/\s+/g, "_")];
  // Match cote precise (gauche/droite/g/d)
  const cote = / gauche$| g$| left$/.test(" " + norm) ? "gauche"
    : / droite?$| droit$| d$| right$/.test(" " + norm) ? "droit" : null;
  const sansCote = norm.replace(/ (gauche|droite?|droit|g|d|left|right)$/, "").trim();
  // Match par mot-clef dans alias
  for (const k of Object.keys(ALIAS)) {
    if (sansCote.includes(k)) {
      let key = ALIAS[k];
      if (cote === "gauche") key = key.replace("_droit", "_gauche").replace("_droite", "_gauche");
      else if (cote === "droit") key = key.replace("_gauche", "_droit").replace("_gauches", "_droite");
      return ZONES[key] ?? ZONES[ALIAS[k]] ?? null;
    }
  }
  return null;
}

export function CorpsHumain({ blessures, height = 360 }: { blessures: Blessure[]; height?: number }) {
  const points = blessures
    .map((b) => ({ ...b, _pos: resolveZone(b.localisation) }))
    .filter((b) => b._pos !== null);

  // Couleur du point : rouge si blessure en cours, gris si terminee.
  const isEnCours = (statut?: string | null) => {
    if (!statut) return true;  // statut inconnu = on suppose en cours
    const s = statut.toLowerCase();
    return !s.includes("retabli") && !s.includes("guerie") && !s.includes("termine") && !s.includes("ok");
  };

  return (
    <div className="relative" style={{ height }}>
      <svg viewBox="0 0 100 200" style={{ height: "100%", width: "100%" }}
        role="img" aria-label="Silhouette montrant les blessures">
        <defs>
          <radialGradient id="body" cx="50%" cy="30%" r="70%">
            <stop offset="0%" stopColor="rgb(var(--surface-2))" />
            <stop offset="100%" stopColor="rgb(var(--bg))" />
          </radialGradient>
        </defs>
        {/* Tete */}
        <circle cx="50" cy="20" r="10" fill="url(#body)" stroke="rgb(var(--line-strong))" strokeWidth="0.5"/>
        {/* Cou */}
        <rect x="46" y="29" width="8" height="6" fill="url(#body)" stroke="rgb(var(--line-strong))" strokeWidth="0.4"/>
        {/* Tronc */}
        <path d="M 32 38 Q 32 36 36 36 L 64 36 Q 68 36 68 38 L 68 100 L 32 100 Z"
              fill="url(#body)" stroke="rgb(var(--line-strong))" strokeWidth="0.5"/>
        {/* Bras gauche */}
        <path d="M 32 40 Q 24 40 22 50 L 18 90 Q 17 100 19 115 L 22 122 L 26 122 L 24 115 Q 24 100 26 90 L 30 50 Z"
              fill="url(#body)" stroke="rgb(var(--line-strong))" strokeWidth="0.5"/>
        {/* Bras droit */}
        <path d="M 68 40 Q 76 40 78 50 L 82 90 Q 83 100 81 115 L 78 122 L 74 122 L 76 115 Q 76 100 74 90 L 70 50 Z"
              fill="url(#body)" stroke="rgb(var(--line-strong))" strokeWidth="0.5"/>
        {/* Bassin */}
        <path d="M 32 100 L 68 100 L 64 115 L 36 115 Z"
              fill="url(#body)" stroke="rgb(var(--line-strong))" strokeWidth="0.5"/>
        {/* Cuisse gauche */}
        <path d="M 36 115 L 47 115 L 46 155 L 38 155 Z"
              fill="url(#body)" stroke="rgb(var(--line-strong))" strokeWidth="0.5"/>
        {/* Cuisse droite */}
        <path d="M 53 115 L 64 115 L 62 155 L 54 155 Z"
              fill="url(#body)" stroke="rgb(var(--line-strong))" strokeWidth="0.5"/>
        {/* Jambe gauche */}
        <path d="M 38 155 L 46 155 L 45 188 L 39 188 Z"
              fill="url(#body)" stroke="rgb(var(--line-strong))" strokeWidth="0.5"/>
        {/* Jambe droite */}
        <path d="M 54 155 L 62 155 L 61 188 L 55 188 Z"
              fill="url(#body)" stroke="rgb(var(--line-strong))" strokeWidth="0.5"/>
        {/* Pied gauche */}
        <ellipse cx="42" cy="193" rx="5" ry="3" fill="url(#body)" stroke="rgb(var(--line-strong))" strokeWidth="0.4"/>
        {/* Pied droit */}
        <ellipse cx="58" cy="193" rx="5" ry="3" fill="url(#body)" stroke="rgb(var(--line-strong))" strokeWidth="0.4"/>

        {/* Points blessures */}
        {points.map((b) => {
          const enCours = isEnCours(b.statut);
          return (
            <g key={b.id}>
              {enCours && (
                <circle cx={b._pos!.x} cy={b._pos!.y} r="5"
                  fill="rgb(var(--danger))" opacity="0.25">
                  <animate attributeName="r" values="3;6;3" dur="2s" repeatCount="indefinite"/>
                  <animate attributeName="opacity" values="0.35;0.1;0.35" dur="2s" repeatCount="indefinite"/>
                </circle>
              )}
              <circle cx={b._pos!.x} cy={b._pos!.y} r="2.5"
                fill={enCours ? "rgb(var(--danger))" : "rgb(var(--muted))"}
                stroke="rgb(var(--bg))" strokeWidth="0.4">
                <title>
                  {b.localisation ?? "?"}
                  {b.dateDebut ? ` — ${b.dateDebut}` : ""}
                  {b.statut ? ` (${b.statut})` : ""}
                </title>
              </circle>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
