// src/features/medical/components/ResumeBlessuresView.tsx
//
// Les blocs du resume medical d'une saison : chiffres cles, repartition par endroit et par mois, joueurs les plus touches,
// rechutes, indisponibles du moment. Presentation seule : tout est calcule dans lib/resume-blessures.ts.

import Link from "next/link";

import type { BlessureSaison, LigneJoueur, LigneRepartition, ResumeBlessures } from "../lib/resume-blessures";

export function Kpi({ label, valeur, suffixe, note, ton = "neutre", testid }: {
  label: string; valeur: string | number; suffixe?: string; note?: string; ton?: "neutre" | "danger" | "amber"; testid?: string;
}) {
  return (
    <div className="stat-tile no-coupure" data-testid={testid}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value mt-2 text-[28px]! ${ton === "danger" ? "!text-danger" : ton === "amber" ? "!text-amber" : ""}`}>
        {valeur}{suffixe && <span className="ml-1 text-xs font-medium text-muted">{suffixe}</span>}
      </div>
      {note && <div className="mt-1.5 text-xs text-muted">{note}</div>}
    </div>
  );
}

/** Barres horizontales : une ligne par valeur, longueur proportionnelle au nombre de blessures. */
export function RepartitionBarres({ lignes, vide }: { lignes: LigneRepartition[]; vide: string }) {
  if (lignes.length === 0) return <p className="text-sm text-muted">{vide}</p>;
  const max = Math.max(...lignes.map((l) => l.n), 1);
  return (
    <ul className="space-y-2">
      {lignes.slice(0, 8).map((l) => (
        <li key={l.cle} className="no-coupure flex items-center gap-3 text-sm">
          <span className="w-28 shrink-0 truncate text-ink">{l.libelle}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
            <div className="h-full rounded-full bg-danger/70" style={{ width: `${(l.n / max) * 100}%` }} />
          </div>
          <span className="w-9 shrink-0 text-right font-mono font-bold tabular-nums">{l.n}</span>
          <span className="hidden w-16 shrink-0 text-right text-[11px] text-faint tabular-nums sm:block">{l.jours} j</span>
        </li>
      ))}
      {lignes.length > 8 && <li className="text-[11px] text-faint">et {lignes.length - 8} autre{lignes.length - 8 > 1 ? "s" : ""}</li>}
    </ul>
  );
}

/** Colonnes : les douze mois de la saison. */
export function BlessuresParMois({ mois }: { mois: ResumeBlessures["parMois"] }) {
  const max = Math.max(...mois.map((m) => m.n), 1);
  return (
    <div>
      <div className="flex h-32 items-end gap-1.5" aria-hidden="true">
        {mois.map((m) => (
          <div key={m.mois} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] font-semibold tabular-nums text-ink">{m.n > 0 ? m.n : ""}</span>
            <div className={`w-full rounded-t-md ${m.n > 0 ? "bg-danger/70" : "bg-line"}`} style={{ height: `${m.n > 0 ? Math.max(8, (m.n / max) * 100) : 4}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5 text-[10px] text-faint" aria-hidden="true">
        {mois.map((m) => <span key={m.mois} className="flex-1 text-center">{m.libelle}</span>)}
      </div>
      <table className="sr-only">
        <caption>Blessures par mois</caption>
        <thead><tr><th>Mois</th><th>Blessures</th></tr></thead>
        <tbody>{mois.map((m) => <tr key={m.mois}><td>{m.libelle}</td><td>{m.n}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export function JoueursTouches({ joueurs }: { joueurs: LigneJoueur[] }) {
  if (joueurs.length === 0) return <p className="text-sm text-muted">Aucun joueur blesse sur la saison.</p>;
  return (
    <ul className="divide-y divide-line">
      {joueurs.slice(0, 6).map((j) => (
        <li key={j.joueurId} className="no-coupure flex items-center gap-3 py-2 text-sm">
          <Link href={`/joueur/${j.joueurId}`} className="min-w-0 flex-1 truncate font-semibold text-ink hover:text-accent">{j.nom}</Link>
          <span className="text-xs tabular-nums text-muted">{j.n} blessure{j.n > 1 ? "s" : ""}</span>
          <span className="w-14 text-right text-xs tabular-nums text-faint">{j.jours} j</span>
        </li>
      ))}
    </ul>
  );
}

export function Rechutes({ rechutes }: { rechutes: ResumeBlessures["rechutes"] }) {
  if (rechutes.length === 0) return <p className="text-sm text-muted">Aucune rechute : personne n&apos;a ete blesse deux fois au meme endroit.</p>;
  return (
    <ul className="space-y-1.5">
      {rechutes.map((r) => (
        <li key={`${r.joueurId}-${r.localisation}`} className="panel-inset no-coupure flex items-center gap-2 border-l-[3px] border-l-amber px-3 py-2 text-sm">
          <Link href={`/joueur/${r.joueurId}`} className="min-w-0 flex-1 truncate font-semibold text-ink hover:text-accent">{r.nom}</Link>
          <span className="text-xs text-muted">{r.localisation}</span>
          <span className="badge badge-amber text-[10px]!">{r.n} fois</span>
        </li>
      ))}
    </ul>
  );
}

/** Les indisponibles du moment (saison en cours seulement). */
export function IndisponiblesDuMoment({ blessures, noms, maintenant }: { blessures: BlessureSaison[]; noms: ReadonlyMap<string, string>; maintenant: number }) {
  if (blessures.length === 0) return <p className="text-sm text-muted">Personne n&apos;est indisponible en ce moment.</p>;
  return (
    <ul className="space-y-2">
      {blessures.map((b) => {
        const debut = b.dateDebut ? Date.parse(b.dateDebut) : NaN;
        const jours = Number.isNaN(debut) ? null : Math.max(0, Math.round((maintenant - debut) / 86_400_000));
        return (
          <li key={b.id} className="panel-inset no-coupure flex flex-wrap items-center gap-x-3 gap-y-1 border-l-2 border-l-danger p-3 text-sm">
            <Link href={`/joueur/${b.joueurId}`} className="font-semibold text-ink hover:text-accent">{noms.get(b.joueurId) ?? b.joueurNom ?? "Joueur"}</Link>
            <span className="text-muted">{b.localisation ?? "Localisation non precisee"}</span>
            {b.statut && <span className="badge badge-danger text-[10px]!">{b.statut}</span>}
            <span className="ml-auto text-[11px] text-faint">
              {jours !== null ? `depuis ${jours} j` : ""}{b.retourEstime ? ` · retour estime ${b.retourEstime}` : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
