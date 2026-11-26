"use client";
// src/features/analyse-jeu/components/DataHubPanel.tsx
//
// Le Data Hub de mon equipe (onglet de la fiche de mon club), a la maniere de celui de Football Manager : resultats, attaque,
// defense et gardien, coups de pied arretes, discipline, cartes des tirs, buts par tranche, joueurs, tendance match par match.
// Tout vient du jeu saisi en direct et de la feuille de match ; ce que l'app ne mesure pas (passes, duels, distance...) n'y est pas.

import Link from "next/link";
import { useEffect, useState } from "react";
import { Database } from "lucide-react";

import { api, messageApi } from "@/shared/lib/api";
import { BarsChart, FormeStrip } from "@/shared/ui/Charts";
import { Spinner } from "@/shared/ui/Spinner";

import type { DataHub, ReponseDataHub } from "../lib/data-hub-types";
import { CleTriJoueur, nb, pc, signe, trierJoueursHub } from "../lib/format-hub";
import type { Lieu, PourContre } from "../lib/jeu-types";
import { CarteTirs } from "./CarteTirs";

const TRANCHES = ["0-15", "16-30", "31-45", "46-60", "61-75", "76-90+"];
const LIEUX: [Lieu, string][] = [["tous", "Saison complète"], ["domicile", "Domicile"], ["exterieur", "Extérieur"]];

function Bloc({ titre, children, testid }: { titre: string; children: React.ReactNode; testid?: string }) {
  return <section aria-label={titre} className="panel space-y-3 p-5" data-testid={testid}><h3 className="h-section">{titre}</h3>{children}</section>;
}

/** Un tableau « pour / contre » : le libelle, ce que fait mon equipe, ce que fait l'adversaire contre elle. */
function Comparatif({ lignes, entetes = ["Nous", "Adversaire"] }: { lignes: { libelle: string; pour: string; contre: string; titre?: string }[]; entetes?: [string, string] | string[] }) {
  return (
    <table className="table-fm">
      <thead><tr><th><span className="sr-only">Statistique</span></th><th className="text-right">{entetes[0]}</th><th className="text-right">{entetes[1]}</th></tr></thead>
      <tbody>
        {lignes.map((l) => (
          <tr key={l.libelle}><td className="text-muted" title={l.titre}>{l.libelle}</td><td className="text-right font-semibold tabular-nums text-accent">{l.pour}</td><td className="text-right tabular-nums text-sky">{l.contre}</td></tr>
        ))}
      </tbody>
    </table>
  );
}
const paire = (p: PourContre) => ({ pour: String(p.pour), contre: String(p.contre) });

function Tuile({ libelle, valeur, detail }: { libelle: string; valeur: string | number; detail?: string }) {
  return (
    <div className="panel-inset p-3 text-center">
      <div className="text-[11px] uppercase tracking-wide text-muted">{libelle}</div>
      <div className="font-display text-2xl font-bold tabular-nums text-ink">{valeur}</div>
      {detail && <div className="text-[11px] text-faint">{detail}</div>}
    </div>
  );
}

export function DataHubPanel({ clubId, equipeId, saisonId }: { clubId: string; equipeId?: string; saisonId?: string }) {
  const [lieu, setLieu] = useState<Lieu>("tous");
  const [cinq, setCinq] = useState(false);
  const [r, setR] = useState<ReponseDataHub | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    setErreur(null);
    api.dataHub(clubId, { equipeId, saisonId, lieu, derniers: cinq ? 5 : null })
      .then((x) => { if (vivant) setR(x); })
      .catch((e) => { if (vivant) setErreur(messageApi(e, "Impossible de charger le Data Hub.")); });
    return () => { vivant = false; };
  }, [clubId, equipeId, saisonId, lieu, cinq]);

  return (
    <div className="space-y-4" data-testid="data-hub">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="h-section flex items-center gap-2"><Database size={11} className="text-accent" aria-hidden />Data Hub</h2>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtres du Data Hub">
          {LIEUX.map(([id, libelle]) => (
            <button key={id} type="button" aria-pressed={lieu === id} onClick={() => setLieu(id)}
              className={`btn !h-9 text-xs ${lieu === id ? "!border-accent bg-accent/15 font-bold text-accent" : ""}`}>{libelle}</button>
          ))}
          <button type="button" aria-pressed={cinq} onClick={() => setCinq((v) => !v)}
            className={`btn !h-9 text-xs ${cinq ? "!border-accent bg-accent/15 font-bold text-accent" : ""}`}>5 derniers matchs</button>
        </div>
      </div>
      {erreur && <p role="alert" className="panel-inset border-l-2 border-danger p-3 text-sm text-ink">{erreur}</p>}
      {!r && !erreur && <div className="flex justify-center p-8" role="status" aria-label="Chargement du Data Hub"><Spinner taille={20} /></div>}
      {r && <Contenu r={r} />}
    </div>
  );
}

