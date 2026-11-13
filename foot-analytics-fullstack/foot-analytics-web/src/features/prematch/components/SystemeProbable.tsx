// src/features/prematch/components/SystemeProbable.tsx
//
// Systeme de jeu probable de l'adversaire. La feuille de match FMI ne contient aucun dispositif : l'estimation vient des
// dispositifs que le staff a RENSEIGNES sur ses matchs (les plus recents pesant plus) et/ou des CHANGEMENTS DE NUMERO de
// maillot (un 2 qui devient 4 dit une defense a 4, un attaquant 9 puis 10 deux attaquants...). Elle dit d'ou elle vient,
// avec quelle confiance et sur quels indices. Sans aucune des deux, elle le dit au lieu de supposer un 4-4-2.

import Link from "next/link";
import { Info } from "lucide-react";

import type { RapportPrematch } from "@/features/prematch/lib/prematch-types";

const FIABILITE = {
  faible: { libelle: "Échantillon mince", classe: "badge-amber" },
  moyenne: { libelle: "Fiabilité moyenne", classe: "" },
  bonne: { libelle: "Bonne fiabilité", classe: "badge-accent" },
} as const;

const SOURCE = {
  renseigne: "Dispositifs renseignés",
  numeros: "Déduit des numéros de maillot",
  mixte: "Renseigné + numéros de maillot",
} as const;

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

export function SystemeProbable({
  donnees, numeros, adversaire,
}: { donnees: RapportPrematch["systemeAdverse"]; numeros?: RapportPrematch["numeros"]; adversaire: string }) {
  const { probable: p, observes, matchs, dernierMatchId } = donnees;
  const lienSaisie = dernierMatchId && (
    <Link href={`/matchs/${dernierMatchId}`} className="text-accent underline underline-offset-2">Renseigner son dernier match</Link>
  );

  const lire = (st: NonNullable<typeof numeros>["structure"]) => [
    st.defense ? `défense a ${st.defense.lignes}` : null,
    st.attaque ? pluriel(st.attaque.attaquants, "attaquant") : null,
  ].filter(Boolean).join(" · ");

  if (!p) {
    const partiel = numeros ? lire(numeros.structure) : "";
    return (
      <div className="flex items-start gap-3 text-sm text-muted">
        <Info size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <div className="space-y-1.5">
          <p>
            Aucun système de jeu déterminable pour {adversaire} ({pluriel(matchs, "match")} joué{matchs > 1 ? "s" : ""}) : aucun dispositif renseigné, et
            les numéros de maillot ne suffisent pas à en déduire un. La feuille de match n'en contient pas : il se saisit sur la fiche d'un match,
            par exemple après l'avoir affronte.
          </p>
          {partiel && <p className="text-ink">Les numéros disent quand même : {partiel}.</p>}
          {numeros?.notes.map((n) => <p key={n} className="text-xs text-faint">{n}</p>)}
          {numeros && numeros.indices.length > 0 && (
            <ul className="space-y-1 text-xs leading-relaxed text-muted">
              {numeros.indices.slice(0, 3).map((i) => <li key={i.texte} className="flex gap-2"><span className="text-faint" aria-hidden>·</span><span>{i.texte}</span></li>)}
            </ul>
          )}
          {lienSaisie && <p>{lienSaisie}.</p>}
        </div>
      </div>
    );
  }

  const f = FIABILITE[p.fiabilite];
  const structure = lire(p.structure);
  const base = [
    p.observations > 0 ? `${pluriel(p.observations, "match")} renseigné${p.observations > 1 ? "s" : ""} (sur ${matchs} joué${matchs > 1 ? "s" : ""})` : null,
    p.matchsNumeros > 0 && p.source !== "renseigne" ? `${pluriel(p.matchsNumeros, "feuille")} lue${p.matchsNumeros > 1 ? "s" : ""}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <div>
          <div className="stat-label">Système probable</div>
          <div className="mt-1 font-display text-4xl font-bold tabular-nums text-ink">{p.systeme}</div>
        </div>
        <div className="min-w-0 space-y-1.5 text-xs text-muted">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`badge ${f.classe}`}>{f.libelle}</span>
            <span className="badge badge-sky">{SOURCE[p.source]}</span>
            {p.modele && <span className="badge badge-accent" title="Le dispositif est choisi par le modèle de l'IA actif">Prédit par l'IA ({p.modele.nom})</span>}
            <span>{p.confiance} % · {base}</span>
          </div>
          {structure && <div className="text-ink">Les numéros disent : {structure}</div>}
          {p.alternatives.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-faint">Sinon :</span>
              {p.alternatives.map((a) => <span key={a.systeme} className="badge">{a.systeme} · {a.poids} %</span>)}
            </div>
          )}
          {observes < matchs && lienSaisie && (
            <div>{lienSaisie} pour affiner (un dispositif saisi pèse plus que les numéros).</div>
          )}
        </div>
      </div>

      {p.indices.length > 0 && (
        <div>
          <div className="stat-label mb-1.5">Pourquoi ce système</div>
          <ul className="space-y-1 text-xs leading-relaxed text-muted">
            {p.indices.map((i) => <li key={i} className="flex gap-2"><span className="text-faint" aria-hidden>·</span><span>{i}</span></li>)}
          </ul>
        </div>
      )}
      {p.source === "numeros" && (
        <p className="text-[11px] text-faint">
          Estimation d'après les numéros de maillot, plafonnée a 70 % : un numéro n'est pas un dispositif saisi par le staff.
        </p>
      )}
    </div>
  );
}
