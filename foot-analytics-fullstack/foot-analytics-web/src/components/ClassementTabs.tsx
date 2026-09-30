// src/components/ClassementTabs.tsx
"use client";

// Trois onglets sur la page classement :
//   1. Classement : table FFF avec tri par colonne (clic sur l'entete).
//   2. Stats equipes : agreges par club (BM, BC, dom/ext, cartons, forme).
//   3. Stats joueurs : top joueurs trans-clubs (matchs, forme, buts, etc).

import { TabBar } from "@/components/TabBar";
import { useMemo, useState, useRef } from "react";
import Link from "next/link";
import { ClubBadge } from "@/components/ClubBadge";
import { FormeStrip } from "@/components/Charts";
import type {
  Club, Joueur, LigneClassement, Match, Issue,
} from "@/lib/types";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

type Tab = "table" | "teams" | "players";

const TABS: { id: Tab; label: string }[] = [
  { id: "table", label: "Classement" },
  { id: "teams", label: "Stats equipes" },
  { id: "players", label: "Stats joueurs" },
];

interface Props {
  classement: LigneClassement[];
  clubs: Club[];
  matchs: Match[];
  joueurs: Joueur[];
  ownClubId: string;
}

export function ClassementTabs({
  classement, clubs, matchs, joueurs, ownClubId,
}: Props) {
  const [tab, setTab] = useState<Tab>("table");
  return (
    <div className="space-y-5">
      <TabBar onglets={TABS} actif={tab} onChange={setTab} label="Vues du classement" />

      {tab === "table" && (
        <TableClassement classement={classement} clubs={clubs} ownClubId={ownClubId}/>
      )}
      {tab === "teams" && (
        <TeamStats matchs={matchs} clubs={clubs} ownClubId={ownClubId}/>
      )}
      {tab === "players" && (
        <PlayerStats joueurs={joueurs} clubs={clubs} ownClubId={ownClubId}/>
      )}
    </div>
  );
}

/* ============================================================ */
/*                       Table de classement                      */
/* ============================================================ */
type ClassementKey = "rang"|"clubNom"|"pts"|"joues"|"v"|"n"|"d"|"bp"|"bc"|"diff";
const CLASSEMENT_COLS: { key: ClassementKey; label: string; align?: string }[] = [
  { key: "rang",    label: "#" },
  { key: "clubNom", label: "Club" },
  { key: "joues",   label: "J",   align: "text-center" },
  { key: "v",       label: "V",   align: "text-center" },
  { key: "n",       label: "N",   align: "text-center" },
  { key: "d",       label: "D",   align: "text-center" },
  { key: "bp",      label: "BP",  align: "text-center" },
  { key: "bc",      label: "BC",  align: "text-center" },
  { key: "diff",    label: "Diff",align: "text-right" },
  { key: "pts",     label: "Pts", align: "text-right" },
];

