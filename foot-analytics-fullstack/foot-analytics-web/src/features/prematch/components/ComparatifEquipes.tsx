// src/features/prematch/components/ComparatifEquipes.tsx
//
// Les deux equipes face a face, critere par critere. La meilleure valeur de chaque ligne chiffree
// est mise en avant ; une equipe sans match joue s'affiche en tirets (aucun chiffre invente).

import type { ReactNode } from "react";

import { FormeStrip } from "@/shared/ui/Charts";
import { PastilleSens } from "@/features/analyse/components/PastilleSens";
import { decimal, libelleSerie, serieFavorable } from "@/features/analyse/lib/tendances-format";
import type { ProfilPrematch } from "@/features/prematch/lib/prematch-types";

type Cote = "moi" | "adv" | null;

/** Qui a la meilleure valeur : `plusHaut` si grand est bon, sinon petit est bon. */
function meilleur(a: number | null, b: number | null, plusHaut: boolean): Cote {
  if (a === null || b === null || a === b) return null;
  return (a > b) === plusHaut ? "moi" : "adv";
}

const rang = (r: number | null) => (r === null ? "—" : r === 1 ? "1er" : `${r}e`);

function Ligne({ label, moi, adv, avantage }: { label: string; moi: ReactNode; adv: ReactNode; avantage?: Cote }) {
  const style = (c: "moi" | "adv") => (avantage === c ? "font-bold text-accent" : "text-ink");
  return (
    <tr className="border-t border-line">
      <td className={`w-[38%] py-2.5 pr-3 text-right tabular-nums ${style("moi")}`}>{moi}</td>
      <th scope="row" className="w-[24%] px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{label}</th>
      <td className={`w-[38%] py-2.5 pl-3 text-left tabular-nums ${style("adv")}`}>{adv}</td>
    </tr>
  );
}

export function ComparatifEquipes({
  moi, adv, domicileMoi,
}: { moi: ProfilPrematch; adv: ProfilPrematch; domicileMoi: boolean | null }) {
  const vide = (p: ProfilPrematch) => p.matchs === 0;
  const num = (p: ProfilPrematch, v: number, d = 2) => (vide(p) ? "—" : decimal(v, d));
  const serie = (p: ProfilPrematch) => p.serie ? (
    <span className={serieFavorable(p.serie.type) ? "text-win" : "text-loss"}>{libelleSerie(p.serie.type, p.serie.longueur)}</span>
  ) : <span className="text-faint">—</span>;
  const lieu = (p: ProfilPrematch, cle: "domicile" | "exterieur") =>
    p[cle].joues === 0 ? "—" : `${decimal(p[cle].ppm, 2)} pts/match (${p[cle].joues} m.)`;
  const ordre = (p: ProfilPrematch) => (p.rang === null ? null : p.rang);

  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Comparaison de {moi.nom} et {adv.nom}</caption>
      <thead>
        <tr>
          <th scope="col" className="w-[38%] pb-3 pr-3 text-right font-display text-base font-bold text-ink">{moi.nom}</th>
          <td className="w-[24%]" />
          <th scope="col" className="w-[38%] pb-3 pl-3 text-left font-display text-base font-bold text-ink">{adv.nom}</th>
        </tr>
      </thead>
      <tbody>
        <Ligne label="Classement" moi={rang(moi.rang)} adv={rang(adv.rang)} avantage={meilleur(ordre(moi), ordre(adv), false)} />
        <Ligne label="Points" moi={moi.pts ?? "—"} adv={adv.pts ?? "—"} avantage={meilleur(moi.pts, adv.pts, true)} />
        <Ligne label="Matchs joues" moi={moi.matchs} adv={adv.matchs} />
        <Ligne label="Points / match" moi={num(moi, moi.ppm)} adv={num(adv, adv.ppm)}
          avantage={vide(moi) || vide(adv) ? null : meilleur(moi.ppm, adv.ppm, true)} />
        <Ligne label="Buts marques / match" moi={num(moi, moi.bpm)} adv={num(adv, adv.bpm)}
          avantage={vide(moi) || vide(adv) ? null : meilleur(moi.bpm, adv.bpm, true)} />
        <Ligne label="Buts encaisses / match" moi={num(moi, moi.bcm)} adv={num(adv, adv.bcm)}
          avantage={vide(moi) || vide(adv) ? null : meilleur(moi.bcm, adv.bcm, false)} />
        <Ligne label="Dynamique"
          moi={moi.sens === "insuffisant" ? <span className="text-faint">Trop tot</span> : <PastilleSens sens={moi.sens} libelle={moi.libelle} />}
          adv={adv.sens === "insuffisant" ? <span className="text-faint">Trop tot</span> : <PastilleSens sens={adv.sens} libelle={adv.libelle} />} />
        <Ligne label="Forme (5 derniers)"
          moi={<span className="inline-flex justify-end"><FormeStrip values={moi.formeRecente} /></span>}
          adv={<FormeStrip values={adv.formeRecente} />} />
        <Ligne label="Serie en cours" moi={serie(moi)} adv={serie(adv)} />
        <Ligne label={domicileMoi === true ? "A domicile (ce match)" : "A domicile"} moi={lieu(moi, "domicile")} adv={lieu(adv, "domicile")} />
        <Ligne label={domicileMoi === false ? "A l'exterieur (ce match)" : "A l'exterieur"} moi={lieu(moi, "exterieur")} adv={lieu(adv, "exterieur")} />
      </tbody>
    </table>
  );
}