function Contenu({ r }: { r: ReponseDataHub }) {
  const h = r.hub;
  if (h.couverture.matchs === 0) return <p className="panel-inset p-4 text-sm text-muted">Aucun match joué avec ces filtres.</p>;
  return (
    <>
      <p className="panel-inset border-l-2 border-accent p-3 text-[13px] text-ink" role="status">
        {h.couverture.matchs} match{h.couverture.matchs > 1 ? "s" : ""} joué{h.couverture.matchs > 1 ? "s" : ""}{h.couverture.matchs < r.matchsDeLaSaison ? ` (sur ${r.matchsDeLaSaison})` : ""}.{" "}
        <strong>{h.couverture.saisis} saisi{h.couverture.saisis > 1 ? "s" : ""} en direct</strong> : tirs, xG, arrêts, coups de pied arrêtés et discipline ne portent que sur ceux-là ;
        les résultats portent sur tous les matchs. Le xG est une estimation d&apos;après la zone et le contexte saisis.
      </p>
      <Resultats h={h} />
      {h.attaque && <Attaque h={h} />}
      {h.defense && <Defense h={h} />}
      {h.coupsDePiedArretes && <Cpa h={h} />}
      {h.discipline && <Discipline h={h} />}
      {(h.tirs.pour.length > 0 || h.tirs.contre.length > 0) && (
        <Bloc titre="Carte des tirs" testid="hub-carte-tirs"><CarteTirs nous={h.tirs.pour} eux={h.tirs.contre} /></Bloc>
      )}
      {h.tranches.matchsCouverts > 0 && (
        <Bloc titre="Buts par tranche de 15 minutes">
          <BarsChart height={200} legend={["Marqués", "Encaissés"]} data={TRANCHES.map((label, i) => ({ label, a: h.tranches.pour[i], b: h.tranches.contre[i] }))} />
        </Bloc>
      )}
      {h.joueurs.length > 0 && <Joueurs h={h} />}
      <Tendance h={h} />
    </>
  );
}

function Resultats({ h }: { h: DataHub }) {
  const x = h.resultats;
  return (
    <Bloc titre="Résultats" testid="hub-resultats">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tuile libelle="Bilan" valeur={`${x.v}-${x.n}-${x.d}`} detail={`${x.joues} joués`} />
        <Tuile libelle="Points" valeur={x.pts} detail={`${nb(x.ptsParMatch, 2)} par match`} />
        <Tuile libelle="Buts" valeur={`${x.bp}–${x.bc}`} detail={`différence ${x.diff > 0 ? "+" : ""}${x.diff}`} />
        <Tuile libelle="Clean sheets" valeur={x.cleanSheets} detail={`${x.sansMarquer} match${x.sansMarquer > 1 ? "s" : ""} sans marquer`} />
      </div>
      {x.forme.length > 0 && <div className="flex items-center gap-2 text-xs text-muted">Forme : <FormeStrip values={x.forme} /></div>}
    </Bloc>
  );
}

