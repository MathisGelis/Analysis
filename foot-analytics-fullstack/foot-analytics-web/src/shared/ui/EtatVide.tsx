// src/shared/ui/EtatVide.tsx
//
// État vide d'une liste : dit pourquoi il n'y a rien, et propose le geste qui y remédie (un bouton ou un lien), au lieu d'un
// tableau réduit à ses en-têtes.

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface Props {
  icone: LucideIcon;
  titre: string;
  message: string;
  action?: { libelle: string; onClick?: () => void; href?: string; icone?: LucideIcon };
  /** Action secondaire, discrète (par exemple « Effacer le filtre »). */
  secondaire?: { libelle: string; onClick: () => void };
  "data-testid"?: string;
}

export function EtatVide({ icone: Icone, titre, message, action, secondaire, "data-testid": testId }: Props) {
  const IconeAction = action?.icone;
  const contenuAction = action && (
    <>{IconeAction && <IconeAction size={14} />} {action.libelle}</>
  );
  return (
    <div className="py-10 text-center" data-testid={testId}>
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-accent/15">
        <Icone size={22} className="text-accent" aria-hidden />
      </div>
      <h2 className="font-display text-lg font-semibold text-ink">{titre}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted">{message}</p>
      {(action || secondaire) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action && (action.href
            ? <Link href={action.href} className="btn btn-primary">{contenuAction}</Link>
            : <button type="button" className="btn btn-primary" onClick={action.onClick}>{contenuAction}</button>)}
          {secondaire && <button type="button" className="btn btn-ghost" onClick={secondaire.onClick}>{secondaire.libelle}</button>}
        </div>
      )}
    </div>
  );
}
