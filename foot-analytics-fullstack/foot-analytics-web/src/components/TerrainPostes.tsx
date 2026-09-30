// src/components/TerrainPostes.tsx
//
// Visualisation Football Manager : terrain vu de dessus avec des
// pastilles sur les postes ou le joueur a evolue. L'intensite de
// couleur depend du nombre d'apparitions a ce poste, et le chiffre
// au centre du pastille indique le total.
//
// Convention numero -> poste :
//   1  Gardien (GK)
//   2  Defenseur droit (DD)
//   3  Defenseur gauche (DG)
//   4  Defenseur central droit (DCD)
//   5  Defenseur central gauche (DCG)
//   6  Milieu defensif (MD)
//   7  Ailier gauche (AG)
//   8  Milieu central (MC)
//   9  Buteur (BU)
//   10 Milieu offensif (MO)
//   11 Ailier droit (AD)

import React from "react";

interface Props {
  // { "6": 3, "8": 5 } -> ce joueur a porte 3 fois le 6 et 5 fois le 8
  numerosFreq: Record<string, number>;
  // Hauteur en px (la largeur s'adapte au container).
  height?: number;
}

// Coordonnees relatives au viewBox 100 x 140 (terrain vu de dessus,
// camp recevant en bas). L'origine SVG est en haut-gauche, on choisit
// les positions par numero comme une 4-3-3 standard.
// Convention : recevant attaque vers le haut.
const POSTES: Record<number, { x: number; y: number; label: string }> = {
  1:  { x: 50,  y: 124, label: "GK"  },
  2:  { x: 82,  y: 100, label: "DD"  },
  3:  { x: 18,  y: 100, label: "DG"  },
  4:  { x: 62,  y: 102, label: "DCD" },
  5:  { x: 38,  y: 102, label: "DCG" },
  6:  { x: 50,  y: 78,  label: "MD"  },
  7:  { x: 16,  y: 40,  label: "AG"  },
  8:  { x: 36,  y: 62,  label: "MC"  },
  9:  { x: 50,  y: 22,  label: "BU"  },
  10: { x: 64,  y: 62,  label: "MO"  },
  11: { x: 84,  y: 40,  label: "AD"  },
};

