"use client";

// src/features/analyse-jeu/components/CroisementsJeu.tsx
//
// Le jeu saisi rapproche de ce que le rapport mesure deja : danger, impact des joueurs, rotation et charge, dispositif. On montre
// des ecarts et des correlations avec leur effectif ; jamais une cause.

import { BarsChart } from "@/shared/ui/Charts";

import type { Croisements, ReponseCroisements } from "../lib/jeu-types";
import { libelleFormation } from "@/shared/lib/formation";

const LECTURE_JOUEUR: Record<Croisements["joueurs"][number]["lecture"], string> = {
  impact_sans_production: "Impact élevé, peu de buts et de passes saisis",
  production_sans_impact: "Beaucoup de production, impact mesuré modeste",
  coherent: "Cohérent",
};
const LIBELLE_FORCE = { forte: "Lien fort", moyenne: "Lien moyen", faible: "Lien faible", nulle: "Aucun lien net" } as const;

export function CroisementsJeu({ reponse }: { reponse: ReponseCroisements }) {
  const c = reponse.croisements;
  const saisis = reponse.couverture.saisis;
  return (
    <div className="space-y-5 border-t border-line pt-5">
      <div>
        <h3 className="text-base font-semibold text-ink">Le jeu rapproché des performances mesurées</h3>
        <p className="text-[13px] text-muted">
          {saisis === 0
            ? "Aucun match saisi avec ces filtres : rien à croiser pour l'instant."
            : c.suffisant
              ? `Calculé sur ${saisis} matchs saisis. Un lien entre deux mesures n'est jamais une cause.`
              : `${saisis} match${saisis > 1 ? "s" : ""} saisi${saisis > 1 ? "s" : ""} : les corrélations demandent au moins ${c.minimum} matchs, elles apparaîtront plus bas dès que ce sera le cas.`}
        </p>
      </div>

      {c.danger && <Danger d={c.danger} />}
      {c.joueurs.length > 0 && <Joueurs lignes={c.joueurs} />}
      {c.facteurs.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-sm font-semibold text-ink">Rotation et charge d&apos;entraînement contre rendement</h4>
          <ul className="space-y-2">
            {c.facteurs.map((f) => (
              <li key={f.id} className="panel-inset p-3 text-[13px]">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-ink">{f.facteur} <span className="font-normal text-muted">· {f.mesure}</span></span>
                  {f.force && <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${f.force === "forte" || f.force === "moyenne" ? "border-accent text-accent" : "border-line text-muted"}`}>{LIBELLE_FORCE[f.force]}{f.r !== null ? ` (${String(f.r).replace(".", ",")})` : ""}</span>}
                </div>
                <p className="mt-1 text-muted">{f.lecture}</p>
              </li>
            ))}
          </ul>
          {reponse.fatigueMoy !== null && <p className="mt-1.5 text-[11px] text-faint">Fatigue moyenne actuelle des titulaires types : {reponse.fatigueMoy}/100. Elle est mesurée au moment présent : elle n&apos;est pas rapprochée des matchs passés.</p>}
        </div>
      )}
      {c.dispositifs.length > 0 && <Dispositifs lignes={c.dispositifs} />}
    </div>
  );
}

function Danger({ d }: { d: NonNullable<Croisements["danger"]> }) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-ink">Danger mesuré contre danger réel</h4>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="panel-inset p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted">Danger mesuré (rapport)</div>
          <div className="font-display text-2xl font-bold text-accent">{d.mesure.scoreDanger}<span className="text-sm text-muted"> /100</span></div>
          <div className="text-xs text-muted">{d.mesure.butsParMatch} but{d.mesure.butsParMatch >= 2 ? "s" : ""} par match sur {d.mesure.matchs} match{d.mesure.matchs > 1 ? "s" : ""}</div>
        </div>
        <div className="panel-inset p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted">Jeu réel (matchs saisis)</div>
          <div className="font-display text-2xl font-bold text-accent">{d.reel.tirsParMatch}<span className="text-sm text-muted"> tirs / match</span></div>
          <div className="text-xs text-muted">{d.reel.cadresPct ?? "–"} % cadrés · conversion {d.reel.conversion ?? "–"} % · {d.reel.butsParMatch} but{d.reel.butsParMatch >= 2 ? "s" : ""} par match ({d.reel.matchs} match{d.reel.matchs > 1 ? "s" : ""})</div>
        </div>
      </div>
      <ul className="space-y-1 text-[13px] text-ink">{d.lecture.map((l) => <li key={l} className="flex gap-2"><span className="text-accent" aria-hidden>•</span><span>{l}</span></li>)}</ul>
      {d.serie.length >= 2 && (
        <div>
          <BarsChart height={180} legend={["Tirs", "Buts"]} data={d.serie.map((s, i) => ({ label: s.date ? s.date.slice(5, 10) : `M${i + 1}`, a: s.tirs, b: s.buts }))} />
          <p className="text-[11px] text-faint">Tirs et buts de chaque match saisi, du plus ancien au plus récent.</p>
        </div>
      )}
    </div>
  );
}

function Joueurs({ lignes }: { lignes: Croisements["joueurs"] }) {
  return (
    <div>
      <h4 className="mb-1.5 text-sm font-semibold text-ink">Impact mesuré contre production réelle des joueurs</h4>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-[13px]">
          <caption className="sr-only">Impact calculé et production saisie de chaque joueur</caption>
          <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted">
            <th scope="col" className="py-1 font-medium">Joueur</th><th scope="col" className="py-1 text-right font-medium">Impact</th><th scope="col" className="py-1 text-right font-medium">Buts</th>
            <th scope="col" className="py-1 text-right font-medium">Passes</th><th scope="col" className="py-1 text-right font-medium">Tirs</th><th scope="col" className="py-1 text-right font-medium">Conv.</th><th scope="col" className="py-1 pl-3 font-medium">Lecture</th></tr></thead>
          <tbody>
            {lignes.map((j) => (
              <tr key={j.joueurId} className="border-t border-line">
                <th scope="row" className="py-1.5 text-left font-semibold text-ink">{j.nom}</th>
                <td className="py-1.5 text-right tabular-nums text-ink">{j.impactPondere.toFixed(1).replace(".", ",")}</td>
                <td className="py-1.5 text-right tabular-nums">{j.buts}</td><td className="py-1.5 text-right tabular-nums">{j.passes}</td><td className="py-1.5 text-right tabular-nums">{j.tirs}</td>
                <td className="py-1.5 text-right tabular-nums">{j.conversion === null ? "–" : `${j.conversion} %`}</td>
                <td className={`py-1.5 pl-3 text-xs ${j.lecture === "coherent" ? "text-muted" : "font-semibold text-amber"}`}>{LECTURE_JOUEUR[j.lecture]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] text-faint">L&apos;impact vient des résultats de l&apos;équipe avec et sans le joueur ; la production, des événements saisis en direct. Un défenseur ou un gardien a un impact sans buts : lis les écarts avec le poste en tête.</p>
    </div>
  );
}

function Dispositifs({ lignes }: { lignes: Croisements["dispositifs"] }) {
  return (
    <div>
      <h4 className="mb-1.5 text-sm font-semibold text-ink">Dispositif et rendement</h4>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-[13px]">
          <caption className="sr-only">Rendement de l&apos;équipe selon le dispositif joué</caption>
          <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted">
            <th scope="col" className="py-1 font-medium">Dispositif</th><th scope="col" className="py-1 text-right font-medium">Matchs</th><th scope="col" className="py-1 text-right font-medium">Pts/match</th>
            <th scope="col" className="py-1 text-right font-medium">Buts pour</th><th scope="col" className="py-1 text-right font-medium">Buts contre</th><th scope="col" className="py-1 text-right font-medium">Tirs/match</th><th scope="col" className="py-1 text-right font-medium">Conv.</th></tr></thead>
          <tbody>
            {lignes.map((d) => (
              <tr key={d.formation} className="border-t border-line">
                <th scope="row" className="py-1.5 text-left font-semibold text-ink">{libelleFormation(d.formation)}{d.echantillonFaible && <span className="ml-1.5 text-[11px] font-normal text-amber">peu de matchs</span>}</th>
                <td className="py-1.5 text-right tabular-nums">{d.matchs}</td><td className="py-1.5 text-right tabular-nums">{String(d.pointsParMatch).replace(".", ",")}</td>
                <td className="py-1.5 text-right tabular-nums">{String(d.butsPourParMatch).replace(".", ",")}</td><td className="py-1.5 text-right tabular-nums">{String(d.butsContreParMatch).replace(".", ",")}</td>
                <td className="py-1.5 text-right tabular-nums">{d.tirsParMatch === null ? "–" : String(d.tirsParMatch).replace(".", ",")}</td><td className="py-1.5 text-right tabular-nums">{d.conversion === null ? "–" : `${d.conversion} %`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] text-faint">Dispositifs renseignés par le staff sur la fiche du match. Tirs et conversion : matchs saisis seulement.</p>
    </div>
  );
}
