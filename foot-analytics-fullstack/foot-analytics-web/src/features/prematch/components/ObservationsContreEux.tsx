// src/features/prematch/components/ObservationsContreEux.tsx
//
// « Ce qu'on a observé » dans le rapport pre-match : ce que notre staff a note de cet adversaire dans l'apres-match de nos rencontres
// precedentes. Une carte par sujet ; quand plusieurs matchs disent la meme chose, le nombre de matchs est indique (2 sur 3).

import type { SyntheseObservations } from "../lib/prematch-types";

type Champ = SyntheseObservations["sections"][number]["champs"][number];

function Valeurs({ champ, matchs }: { champ: Champ; matchs: number }) {
  if (champ.valeurs) {
    return (
      <ul className="flex flex-wrap gap-1.5" aria-label={champ.libelle}>
        {champ.valeurs.map((v) => (
          <li key={v.valeur} className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-ink">
            {v.valeur}{matchs > 1 && <span className="text-faint"> · {v.matchs}/{matchs}</span>}
          </li>
        ))}
      </ul>
    );
  }
  if (champ.moyenne !== undefined) return <p className="text-sm text-ink">{champ.libelle} : <strong className="tabular-nums">{String(champ.moyenne).replace(".", ",")}</strong> / 5</p>;
  if (champ.joueurs) {
    return (
      <ul className="space-y-0.5 text-sm text-ink" aria-label={champ.libelle}>
        {champ.joueurs.map((j) => (
          <li key={j.numero}><strong className="tabular-nums">n°{j.numero}</strong>{j.commentaire ? ` : ${j.commentaire}` : ""}{matchs > 1 && j.matchs > 1 && <span className="text-faint"> · {j.matchs}/{matchs} matchs</span>}</li>
        ))}
      </ul>
    );
  }
  return <p className="text-sm text-muted">{champ.textes?.[0]?.texte}</p>;
}

export function ObservationsContreEux({ synthese, nom }: { synthese: SyntheseObservations; nom: string }) {
  if (synthese.sections.length === 0) {
    return (
      <p className="text-sm text-muted">
        Aucune observation de {nom} pour l&apos;instant. Elles se saisissent dans l&apos;onglet « Adversaire » de l&apos;après-match d&apos;un match joué contre lui, et reviennent ici.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        {synthese.matchs} match{synthese.matchs > 1 ? "s" : ""} observé{synthese.matchs > 1 ? "s" : ""}{synthese.derniere ? ` · le plus récent : ${synthese.derniere}` : ""}.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {synthese.sections.map((s) => (
          <section key={s.id} aria-label={s.titre} className="panel-inset space-y-2 p-3 no-coupure">
            <h3 className="text-sm font-semibold text-ink">{s.titre}</h3>
            {s.champs.map((c) => <Valeurs key={c.id} champ={c} matchs={synthese.matchs} />)}
          </section>
        ))}
      </div>
    </div>
  );
}
