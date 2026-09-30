// src/components/analyse/ComparatifForme.tsx
//
// Les N derniers matchs face au reste de la saison : points, buts marques et encaisses
// par match, avec l'ecart. Complete la courbe glissante par des chiffres lisibles.

import type { DynamiqueForme } from "@/lib/analyse-types";
import { decimal } from "@/lib/tendances-format";
import { PastilleSens } from "./PastilleSens";

/** `sens` dit si l'ecart va vers le mieux (couleur) ; la fleche suit, elle, le signe de l'ecart. */
function Ligne({
  label, recent, avant, saison, sens, chiffres = 2,
}: {
  label: string; recent: number; avant: number; saison: number;
  sens: DynamiqueForme["sens"]; chiffres?: number;
}) {
  const ecart = recent - avant;
  const fleche = Math.abs(ecart) < 0.005 ? "plat" : ecart > 0 ? "haut" : "bas";
  return (
    <tr className="border-t border-line first:border-t-0">
      <th scope="row" className="py-2.5 pr-2 text-left text-xs font-medium text-muted">{label}</th>
      <td className="py-2.5 text-right font-display text-base font-bold tabular-nums text-ink">{decimal(recent, chiffres)}</td>
      <td className="py-2.5 text-right text-sm tabular-nums text-muted">{decimal(avant, chiffres)}</td>
      <td className="hidden py-2.5 text-right text-sm tabular-nums text-faint sm:table-cell">{decimal(saison, chiffres)}</td>
      <td className="py-2.5 pl-3 text-right">
        <PastilleSens sens={sens} fleche={fleche} libelle={decimal(ecart, chiffres, true)} />
      </td>
    </tr>
  );
}

export function ComparatifForme({ forme }: { forme: DynamiqueForme }) {
  const { recente, avant, saison, fenetre } = forme;
  return (
    <table className="w-full">
      <caption className="sr-only">Les {fenetre} derniers matchs compares au reste de la saison</caption>
      <thead>
        <tr className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">
          <th className="pb-1 text-left font-semibold"><span className="sr-only">Indicateur</span></th>
          <th className="whitespace-nowrap pb-1 pl-2 text-right font-semibold">{fenetre} derniers</th>
          <th className="pb-1 pl-2 text-right font-semibold">Avant</th>
          <th className="hidden pb-1 pl-2 text-right font-semibold sm:table-cell">Saison</th>
          <th className="pb-1 pl-3 text-right font-semibold">Ecart</th>
        </tr>
      </thead>
      <tbody>
        <Ligne label="Points / match" recent={recente.ppm} avant={avant.ppm} saison={saison.ppm} sens={forme.sens} />
        <Ligne label="Buts marques / match" recent={recente.bpm} avant={avant.bpm} saison={saison.bpm} sens={forme.attaque} />
        <Ligne label="Buts encaisses / match" recent={recente.bcm} avant={avant.bcm} saison={saison.bcm} sens={forme.defense} />
      </tbody>
    </table>
  );
}
