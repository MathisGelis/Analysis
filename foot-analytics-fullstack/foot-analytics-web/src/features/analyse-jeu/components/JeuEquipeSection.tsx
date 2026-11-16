"use client";

// src/features/analyse-jeu/components/JeuEquipeSection.tsx
//
// Le jeu de MON equipe dans le rapport d'equipe : buts par tranche, tirs et zones, contextes, discipline, puis les croisements avec
// les mesures du rapport. Filtres : saison (celle du rapport), domicile / exterieur, 5 derniers matchs. Chaque bloc dit sur
// combien de matchs il porte.

import Link from "next/link";
import { useEffect, useState } from "react";
import { Crosshair } from "lucide-react";

import { api, messageApi } from "@/shared/lib/api";
import { BarsChart } from "@/shared/ui/Charts";
import { Spinner } from "@/shared/ui/Spinner";

import type { JeuEquipe, Lieu, PourContre, ReponseCroisements, ReponseJeu } from "../lib/jeu-types";
import { CarteZones } from "./CarteZones";
import { CroisementsJeu } from "./CroisementsJeu";

const TRANCHES = ["0-15", "16-30", "31-45", "46-60", "61-75", "76-90+"];
const LIEUX: [Lieu, string][] = [["tous", "Saison complète"], ["domicile", "Domicile"], ["exterieur", "Extérieur"]];

export function JeuEquipeSection({ clubId, equipeId, saisonId }: { clubId: string; equipeId?: string; saisonId?: string }) {
  const [lieu, setLieu] = useState<Lieu>("tous");
  const [cinq, setCinq] = useState(false);
  const [jeu, setJeu] = useState<ReponseJeu | null>(null);
  const [croisements, setCroisements] = useState<ReponseCroisements | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    setErreur(null);
    const p = { equipeId, saisonId, lieu, derniers: cinq ? 5 : null };
    Promise.all([api.jeuEquipe(clubId, p), api.croisementsJeu(clubId, p)])
      .then(([j, c]) => { if (vivant) { setJeu(j); setCroisements(c); } })
      .catch((e) => { if (vivant) setErreur(messageApi(e, "Impossible de charger le jeu de l'équipe.")); });
    return () => { vivant = false; };
  }, [clubId, equipeId, saisonId, lieu, cinq]);

  return (
    <section id="jeu" aria-labelledby="titre-jeu" className="panel scroll-mt-24 space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="titre-jeu" className="h-section flex items-center gap-2"><Crosshair size={11} className="text-accent" aria-hidden />Le jeu de l&apos;équipe</h2>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtres du jeu">
          {LIEUX.map(([id, libelle]) => (
            <button key={id} type="button" aria-pressed={lieu === id} onClick={() => setLieu(id)}
              className={`btn !h-9 text-xs ${lieu === id ? "!border-accent bg-accent/15 font-bold text-accent" : ""}`}>{libelle}</button>
          ))}
          <button type="button" aria-pressed={cinq} onClick={() => setCinq((v) => !v)}
            className={`btn !h-9 text-xs ${cinq ? "!border-accent bg-accent/15 font-bold text-accent" : ""}`}>5 derniers matchs</button>
        </div>
      </div>

      {erreur && <p role="alert" className="panel-inset border-l-2 border-danger p-3 text-sm text-ink">{erreur}</p>}
      {!jeu && !erreur && <div className="flex justify-center p-8" role="status" aria-label="Chargement du jeu de l'équipe"><Spinner taille={20} /></div>}

      {jeu && (
        <>
          <Couverture jeu={jeu.jeu} saison={jeu.matchsDeLaSaison} />
          <Buts jeu={jeu.jeu} />
          {jeu.jeu.tirs && <Tirs jeu={jeu.jeu} />}
          {jeu.jeu.discipline && <Discipline jeu={jeu.jeu} />}
        </>
      )}
      {croisements && <CroisementsJeu reponse={croisements} />}
    </section>
  );
}

function Couverture({ jeu, saison }: { jeu: JeuEquipe; saison: number }) {
  const c = jeu.couverture;
  if (c.matchs === 0) return <p className="panel-inset p-4 text-sm text-muted">Aucun match joué avec ces filtres.</p>;
  return (
    <p className="panel-inset border-l-2 border-accent p-3 text-[13px] text-ink" role="status">
      {c.matchs} match{c.matchs > 1 ? "s" : ""} analysé{c.matchs > 1 ? "s" : ""}{c.matchs < saison ? ` (sur ${saison} cette saison)` : ""}.{" "}
      <strong>{c.saisis} saisi{c.saisis > 1 ? "s" : ""} en direct</strong> : tirs, zones, contextes et discipline détaillée ne portent que sur ceux-là.
      Les buts datés ({c.butsDates} match{c.butsDates > 1 ? "s" : ""}) et les cartons ({c.avecCartons}) viennent aussi de la feuille de match.
      {c.saisis === 0 && <> Saisis un match depuis sa fiche (bouton Direct) pour débloquer le détail.</>}
      {c.saisis > 0 && c.saisis < c.matchs && <> <Link href="/matchs" className="underline">Les autres matchs</Link> peuvent être saisis après coup depuis leur fiche.</>}
    </p>
  );
}

