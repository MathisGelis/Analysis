// src/shared/ui/LegendeColonnes.tsx
//
// Légende des abréviations d'un tableau (Mat., Titu, B, PD, CJ, CR) : une ligne sous le tableau, lisible sur mobile où l'infobulle
// d'un en-tête n'existe pas, et la même <abbr> pour les en-têtes eux-mêmes (`Abreviation`).

export const SENS_ABREVIATIONS = {
  "Mat.": "matchs joués",
  Titu: "titularisations",
  Min: "minutes jouées",
  B: "buts",
  PD: "passes décisives",
  CJ: "cartons jaunes",
  CR: "cartons rouges",
  "V-N-D": "victoires, nuls, défaites",
  "% V": "pourcentage de victoires",
} as const;

export type Abreviation = keyof typeof SENS_ABREVIATIONS;

/** L'abréviation, avec son sens en infobulle (et pour les lecteurs d'écran). */
export function Abr({ k, children }: { k: Abreviation; children?: React.ReactNode }) {
  return <abbr title={SENS_ABREVIATIONS[k]} className="cursor-help no-underline">{children ?? k}</abbr>;
}

/** « Mat. matchs joués · B buts · … » sous un tableau. */
export function LegendeColonnes({ abreviations, className = "" }: { abreviations: Abreviation[]; className?: string }) {
  return (
    <p className={`mt-3 text-[11px] leading-relaxed text-faint ${className}`} data-testid="legende-colonnes">
      {abreviations.map((k, i) => (
        <span key={k}>
          {i > 0 && " · "}
          <span className="font-semibold text-muted">{k}</span> {SENS_ABREVIATIONS[k]}
        </span>
      ))}
    </p>
  );
}
