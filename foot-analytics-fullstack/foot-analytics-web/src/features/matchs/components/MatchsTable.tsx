"use client";
// src/features/matchs/components/MatchsTable.tsx
//
// Liste des matchs avec filtres interactifs par saison, equipe (de notre
// club), journee et adversaire. Selects natifs : compact, mobile-OK.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Filter, X } from "lucide-react";

import { useOwnEquipe } from "@/features/equipes/lib/own-equipe-context";
import { ClubBadge } from "@/features/clubs/components/ClubBadge";
import { Select } from "@/shared/ui/Select";
import type { Match, Club } from "@/shared/lib/types";

import { DeleteMatchButton } from "./DeleteMatchButton";

interface Props {
  matchs: Match[];
  clubs: Club[];
  saisons?: { id: string; nom: string; actif: boolean }[];
  equipes?: {
    id: string; nom: string; clubId: string; saisonId?: string | null;
    competitionLibelle?: string | null; poule?: string | null;
  }[];
}

export function MatchsTable({ matchs, clubs, saisons = [], equipes = [] }: Props) {
  const { equipeId: ownEqId, saisonId: ownSaisonId } = useOwnEquipe();
  // Saison FORCEE par le switcher en bas a gauche : on n'expose pas de
  // filtre UI ici, l'utilisateur change de saison via le switcher global
  // (cf. demande utilisateur). Si pas de saison selectionnee, on retombe
  // sur la saison active.
  const saisonActive = saisons.find((s) => s.actif);
  const saisonId = ownSaisonId ?? saisonActive?.id ?? "all";
  // Aucun filtre par defaut : tous les matchs du championnat. L'equipe et la journee se choisissent a la demande.
  const [equipeId, setEquipeId] = useState<string>("all");
  const [journee, setJournee] = useState<string>("all");

  // Pour distinguer les equipes du dropdown (qui s'appellent toutes
  // "Seniors D2 Poule C" par defaut), on cherche le nom du club correspondant.
  const clubNomById = useMemo(
    () => new Map(clubs.map((c) => [c.id, c.nom])),
    [clubs],
  );

  // Equipes proposees dans le filtre :
  //   - Restreintes au championnat de l'equipe propre selectionnee dans
  //     la sidebar (meme saison + meme competition + meme poule). Cela
  //     evite de voir des equipes hors-poule, et c'est ce qui est
  //     attendu : "filtrer mes matchs vs telle equipe de ma poule".
  //   - Si pas d'equipe propre selectionnee : on retombe sur les equipes
  //     de la saison courante.
  const monEquipe = ownEqId ? equipes.find((e) => e.id === ownEqId) : null;
  const equipesPourSaison = useMemo(() => {
    if (monEquipe) {
      return equipes.filter((e) =>
        e.saisonId === monEquipe.saisonId
        && (e.competitionLibelle ?? null) === (monEquipe.competitionLibelle ?? null)
        && (e.poule ?? null) === (monEquipe.poule ?? null),
      );
    }
    if (saisonId === "all") return equipes;
    return equipes.filter((e) => (e.saisonId ?? "") === saisonId);
  }, [equipes, saisonId, monEquipe]);

  // Liste des journees presentes pour les matchs filtres en amont
  // (saison + equipe).
  const matchsApresSaisonEtEquipe = useMemo(() => {
    return matchs.filter((m) => {
      if (saisonId !== "all" && (m as any).saisonId !== saisonId) return false;
      if (equipeId !== "all"
          && (m as any).equipeDomId !== equipeId
          && (m as any).equipeExtId !== equipeId) return false;
      return true;
    });
  }, [matchs, saisonId, equipeId]);

  const journees = useMemo(() => {
    const set = new Set<string>();
    for (const m of matchsApresSaisonEtEquipe) {
      if (m.journee && m.journee !== "—") set.add(m.journee);
    }
    return [...set].sort((a, b) => Number(a) - Number(b));
  }, [matchsApresSaisonEtEquipe]);

  const filtres = useMemo(() => {
    return matchsApresSaisonEtEquipe
      .filter((m) => {
        if (journee !== "all" && m.journee !== journee) return false;
        return true;
      })
      .sort((a, b) => {
        const ja = parseInt((a.journee ?? "").replace(/[^0-9]/g, ""), 10) || 0;
        const jb = parseInt((b.journee ?? "").replace(/[^0-9]/g, ""), 10) || 0;
        if (ja !== jb) return jb - ja;
        return (b.date ?? "").localeCompare(a.date ?? "");
      });
  }, [matchsApresSaisonEtEquipe, journee]);

  const hasFilter = equipeId !== "all" || journee !== "all";
  const reset = () => {
    setEquipeId("all");
    setJournee("all");
  };

  return (
    <section className="panel p-5 space-y-4">
      {/* Barre de filtres */}
      <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-line">
        <div className="flex items-center gap-2 text-xs text-muted">
          <Filter size={12} className="text-accent"/>
          <span className="uppercase tracking-wider font-bold">Filtres</span>
        </div>

        {/* Saison : pas de UI ici, c'est le switcher en bas a gauche qui
            pilote globalement. On affiche juste le nom de la saison
            courante en lecture seule pour le contexte. */}
        {saisonId !== "all" && (() => {
          const s = saisons.find((x) => x.id === saisonId);
          return s ? (
            <span className="text-[10px] uppercase tracking-wider text-faint">
              Saison <span className="text-ink font-semibold">{s.nom}</span>
              {s.actif && <span className="text-accent ml-1">★</span>}
            </span>
          ) : null;
        })()}

        {equipesPourSaison.length > 0 && (
          <label className="flex items-center gap-2 text-xs">
            <span className="text-faint">Equipe</span>
            <Select
              valeur={equipeId} onChange={setEquipeId} className="select-fm min-w-[200px]" ariaLabel="Equipe"
              options={[
                { valeur: "all", libelle: `Toutes (${equipesPourSaison.length})` },
                ...equipesPourSaison
                  .slice()
                  .sort((a, b) => (clubNomById.get(a.clubId) ?? "").localeCompare(clubNomById.get(b.clubId) ?? ""))
                  .map((e) => ({ valeur: e.id, libelle: clubNomById.get(e.clubId) ?? e.nom })),
              ]}
            />
          </label>
        )}

        <label className="flex items-center gap-2 text-xs">
          <span className="text-faint">Journee</span>
          <Select
            valeur={journee} onChange={setJournee} className="select-fm" ariaLabel="Journee"
            options={[
              { valeur: "all", libelle: `Toutes (${journees.length})` },
              ...journees.map((j) => ({ valeur: String(j), libelle: `J${j}` })),
            ]}
          />
        </label>

        {hasFilter && (
          <button
            onClick={reset}
            className="btn text-xs ml-auto flex items-center gap-1"
          >
            <X size={11}/> Reinitialiser
          </button>
        )}

        <div className={`text-xs tabular-nums ${hasFilter ? "" : "ml-auto"} text-faint`}>
          {filtres.length} / {matchs.length} matchs
        </div>
      </div>

      {/* Tableau */}
      {filtres.length === 0 ? (
        <p className="text-sm text-muted text-center py-8">
          Aucun match ne correspond a ces filtres.
        </p>
      ) : (
        <table className="table-fm">
          <thead>
            <tr>
              <th>J</th>
              <th>Date</th>
              <th>Recevant</th>
              <th className="text-center">Score</th>
              <th>Visiteur</th>
              <th>Compet.</th>
              <th>FMI</th>
              <th><span className="sr-only">Ouvrir</span></th>
            </tr>
          </thead>
          <tbody>
            {filtres.map((m) => {
              const dom = clubs.find((c) => c.id === m.clubDom);
              const ext = clubs.find((c) => c.id === m.clubExt);
              const isFmi = !!m.numeroFmi;
              return (
                <tr key={m.id}>
                  <td className="font-mono text-muted">
                    {m.journee && m.journee !== "—" ? `J${m.journee}` : "—"}
                  </td>
                  <td className="text-xs text-muted">{m.date || "—"}</td>
                  <td>
                    <Link href={`/club/${m.clubDom}`} className="flex items-center gap-2 hover:text-accent">
                      <ClubBadge clubId={m.clubDom} size={20}/>
                      <span className="font-semibold">{dom?.nom}</span>
                    </Link>
                  </td>
                  <td className="text-center font-mono font-bold tabular-nums">
                    {m.scoreDom}–{m.scoreExt}
                  </td>
                  <td>
                    <Link href={`/club/${m.clubExt}`} className="flex items-center gap-2 hover:text-accent">
                      <ClubBadge clubId={m.clubExt} size={20}/>
                      <span className="font-semibold">{ext?.nom}</span>
                    </Link>
                  </td>
                  <td><span className="badge">{m.competition}</span></td>
                  <td>{isFmi && <span className="badge badge-accent">FMI</span>}</td>
                  <td className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <Link href={`/matchs/${m.id}`} className="btn text-xs">Detail</Link>
                      {m.modifiable !== false && <DeleteMatchButton matchId={m.id} label={`J${m.journee} ${m.scoreDom}-${m.scoreExt}`}/>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