function Buts({ jeu }: { jeu: JeuEquipe }) {
  const b = jeu.buts;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-ink">Buts par tranche de 15 minutes</h3>
      {b.matchsCouverts === 0 ? (
        <p className="text-sm text-muted">Aucun match dont les buts sont datés (ni saisi en direct, ni daté par la feuille de match).</p>
      ) : (
        <>
          <BarsChart height={200} legend={["Marqués", "Encaissés"]} data={TRANCHES.map((label, i) => ({ label, a: b.pour[i], b: b.contre[i] }))} />
          <p className="mt-1 text-[11px] text-faint">Sur {b.matchsCouverts} match{b.matchsCouverts > 1 ? "s" : ""} dont les buts sont datés : {b.total.pour} marqué{b.total.pour > 1 ? "s" : ""}, {b.total.contre} encaissé{b.total.contre > 1 ? "s" : ""}.</p>
        </>
      )}
    </div>
  );
}

const pctTexte = (n: number | null) => (n === null ? "–" : `${n} %`);

function Kpi({ libelle, pour, contre }: { libelle: string; pour: string; contre: string }) {
  return (
    <div className="panel-inset p-3 text-center">
      <div className="text-[11px] uppercase tracking-wide text-muted">{libelle}</div>
      <div className="mt-1 flex items-baseline justify-center gap-2 font-display">
        <span className="text-2xl font-bold text-accent" aria-label={`Pour nous : ${pour}`}>{pour}</span>
        <span className="text-muted" aria-hidden>·</span>
        <span className="text-2xl font-bold text-sky" aria-label={`Pour l'adversaire : ${contre}`}>{contre}</span>
      </div>
    </div>
  );
}

function Tirs({ jeu }: { jeu: JeuEquipe }) {
  const t = jeu.tirs!;
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-ink">Tirs et zones <span className="font-normal text-muted">· {t.matchs} match{t.matchs > 1 ? "s" : ""} saisi{t.matchs > 1 ? "s" : ""}</span></h3>
      <div className="grid grid-cols-3 gap-2">
        <Kpi libelle="Tirs par match" pour={String(t.parMatch.pour)} contre={String(t.parMatch.contre)} />
        <Kpi libelle="Tirs cadrés" pour={pctTexte(t.cadresPct.pour)} contre={pctTexte(t.cadresPct.contre)} />
        <Kpi libelle="Conversion" pour={pctTexte(t.conversion.pour)} contre={pctTexte(t.conversion.contre)} />
      </div>
      <p className="text-[11px] text-faint">Chiffre de gauche : notre équipe ; chiffre de droite : l&apos;adversaire. Conversion : buts sur tirs.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <figure className="space-y-1.5">
          <figcaption className="text-xs font-semibold text-ink">Où nous tirons</figcaption>
          <CarteZones carte={t.carte.pour} nom="Carte des tirs de notre équipe" />
        </figure>
        <figure className="space-y-1.5">
          <figcaption className="text-xs font-semibold text-ink">Où l&apos;adversaire tire (l&apos;attaque adverse est en haut, face à notre but)</figcaption>
          <CarteZones carte={t.carte.contre} nom="Carte des tirs de l'adversaire" />
        </figure>
      </div>
      {t.familles.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-xs font-semibold text-ink">Comment nous tirons</h4>
          <ul className="space-y-1.5" aria-label="Tirs par famille de jeu">
            {t.familles.map((f) => {
              const part = t.pour.tirs ? Math.round((f.tirs / t.pour.tirs) * 100) : 0;
              return (
                <li key={f.famille} className="text-[13px]">
                  <div className="flex justify-between gap-2 text-ink"><span>{f.famille}</span><span className="tabular-nums text-muted">{f.tirs} tir{f.tirs > 1 ? "s" : ""} · {f.buts} but{f.buts > 1 ? "s" : ""}</span></div>
                  <div role="img" aria-label={`${f.famille} : ${part} % des tirs`} className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full bg-accentstrong" style={{ width: `${part}%` }} /></div>
                </li>
              );
            })}
          </ul>
          {t.contextes.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Tirs par contexte">
              {t.contextes.map((c) => <li key={c.nom} className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-ink">{c.nom} · {c.tirs} · {c.buts} but{c.buts > 1 ? "s" : ""}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Discipline({ jeu }: { jeu: JeuEquipe }) {
  const d = jeu.discipline!;
  const lignes: [string, PourContre, boolean][] = [
    ["Fautes", d.fautes, true], ["Hors-jeux", d.horsJeux, true], ["Corners", d.corners, true], ["Coups francs", d.coupsFrancs, true],
    ["Penaltys", d.penaltys, true], ["Arrêts du gardien", d.arrets, true], ["Cartons jaunes", d.jaunes, false], ["Cartons rouges", d.rouges, false],
  ];
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-ink">Discipline, arrêts et coups de pied arrêtés</h3>
      <table className="w-full text-[13px]">
        <caption className="sr-only">Comparaison entre notre équipe et l&apos;adversaire</caption>
        <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted"><th scope="col" className="py-1 font-medium">Statistique</th><th scope="col" className="py-1 text-right font-medium">Nous</th><th scope="col" className="py-1 text-right font-medium">Eux</th><th scope="col" className="py-1 text-right font-medium">Matchs</th></tr></thead>
        <tbody>
          {lignes.filter(([, , detail]) => !detail || d.matchsSaisis > 0).map(([nom, v, detail]) => (
            <tr key={nom} className="border-t border-line"><th scope="row" className="py-1.5 text-left font-normal text-ink">{nom}</th>
              <td className="py-1.5 text-right font-bold tabular-nums text-accent">{v.pour}</td><td className="py-1.5 text-right font-bold tabular-nums text-sky">{v.contre}</td>
              <td className="py-1.5 text-right text-muted">{detail ? d.matchsSaisis : d.matchsCartons}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[11px] text-faint">Les cartons portent sur tous les matchs qui en ont (feuille de match ou direct) ; le reste sur les matchs saisis.</p>
    </div>
  );
}