function Attaque({ h }: { h: DataHub }) {
  const a = h.attaque!;
  return (
    <Bloc titre="Attaque et occasions" testid="hub-attaque">
      <Comparatif lignes={[
        { libelle: "Tirs", ...paire(a.tirs) },
        { libelle: "Tirs par match", pour: nb(a.tirsParMatch.pour, 1), contre: nb(a.tirsParMatch.contre, 1) },
        { libelle: "Tirs cadrés", ...paire(a.cadres) },
        { libelle: "% de tirs cadrés", pour: pc(a.cadresPct.pour), contre: pc(a.cadresPct.contre) },
        { libelle: "Buts", ...paire(a.buts) },
        { libelle: "Conversion (buts / tirs)", pour: pc(a.conversion.pour), contre: pc(a.conversion.contre) },
        { libelle: "xG estimé", pour: nb(a.xg.pour, 2), contre: nb(a.xg.contre, 2), titre: "Probabilité de marquer cumulée des tirs, estimée d'après la zone et le contexte" },
        { libelle: "Grosses occasions (xG ≥ 0,3)", pour: `${a.grossesOccasions.pour} (${a.grossesOccasions.transformees} marquées)`, contre: String(a.grossesOccasions.contre) },
        { libelle: "Tirs dans le tiers offensif", ...paire(a.tiersOffensif) },
      ]} />
      <p className="text-xs text-muted">
        Buts moins xG : <strong className={a.butsMoinsXg >= 0 ? "text-win" : "text-loss"}>{signe(a.butsMoinsXg)}</strong> (positif : plus efficace que les occasions ne le prévoyaient) ·
        xG par tir : {nb(a.xgParTir, 2)}.
      </p>
      {h.contextes.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tirs par famille de jeu">
          {h.contextes.map((c) => <li key={c.famille} className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-ink">{c.famille} · {c.tirs} tir{c.tirs > 1 ? "s" : ""}{c.buts ? ` · ${c.buts} but${c.buts > 1 ? "s" : ""}` : ""}</li>)}
        </ul>
      )}
    </Bloc>
  );
}

function Defense({ h }: { h: DataHub }) {
  const d = h.defense!;
  return (
    <Bloc titre="Défense et gardien" testid="hub-defense">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tuile libelle="Buts encaissés" valeur={d.butsEncaisses} detail={`${signe(d.butsEncaissesMoinsXg)} par rapport au xG concédé`} />
        <Tuile libelle="Tirs concédés" valeur={d.tirsConcedes} detail={`${d.cadresConcedes} cadrés · xG ${nb(d.xgConcede, 2)}`} />
        <Tuile libelle="Arrêts du gardien" valeur={d.arrets} detail={`${pc(d.arretsPct)} des tirs cadrés`} />
        <Tuile libelle="Clean sheets" valeur={d.cleanSheets} detail="matchs saisis" />
      </div>
    </Bloc>
  );
}

function Cpa({ h }: { h: DataHub }) {
  const c = h.coupsDePiedArretes!;
  return (
    <Bloc titre="Coups de pied arrêtés" testid="hub-cpa">
      <Comparatif lignes={[
        { libelle: "Corners", ...paire(c.corners) }, { libelle: "Coups francs", ...paire(c.coupsFrancs) }, { libelle: "Penaltys", ...paire(c.penaltys) },
        { libelle: "Buts sur CPA ou penalty", ...paire(c.butsSurCpa) },
      ]} />
      {c.penaltysTires.tires > 0 && <p className="text-xs text-muted">Nos penaltys : {c.penaltysTires.marques} marqué{c.penaltysTires.marques > 1 ? "s" : ""} sur {c.penaltysTires.tires}.</p>}
    </Bloc>
  );
}

function Discipline({ h }: { h: DataHub }) {
  const d = h.discipline!;
  return (
    <Bloc titre="Discipline" testid="hub-discipline">
      <Comparatif lignes={[
        { libelle: "Fautes", ...paire(d.fautes) }, { libelle: "Hors-jeux", ...paire(d.horsJeux) },
        { libelle: "Cartons jaunes", ...paire(d.jaunes) }, { libelle: "Cartons rouges", ...paire(d.rouges) },
      ]} />
      <p className="text-xs text-muted">Fautes par match : {nb(d.fautesParMatch, 1)}.</p>
    </Bloc>
  );
}

const COLONNES: { cle: CleTriJoueur; libelle: string; titre: string; classe?: string }[] = [
  { cle: "matchs", libelle: "M", titre: "Matchs saisis où il apparaît", classe: "text-center" },
  { cle: "minutes", libelle: "Min", titre: "Minutes jouées (feuilles de match)", classe: "text-right max-sm:hidden" },
  { cle: "noteMoyenne", libelle: "Note", titre: "Note moyenne", classe: "text-right max-sm:hidden" },
  { cle: "buts", libelle: "B", titre: "Buts", classe: "text-center" },
  { cle: "passes", libelle: "PD", titre: "Passes décisives", classe: "text-center" },
  { cle: "passesCles", libelle: "PC", titre: "Passes clés (avant un tir non marqué)", classe: "text-center max-sm:hidden" },
  { cle: "tirs", libelle: "Tirs", titre: "Tirs", classe: "text-center" },
  { cle: "cadres", libelle: "Cad.", titre: "Tirs cadrés", classe: "text-center max-sm:hidden" },
  { cle: "xg", libelle: "xG", titre: "xG estimé", classe: "text-right" },
  { cle: "arrets", libelle: "Arr.", titre: "Arrêts", classe: "text-center max-sm:hidden" },
  { cle: "jaunes", libelle: "CJ", titre: "Cartons jaunes", classe: "text-center max-sm:hidden" },
  { cle: "rouges", libelle: "CR", titre: "Cartons rouges", classe: "text-center max-sm:hidden" },
  { cle: "scoreFatigue", libelle: "Fat.", titre: "Fatigue (0 = frais, 100 = surcharge)", classe: "text-right max-sm:hidden" },
];

function Joueurs({ h }: { h: DataHub }) {
  const [cle, setCle] = useState<CleTriJoueur>("buts");
  const [sens, setSens] = useState<"asc" | "desc">("desc");
  const trie = trierJoueursHub(h.joueurs, cle, sens);
  const choisir = (c: CleTriJoueur) => { if (c === cle) setSens((s) => (s === "asc" ? "desc" : "asc")); else { setCle(c); setSens("desc"); } };
  return (
    <Bloc titre="Joueurs" testid="hub-joueurs">
      <div className="overflow-x-auto">
        <table className="table-fm">
          <thead>
            <tr>
              <th>Joueur</th>
              {COLONNES.map((c) => (
                <th key={c.cle} className={c.classe} aria-sort={cle === c.cle ? (sens === "asc" ? "ascending" : "descending") : "none"}>
                  <button type="button" onClick={() => choisir(c.cle)} title={`${c.titre} (cliquer pour trier)`} className={`uppercase tracking-[inherit] hover:text-ink ${cle === c.cle ? "text-ink" : ""}`}>{c.libelle}{cle === c.cle ? (sens === "asc" ? " ↑" : " ↓") : ""}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trie.map((j) => (
              <tr key={j.joueurId}>
                <td><Link href={`/joueur/${j.joueurId}`} className="font-semibold hover:text-accent">{j.nom}</Link>{j.poste && <span className="ml-1.5 text-[11px] text-faint">{j.poste}</span>}</td>
                <td className="text-center tabular-nums">{j.matchs}</td>
                <td className="text-right tabular-nums text-muted max-sm:hidden">{j.minutes ?? "–"}</td>
                <td className="text-right tabular-nums text-muted max-sm:hidden">{nb(j.noteMoyenne, 1)}</td>
                <td className="text-center tabular-nums font-semibold text-accent">{j.buts || ""}</td>
                <td className="text-center tabular-nums text-sky">{j.passes || ""}</td>
                <td className="text-center tabular-nums max-sm:hidden">{j.passesCles || ""}</td>
                <td className="text-center tabular-nums">{j.tirs || ""}</td>
                <td className="text-center tabular-nums max-sm:hidden">{j.cadres || ""}</td>
                <td className="text-right tabular-nums">{j.xg ? nb(j.xg, 2) : ""}</td>
                <td className="text-center tabular-nums max-sm:hidden">{j.arrets || ""}</td>
                <td className="text-center tabular-nums text-amber max-sm:hidden">{j.jaunes || ""}</td>
                <td className="text-center tabular-nums text-danger max-sm:hidden">{j.rouges || ""}</td>
                <td className="text-right tabular-nums text-muted max-sm:hidden">{j.scoreFatigue ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-faint">M = matchs saisis où le joueur est cité, B = buts, PD = passes décisives, PC = passes clés, Cad. = tirs cadrés, Arr. = arrêts, Fat. = fatigue du moment.</p>
    </Bloc>
  );
}

function Tendance({ h }: { h: DataHub }) {
  return (
    <Bloc titre="Match par match" testid="hub-tendance">
      <div className="overflow-x-auto">
        <table className="table-fm">
          <thead><tr><th>Match</th><th className="text-center">Score</th><th className="text-center">Tirs</th><th className="text-center max-sm:hidden">Tirs contre</th><th className="text-right">xG</th><th className="text-right max-sm:hidden">xG contre</th><th className="text-center max-sm:hidden">Arrêts</th></tr></thead>
          <tbody>
            {h.parMatch.map((m) => (
              <tr key={m.matchId}>
                <td><Link href={`/matchs/${m.matchId}`} className="hover:text-accent">{m.date ?? ""} · {m.domicile ? "vs" : "@"} {m.adversaire}</Link></td>
                <td className="text-center tabular-nums">{m.bp}–{m.bc}</td>
                <td className="text-center tabular-nums">{m.saisi ? m.tirs : "–"}</td>
                <td className="text-center tabular-nums max-sm:hidden">{m.saisi ? m.tirsContre : "–"}</td>
                <td className="text-right tabular-nums">{m.saisi ? nb(m.xg, 2) : "–"}</td>
                <td className="text-right tabular-nums max-sm:hidden">{m.saisi ? nb(m.xgContre, 2) : "–"}</td>
                <td className="text-center tabular-nums max-sm:hidden">{m.saisi ? m.arrets : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-faint">« – » : match non saisi en direct (seul le score est connu).</p>
    </Bloc>
  );
}
