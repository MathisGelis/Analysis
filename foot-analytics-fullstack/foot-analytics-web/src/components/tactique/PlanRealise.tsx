// src/components/tactique/PlanRealise.tsx
//
// "Plan contre realise" : ce que le staff avait prepare (onze, banc, capitaine, dispositif) mis en
// regard de la feuille de match jouee. Un anneau donne la part du onze prevu qui a demarre, les
// constats disent ce qui a change, le tableau detaille joueur par joueur.

import { DonutStat } from "@/components/Charts";
import { PistesMatch } from "@/components/prematch/PistesMatch";
import {
  LIBELLE_ECART, LIBELLE_PREVU, LIBELLE_REEL, PASTILLE_ECART, type PlanContreRealise,
} from "@/lib/plan-realise-types";
import { Info } from "lucide-react";

const couleurAdequation = (n: number) => (n >= 80 ? "rgb(var(--win))" : n >= 60 ? "rgb(var(--amber))" : "rgb(var(--danger))");

export function PlanRealise({ donnees }: { donnees: PlanContreRealise }) {
  const c = donnees.comparaison;
  if (!c || c.etat !== "ok") return null;
  const { formation, capitaine, plan } = { ...c, plan: donnees.plan };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {c.adequation !== null && (
          <div className="flex items-center gap-4">
            <DonutStat value={c.adequation} size={84} stroke={9} color={couleurAdequation(c.adequation)} label="%" />
            <div>
              <div className="font-display text-lg font-bold text-ink">{c.titulairesConformes} / {c.titulairesPrevus} titulaires</div>
              <div className="text-xs text-muted">ont demarre comme prevu</div>
            </div>
          </div>
        )}
        <dl className="grid grid-cols-1 gap-x-8 gap-y-1 text-xs sm:grid-cols-2">
          <div className="flex items-baseline gap-2">
            <dt className="text-faint">Dispositif</dt>
            <dd className="text-ink">
              {formation.prevue}
              {formation.reelle ? <> prevu, <b>{formation.reelle}</b> joue</> : <span className="text-faint"> prevu (dispositif joue non renseigne)</span>}
            </dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-faint">Capitaine</dt>
            <dd className="text-ink">
              {capitaine.prevu ?? "non designe"}
              {capitaine.identique === false && <> prevu, <b>{capitaine.reel}</b> sur la feuille</>}
            </dd>
          </div>
        </dl>
      </div>

      {plan?.modifieApresMatch && (
        <p className="flex items-start gap-2 rounded-xl border border-amber/35 bg-amber/10 px-3 py-2 text-xs text-amber" role="note">
          <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
          Ce plan a ete modifie apres la rencontre ({new Date(plan.modifieLe).toLocaleDateString("fr-FR")}) : il a pu etre ajuste sur le realise.
        </p>
      )}
      {plan?.source === "courant" && (
        <p className="flex items-start gap-2 text-xs text-faint" role="note">
          <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
          Aucun plan n'etait rattache a ce match : comparaison avec le plan courant de l'equipe, enregistre le {new Date(plan.modifieLe).toLocaleDateString("fr-FR")}.
        </p>
      )}

      <PistesMatch pistes={c.observations} variante="plan" />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <caption className="sr-only">Comparaison joueur par joueur entre le plan et la feuille de match</caption>
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-faint">
              <th scope="col" className="pb-2 font-semibold">Joueur</th>
              <th scope="col" className="pb-2 font-semibold">Prevu</th>
              <th scope="col" className="pb-2 font-semibold">Sur la feuille</th>
              <th scope="col" className="pb-2 text-right font-semibold">Min.</th>
              <th scope="col" className="pb-2 pl-3 font-semibold">Ecart</th>
            </tr>
          </thead>
          <tbody>
            {c.lignes.map((l) => (
              <tr key={`${l.joueurId ?? l.nom}-${l.prevu}`} className="border-t border-line">
                <td className="py-2 pr-3 font-medium text-ink">{l.nom}</td>
                <td className="py-2 pr-3 text-muted">{l.prevu ? LIBELLE_PREVU[l.prevu] : "—"}</td>
                <td className="py-2 pr-3 text-muted">{LIBELLE_REEL[l.reel]}</td>
                <td className="py-2 text-right tabular-nums text-muted">{l.minutes ?? "—"}</td>
                <td className="py-2 pl-3">
                  <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${PASTILLE_ECART[l.ecart]}`}>
                    {LIBELLE_ECART[l.ecart]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
