// src/features/tactique/components/RegleMutations.tsx
//
// Compteurs de la regle des joueurs mutes : au plus 6 sur la feuille de match, dont au plus 2 hors
// delai. Chaque compteur est une rangee de cases (une par place) : on voit d'un coup d'oeil combien
// de places restent, et quand la regle est depassee.

import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

import { MAX_HORS_DELAI, MAX_MUTES, type BilanMutations } from "@/features/tactique/lib/mutations";

function Cases({ total, occupees, ton }: { total: number; occupees: number; ton: "amber" | "danger" }) {
  const fond = ton === "amber" ? "bg-amber" : "bg-danger";
  const depasse = Math.max(0, occupees - total);
  return (
    <div className="flex items-center gap-1" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-2.5 w-full rounded-full ${i < occupees ? fond : "bg-line"}`} />
      ))}
      {depasse > 0 && <span className="shrink-0 rounded-full bg-danger px-1.5 text-[10px] font-bold leading-4 text-white">+{depasse}</span>}
    </div>
  );
}

export function RegleMutations({ bilan, effectifTotal }: { bilan: BilanMutations; effectifTotal: number }) {
  const { mutes, horsDelai, inconnus, valide } = bilan;
  return (
    <section className={`panel p-5 ${valide ? "" : "border-danger/50"}`} aria-labelledby="regle-mutes">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 id="regle-mutes" className="h-section">Regle des mutes</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-faint">
            Au plus {MAX_MUTES} joueurs mutes sur la feuille de match (titulaires et remplacants), dont {MAX_HORS_DELAI} maximum hors delai.
          </p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${
          valide ? "border-win/35 bg-win/10 text-win" : "border-danger/40 bg-danger/10 text-danger"}`}>
          {valide ? <CheckCircle2 size={13} aria-hidden /> : <AlertTriangle size={13} aria-hidden />}
          {valide ? "Conforme" : "Non conforme"}
        </span>
      </div>

      <div className="space-y-3">
        <div>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="text-muted">Joueurs mutes</span>
            <b className={`font-display text-base tabular-nums ${mutes > MAX_MUTES ? "text-danger" : "text-ink"}`} data-testid="mutes">
              {mutes}<span className="text-xs font-medium text-faint"> / {MAX_MUTES}</span>
            </b>
          </div>
          <Cases total={MAX_MUTES} occupees={mutes} ton={mutes > MAX_MUTES ? "danger" : "amber"} />
        </div>
        <div>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="text-muted">dont hors delai</span>
            <b className={`font-display text-base tabular-nums ${horsDelai > MAX_HORS_DELAI ? "text-danger" : "text-ink"}`} data-testid="hors-delai">
              {horsDelai}<span className="text-xs font-medium text-faint"> / {MAX_HORS_DELAI}</span>
            </b>
          </div>
          <Cases total={MAX_HORS_DELAI} occupees={horsDelai} ton="danger" />
        </div>
      </div>

      {bilan.violations.map((v) => (
        <p key={v} role="alert" className="mt-3 flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />{v}
        </p>
      ))}
      {inconnus > 0 && (
        <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-muted">
          <Info size={13} className="mt-0.5 shrink-0 text-faint" aria-hidden />
          {inconnus} joueur{inconnus > 1 ? "s" : ""} au statut de mutation inconnu sur {effectifTotal} : a renseigner dans l'effectif pour que la regle soit verifiee.
        </p>
      )}
    </section>
  );
}