export function TerrainPostes({ numerosFreq, height = 360 }: Props) {
  // Liste des numeros utilises (1..11) avec leur frequence pour le SVG.
  const entries: { num: number; count: number; x: number; y: number; label: string }[] = [];
  // Et separement les numeros "hors terrain" (12+) qui sont des dorsaux
  // de remplacants sans poste fixe — on les listera en bas, hors map.
  const horsTerrain: { num: number; count: number }[] = [];
  for (const [k, v] of Object.entries(numerosFreq ?? {})) {
    const num = parseInt(k, 10);
    if (!v) continue;
    const poste = POSTES[num];
    if (poste) entries.push({ num, count: v, x: poste.x, y: poste.y, label: poste.label });
    else horsTerrain.push({ num, count: v });
  }
  horsTerrain.sort((a, b) => a.num - b.num);
  const max = entries.reduce((m, e) => Math.max(m, e.count), 0);
  const total = entries.reduce((s, e) => s + e.count, 0)
              + horsTerrain.reduce((s, e) => s + e.count, 0);

  // Echelle de couleur : du accent pale (1 occurrence) au accent vif (max).
  // L'opacite varie aussi pour faire ressortir le poste principal.
  const opacite = (c: number) => (max <= 1 ? 0.85 : 0.45 + 0.55 * (c / max));
  const rayon = (c: number) => 5 + (max <= 1 ? 0 : 3 * (c / max));

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="h-section">Postes occupes</div>
        <div className="text-xs text-muted tabular-nums">
          {total} apparition{total > 1 ? "s" : ""}
          {entries.length > 0 && (
            <span className="text-faint ml-2">
              · {entries.length} poste{entries.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {entries.length === 0 && horsTerrain.length === 0 ? (
        <p className="text-xs text-faint text-center py-8">
          Aucun numero porte par ce joueur sur les matchs en base.
        </p>
      ) : (
        <svg viewBox="0 0 100 140" style={{ height, width: "100%" }} role="img"
             aria-label="Postes occupes par le joueur">
          {/* Terrain : fond degrade vert + bandes pour effet rayures */}
          <defs>
            <linearGradient id="pitch" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor="rgb(var(--surface-2))"/>
              <stop offset="100%" stopColor="rgb(var(--bg))"/>
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="100" height="140" fill="url(#pitch)" />
          {/* Rayures horizontales */}
          {Array.from({ length: 7 }).map((_, i) => (
            <rect key={i} x="0" y={i * 20} width="100" height="10"
                  fill="rgb(var(--accent))" opacity="0.05" />
          ))}
          {/* Bordures + ligne mediane + rond central */}
          <rect x="2" y="2" width="96" height="136" fill="none"
                stroke="rgb(var(--line-strong))" strokeWidth="0.5" opacity="0.5"/>
          <line x1="2" y1="70" x2="98" y2="70" stroke="rgb(var(--line-strong))"
                strokeWidth="0.4" opacity="0.5"/>
          <circle cx="50" cy="70" r="9" fill="none" stroke="rgb(var(--line-strong))"
                  strokeWidth="0.4" opacity="0.5"/>
          <circle cx="50" cy="70" r="0.6" fill="rgb(var(--line-strong))" opacity="0.5"/>
          {/* Surface de reparation BAS (recevant) */}
          <rect x="22" y="120" width="56" height="18" fill="none"
                stroke="rgb(var(--line-strong))" strokeWidth="0.4" opacity="0.5"/>
          <rect x="34" y="130" width="32" height="8" fill="none"
                stroke="rgb(var(--line-strong))" strokeWidth="0.4" opacity="0.5"/>
          {/* Surface HAUT (visiteur) */}
          <rect x="22" y="2"  width="56" height="18" fill="none"
                stroke="rgb(var(--line-strong))" strokeWidth="0.4" opacity="0.5"/>
          <rect x="34" y="2"  width="32" height="8"  fill="none"
                stroke="rgb(var(--line-strong))" strokeWidth="0.4" opacity="0.5"/>

          {/* Pastilles aux 11 postes : grise par defaut, accent si occupe. */}
          {Object.entries(POSTES).map(([k, poste]) => {
            const num = parseInt(k, 10);
            const e = entries.find((x) => x.num === num);
            const count = e?.count ?? 0;
            const occupe = count > 0;
            const r = occupe ? rayon(count) : 3;
            return (
              <g key={num}>
                {occupe && count === max && max > 1 && (
                  <circle
                    cx={poste.x} cy={poste.y} r={r + 2.5}
                    fill="none" stroke="rgb(var(--accent))" strokeWidth="0.4"
                    opacity="0.45"
                  />
                )}
                <circle
                  cx={poste.x} cy={poste.y} r={r}
                  fill={occupe ? "rgb(var(--accent))" : "rgb(var(--faint))"}
                  opacity={occupe ? opacite(count) : 0.22}
                  stroke="rgb(var(--bg))" strokeWidth="0.4"
                />
                {occupe && (
                  <text
                    x={poste.x} y={poste.y + 1.4}
                    textAnchor="middle"
                    fontSize="3.6"
                    fontWeight="700"
                    fill="rgb(var(--bg))"
                    style={{ fontFamily: "var(--font-mono, monospace)" }}
                  >{count}</text>
                )}
              </g>
            );
          })}
        </svg>
      )}

      {(entries.length > 0 || horsTerrain.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {entries
            .slice()
            .sort((a, b) => b.count - a.count)
            .map((e) => (
              <span key={e.num} className="badge text-[10px]">
                #{e.num} {e.label} <span className="text-faint">×{e.count}</span>
              </span>
            ))}
          {horsTerrain.map((e) => (
            <span key={e.num} className="badge text-[10px] opacity-70">
              #{e.num} <span className="text-faint">×{e.count}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