function TableClassement({ classement, clubs, ownClubId }:
  { classement: LigneClassement[]; clubs: Club[]; ownClubId: string }) {
  const clubNom = (id: string) => clubs.find((c) => c.id === id)?.nom ?? id;

  const enriched = classement.map((l) => ({
    ...l, clubNom: clubNom(l.clubId), diff: l.bp - l.bc,
  }));

  const { rows, sortKey, sortDir, toggleSort } = useSortable(
    enriched, "rang", "asc",
    {
      clubNom: (r) => r.clubNom.toLowerCase(),
    },
  );

  if (classement.length === 0) {
    return (
      <div className="panel-inset p-4 text-sm text-muted">
        Aucune donnee de classement. Importez des feuilles de match ou ajoutez
        un match manuel — le classement se calcule automatiquement.
      </div>
    );
  }

  return (
    <section className="panel p-5">
      <table className="table-fm">
        <thead>
          <tr>
            {CLASSEMENT_COLS.map((c) => (
              <th key={c.key} className={`${c.align ?? ""}`}>
                <SortHeader
                  label={c.label}
                  active={sortKey === c.key}
                  dir={sortDir}
                  onClick={() => toggleSort(c.key)}
                />
              </th>
            ))}
            <th>Forme</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.clubId} className={l.clubId === ownClubId ? "is-mine" : ""}>
              <td className="font-mono text-muted">{l.rang}</td>
              <td>
                <Link href={`/club/${l.clubId}`} className="flex items-center gap-2 hover:text-accent">
                  <ClubBadge clubId={l.clubId} size={22}/>
                  <span className="text-sm">{l.clubNom}</span>
                </Link>
              </td>
              <td className="text-center tabular-nums">{l.joues}</td>
              <td className="text-center tabular-nums text-win">{l.v}</td>
              <td className="text-center tabular-nums text-draw">{l.n}</td>
              <td className="text-center tabular-nums text-loss">{l.d}</td>
              <td className="text-center tabular-nums">{l.bp}</td>
              <td className="text-center tabular-nums">{l.bc}</td>
              <td className={`text-right tabular-nums ${l.diff>=0?"text-win":"text-loss"}`}>
                {l.diff>=0?"+":""}{l.diff}
              </td>
              <td className="text-right font-display font-bold">{l.pts}</td>
              <td><FormeStrip values={(l.forme ?? []) as Issue[]}/></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/* ============================================================ */
/*                          Stats equipes                         */
/* ============================================================ */
type TeamRow = {
  clubId: string; clubNom: string;
  joues: number; v: number; n: number; d: number;
  bp: number; bc: number; diff: number;
  bpMoy: number; bcMoy: number;
  domV: number; domN: number; domD: number; domBP: number; domBC: number;
  extV: number; extN: number; extD: number; extBP: number; extBC: number;
  cleanSheets: number; bigWins: number; bigLoss: number;
};

type TeamKey = keyof TeamRow;
const TEAM_COLS: { key: TeamKey; label: string; align?: string; title?: string }[] = [
  { key: "clubNom",     label: "Club" },
  { key: "joues",       label: "J",   align: "text-center" },
  { key: "bp",          label: "BP",  align: "text-center" },
  { key: "bc",          label: "BC",  align: "text-center" },
  { key: "diff",        label: "Diff",align: "text-right" },
  { key: "bpMoy",       label: "BP/m",align: "text-right", title: "Buts marques par match" },
  { key: "bcMoy",       label: "BC/m",align: "text-right", title: "Buts encaisses par match" },
  { key: "domV",        label: "Dom V", align: "text-center" },
  { key: "extV",        label: "Ext V", align: "text-center" },
  { key: "cleanSheets", label: "CS",  align: "text-center", title: "Clean sheets (BC = 0)" },
  { key: "bigWins",     label: "Larges V", align: "text-center", title: "Victoires de 3 buts ou plus" },
];

function TeamStats({ matchs, clubs, ownClubId }:
  { matchs: Match[]; clubs: Club[]; ownClubId: string }) {
  const rows = useMemo<TeamRow[]>(() => {
    const byClub = new Map<string, TeamRow>();
    const ensure = (id: string): TeamRow => {
      if (!byClub.has(id)) {
        byClub.set(id, {
          clubId: id, clubNom: clubs.find((c) => c.id === id)?.nom ?? id,
          joues: 0, v: 0, n: 0, d: 0, bp: 0, bc: 0, diff: 0, bpMoy: 0, bcMoy: 0,
          domV: 0, domN: 0, domD: 0, domBP: 0, domBC: 0,
          extV: 0, extN: 0, extD: 0, extBP: 0, extBC: 0,
          cleanSheets: 0, bigWins: 0, bigLoss: 0,
        });
      }
      return byClub.get(id)!;
    };
    for (const m of matchs) {
      if (m.statut && m.statut !== "joue") continue;
      const dom = ensure(m.clubDom);
      const ext = ensure(m.clubExt);
      dom.joues++; ext.joues++;
      dom.bp += m.scoreDom; dom.bc += m.scoreExt;
      ext.bp += m.scoreExt; ext.bc += m.scoreDom;
      dom.domBP += m.scoreDom; dom.domBC += m.scoreExt;
      ext.extBP += m.scoreExt; ext.extBC += m.scoreDom;
      if (m.scoreExt === 0) dom.cleanSheets++;
      if (m.scoreDom === 0) ext.cleanSheets++;
      if (m.scoreDom > m.scoreExt) {
        dom.v++; ext.d++; dom.domV++; ext.extD++;
        if (m.scoreDom - m.scoreExt >= 3) dom.bigWins++;
        if (m.scoreDom - m.scoreExt >= 3) ext.bigLoss++;
      } else if (m.scoreDom < m.scoreExt) {
        dom.d++; ext.v++; dom.domD++; ext.extV++;
        if (m.scoreExt - m.scoreDom >= 3) ext.bigWins++;
        if (m.scoreExt - m.scoreDom >= 3) dom.bigLoss++;
      } else {
        dom.n++; ext.n++; dom.domN++; ext.extN++;
      }
    }
    for (const r of byClub.values()) {
      r.diff = r.bp - r.bc;
      r.bpMoy = r.joues ? +(r.bp / r.joues).toFixed(2) : 0;
      r.bcMoy = r.joues ? +(r.bc / r.joues).toFixed(2) : 0;
    }
    return [...byClub.values()];
  }, [matchs, clubs]);

  const { rows: sorted, sortKey, sortDir, toggleSort } = useSortable<TeamRow>(
    rows, "bp", "desc",
    { clubNom: (r) => r.clubNom.toLowerCase() },
  );

  if (rows.length === 0) {
    return <div className="panel-inset p-4 text-sm text-muted">
      Aucun match en base. Importez des FMI pour voir les stats.
    </div>;
  }

  // KPIs : meilleur attaque, meilleure defense, meilleur a domicile, meilleur a l'exterieur
  const best = (k: keyof TeamRow, dir: "max" | "min" = "max") => {
    const sorted2 = [...rows].sort(
      (a, b) => dir === "max" ? (b[k] as number) - (a[k] as number) : (a[k] as number) - (b[k] as number),
    );
    return sorted2[0];
  };
  const meilleureAttaque = best("bp");
  const meilleureDefense = best("bc", "min");
  const meilleureDom = best("domV");
  const meilleureExt = best("extV");

  return (
    <>
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Meilleure attaque" club={meilleureAttaque} val={`${meilleureAttaque.bp} buts`}/>
        <KpiCard label="Meilleure defense" club={meilleureDefense} val={`${meilleureDefense.bc} encaisses`}/>
        <KpiCard label="Meilleur a domicile" club={meilleureDom} val={`${meilleureDom.domV}V`}/>
        <KpiCard label="Meilleur a l'exterieur" club={meilleureExt} val={`${meilleureExt.extV}V`}/>
      </section>

      <section className="panel p-5">
        <div className="h-section mb-3">Statistiques par equipe</div>
        <table className="table-fm">
          <thead>
            <tr>
              {TEAM_COLS.map((c) => (
                <th key={c.key} className={c.align ?? ""} title={c.title}>
                  <SortHeader
                    label={c.label}
                    active={sortKey === c.key}
                    dir={sortDir}
                    onClick={() => toggleSort(c.key)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.clubId} className={r.clubId === ownClubId ? "is-mine" : ""}>
                <td>
                  <Link href={`/club/${r.clubId}`} className="flex items-center gap-2 hover:text-accent">
                    <ClubBadge clubId={r.clubId} size={20}/>
                    <span className="text-sm">{r.clubNom}</span>
                  </Link>
                </td>
                <td className="text-center tabular-nums">{r.joues}</td>
                <td className="text-center tabular-nums">{r.bp}</td>
                <td className="text-center tabular-nums">{r.bc}</td>
                <td className={`text-right tabular-nums ${r.diff>=0?"text-win":"text-loss"}`}>
                  {r.diff>=0?"+":""}{r.diff}
                </td>
                <td className="text-right tabular-nums">{r.bpMoy.toFixed(2)}</td>
                <td className="text-right tabular-nums">{r.bcMoy.toFixed(2)}</td>
                <td className="text-center tabular-nums text-win">{r.domV}</td>
                <td className="text-center tabular-nums text-win">{r.extV}</td>
                <td className="text-center tabular-nums">{r.cleanSheets}</td>
                <td className="text-center tabular-nums">{r.bigWins}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function KpiCard({ label, club, val }: { label: string; club: TeamRow; val: string }) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <Link href={`/club/${club.clubId}`} className="flex items-center gap-2 mt-2 hover:text-accent">
        <ClubBadge clubId={club.clubId} size={28}/>
        <div className="min-w-0 flex-1">
          <div className="font-display font-bold text-ink truncate text-sm">{club.clubNom}</div>
          <div className="text-[11px] text-accent">{val}</div>
        </div>
      </Link>
    </div>
  );
}

/* ============================================================ */
/*                          Stats joueurs                         */
/* ============================================================ */
type PlayerRow = Joueur & { clubNom: string };
type PlayerKey = "clubNom"|"prenom"|"nom"|"matchs"|"titularisations"|"minutes"
  |"buts"|"passesDecisives"|"cartonsJaunes"|"cartonsRouges"|"noteMoyenne"|"scoreForme";

const PLAYER_COLS: { key: PlayerKey; label: string; align?: string }[] = [
  { key: "nom",             label: "Joueur" },
  { key: "clubNom",         label: "Club" },
  { key: "matchs",          label: "Mat.", align: "text-center" },
  { key: "titularisations", label: "Titu", align: "text-center" },
  { key: "minutes",         label: "Min.", align: "text-center" },
  { key: "buts",            label: "B",    align: "text-center" },
  { key: "passesDecisives", label: "PD",   align: "text-center" },
  { key: "cartonsJaunes",   label: "CJ",   align: "text-center" },
  { key: "cartonsRouges",   label: "CR",   align: "text-center" },
  { key: "noteMoyenne",     label: "Note", align: "text-right" },
  { key: "scoreForme",      label: "Forme",align: "text-right" },
];

function PlayerStats({ joueurs, clubs, ownClubId }:
  { joueurs: Joueur[]; clubs: Club[]; ownClubId: string }) {
  const rows: PlayerRow[] = useMemo(() => joueurs.map((j) => ({
    ...j, clubNom: clubs.find((c) => c.id === j.clubId)?.nom ?? "",
  })), [joueurs, clubs]);

  const { rows: sorted, sortKey, sortDir, toggleSort } = useSortable<PlayerRow>(
    rows, "matchs", "desc",
    {
      nom: (r) => r.nom.toLowerCase(),
      clubNom: (r) => r.clubNom.toLowerCase(),
    },
  );

  if (rows.length === 0) {
    return <div className="panel-inset p-4 text-sm text-muted">
      Aucun joueur. Importez des FMI ou completez l'effectif depuis la page Effectif.
    </div>;
  }

  return (
    <section className="panel p-5">
      <div className="h-section mb-3">Statistiques joueurs ({rows.length})</div>
      <table className="table-fm">
        <thead>
          <tr>
            {PLAYER_COLS.map((c) => (
              <th key={c.key} className={c.align ?? ""}>
                <SortHeader
                  label={c.label}
                  active={sortKey === c.key}
                  dir={sortDir}
                  onClick={() => toggleSort(c.key)}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 100).map((j) => {
            // /joueurs/championnat renvoie id=null pour un joueur vu dans
            // les feuilles de match mais absent de la table des profils :
            // pas de fiche vers laquelle pointer.
            const cle = j.id || `${j.licence ?? ""}|${j.nom}|${j.prenom}`;
            // Pour les joueurs adverses, les stats offensives (buts /
            // passes decisives) ne refletent que ce qu'on a observe lors
            // de nos confrontations directes. Une valeur 0 est trompeuse
            // (peut etre meilleur buteur de sa propre equipe). On affiche
            // donc "—" plutot que 0 pour les joueurs des autres clubs.
            // Pour nos propres joueurs, on garde le 0 (stat reelle).
            const isMine = j.clubId === ownClubId;
            const showOff = (v: number | undefined) =>
              isMine ? (v || "") : ((v ?? 0) > 0 ? v : "—");
            return (
            <tr key={cle} className={isMine ? "is-mine" : ""}>
              <td>
                {j.id ? (
                  <Link href={`/joueur/${j.id}`} className="font-semibold hover:text-accent">
                    <span className="text-faint">{j.prenom} </span>{j.nom}
                  </Link>
                ) : (
                  <span className="font-semibold">
                    <span className="text-faint">{j.prenom} </span>{j.nom}
                  </span>
                )}
              </td>
              <td>
                <Link href={`/club/${j.clubId}`} className="flex items-center gap-1.5 hover:text-accent">
                  <ClubBadge clubId={j.clubId} size={16}/>
                  <span className="text-xs text-muted">{j.clubNom}</span>
                </Link>
              </td>
              <td className="text-center tabular-nums">{j.matchs}</td>
              <td className="text-center tabular-nums">{j.titularisations}</td>
              <td className="text-center tabular-nums text-muted">{j.minutes}</td>
              <td className={`text-center tabular-nums ${isMine ? "text-accent" : ""}`}>
                {showOff(j.buts)}
              </td>
              <td className={`text-center tabular-nums ${isMine ? "text-sky" : ""}`}>
                {showOff(j.passesDecisives)}
              </td>
              <td className="text-center tabular-nums text-amber">{j.cartonsJaunes || ""}</td>
              <td className="text-center tabular-nums text-danger">{j.cartonsRouges || ""}</td>
              <td className="text-right font-semibold text-accent tabular-nums">
                {j.noteMoyenne != null ? j.noteMoyenne.toFixed(1) : "—"}
              </td>
              <td className="text-right">
                <div className="inline-flex items-center gap-1.5">
                  <div className="w-12 h-1.5 bg-line rounded-full overflow-hidden">
                    <div className="h-full bg-accent" style={{width:`${j.scoreForme ?? 0}%`}}/>
                  </div>
                  <span className="text-xs tabular-nums w-6 text-right">{j.scoreForme ?? 0}</span>
                </div>
              </td>
            </tr>);
          })}
        </tbody>
      </table>
      {rows.length > 100 && (
        <p className="text-[11px] text-faint mt-3 text-center">
          Affichage des 100 premiers ({rows.length} joueurs au total).
        </p>
      )}
    </section>
  );
}

/* ============================================================ */
/*                  Hook + composant en-tete tri                  */
/* ============================================================ */
function useSortable<T>(
  rows: T[],
  initialKey: keyof T,
  initialDir: "asc" | "desc",
  extractors: Partial<Record<keyof T, (r: T) => string | number>> = {},
) {
  const [sortKey, setSortKey] = useState<keyof T>(initialKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(initialDir);

  function toggleSort(k: keyof T) {
    if (k === sortKey) {
      setSortDir((d) => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

  // Les extracteurs sont recrees a chaque rendu par l'appelant : on lit la derniere version
  // sans en faire une dependance du tri (le tri ne bouge que si lignes ou cle changent).
  const extracteurs = useRef(extractors);
  extracteurs.current = extractors;
  const sorted = useMemo(() => {
    const ex = extracteurs.current[sortKey] as ((r: T) => any) | undefined;
    const get = (r: T): any => ex ? ex(r) : (r as any)[sortKey];
    return [...rows].sort((a, b) => {
      const av = get(a); const bv = get(b);
      const cmp = typeof av === "string"
        ? av.localeCompare(typeof bv === "string" ? bv : "")
        : (av ?? 0) - (bv ?? 0);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir]);

  return { rows: sorted, sortKey, sortDir, toggleSort };
}

function SortHeader({
  label, active, dir, onClick,
}: { label: string; active: boolean; dir: "asc"|"desc"; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 hover:text-ink ${active ? "text-accent" : ""}`}
    >
      <span>{label}</span>
      {active ? (
        dir === "asc" ? <ArrowUp size={10}/> : <ArrowDown size={10}/>
      ) : (
        <ArrowUpDown size={10} className="text-faint"/>
      )}
    </button>
  );
}
