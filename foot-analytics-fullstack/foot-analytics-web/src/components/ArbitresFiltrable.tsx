"use client";
// src/components/ArbitresFiltrable.tsx
//
// Vue filtrable des arbitres pour MON championnat. La liste affiche
// les stats DECOMPOSEES sur le championnat de l'equipe propre (saison
// + competitionLibelle + poule). Pour comparer entre saisons, voir la
// fiche detaillee d'un arbitre.
//
// Filtres : recherche texte par nom, role (principal/assistant/autre),
// profil (Permissif/Standard/Strict/Sans profil).

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, Filter, Search, X } from "lucide-react";

interface ParticipationChamp {
  saisonId: string | null;
  saisonNom: string | null;
  anneeDebut: number;
  competitionLibelle: string | null;
  poule: string | null;
  matchsOfficies: number;
  matchsPrincipal: number;
  matchsAssistant: number;
  matchsAutre: number;
  cartonsJaunesDonnes: number;
  cartonsRougesDonnes: number;
  profil: string | null;
  motifsTop: string | null;
  noteMoyenne: number | null;
}
interface Arbitre {
  id: string;
  nom: string;
  prenom?: string | null;
  matchsOfficies: number;
  matchsPrincipal?: number;
  matchsAssistant?: number;
  matchsAutre?: number;
  roles?: string | null;
  cartonsJaunesDonnes?: number;
  cartonsRougesDonnes?: number;
  profil?: string | null;
  motifsTop?: string | null;
  noteMoyenne?: number | null;
  participations?: string | null;   // JSON serialise
}

interface Filtre {
  saisonId: string | null;
  competitionLibelle: string | null;
  poule: string | null;
}

const ROLES_LABEL: Record<string, string> = {
  principal: "Principal",
  assistant: "Assistant",
  autre: "Autre",
};
const PROFILS = ["Permissif", "Standard", "Strict", "sans_profil"] as const;
const PROFILS_LABEL: Record<string, string> = {
  Permissif: "Permissif",
  Standard: "Standard",
  Strict: "Strict",
  sans_profil: "Sans profil",
};

export function ArbitresFiltrable({
  arbitres, championnat,
}: {
  arbitres: Arbitre[];
  championnat: Filtre | null;
}) {
  const [q, setQ] = useState("");
  const [roles, setRoles] = useState<Set<string>>(new Set());
  const [profils, setProfils] = useState<Set<string>>(new Set());

  // 1) Decompose chaque arbitre en ses stats EFFECTIVES :
  //    - si on a un championnat propre : stats du JSON `participations`
  //      filtre sur ce championnat (et arbitres absents -> exclus)
  //    - sinon : on retombe sur les stats GLOBALES de l'arbitre (cumul
  //      toutes saisons/categories) — comportement de repli quand aucune
  //      equipe propre n'a pu etre resolue (nouveau compte sans cookie
  //      et sans equipe dans le club).
  type Stats = {
    matchsOfficies: number;
    matchsPrincipal: number;
    matchsAssistant: number;
    matchsAutre: number;
    cartonsJaunesDonnes: number;
    cartonsRougesDonnes: number;
    profil: string | null;
    motifsTop: string | null;
    noteMoyenne: number | null;
  };
  const arbitresChamp = useMemo(() => {
    if (!championnat) {
      // Pas de championnat propre -> stats globales pour chaque arbitre.
      return arbitres.map((a) => ({
        ...a,
        _stats: {
          matchsOfficies: a.matchsOfficies ?? 0,
          matchsPrincipal: a.matchsPrincipal ?? 0,
          matchsAssistant: a.matchsAssistant ?? 0,
          matchsAutre: a.matchsAutre ?? 0,
          cartonsJaunesDonnes: a.cartonsJaunesDonnes ?? 0,
          cartonsRougesDonnes: a.cartonsRougesDonnes ?? 0,
          profil: a.profil ?? null,
          motifsTop: a.motifsTop ?? null,
          noteMoyenne: a.noteMoyenne ?? null,
        } as Stats,
      }));
    }
    // Sinon : filtre sur championnat + stats SPECIFIQUES extraites du JSON.
    return arbitres
      .map((a) => {
        let parts: ParticipationChamp[] = [];
        try { parts = a.participations ? JSON.parse(a.participations) : []; }
        catch { parts = []; }
        const match = parts.find((p) =>
          p.saisonId === championnat.saisonId
          && (p.competitionLibelle ?? null) === (championnat.competitionLibelle ?? null)
          && (p.poule ?? null) === (championnat.poule ?? null),
        );
        if (!match) return null;
        return {
          ...a,
          _stats: {
            matchsOfficies: match.matchsOfficies,
            matchsPrincipal: match.matchsPrincipal,
            matchsAssistant: match.matchsAssistant,
            matchsAutre: match.matchsAutre,
            cartonsJaunesDonnes: match.cartonsJaunesDonnes,
            cartonsRougesDonnes: match.cartonsRougesDonnes,
            profil: match.profil,
            motifsTop: match.motifsTop,
            noteMoyenne: match.noteMoyenne,
          } as Stats,
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);
  }, [arbitres, championnat]);

  const toggle = (set: Set<string>, val: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val); else next.add(val);
    setter(next);
  };

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return arbitresChamp.filter((a) => {
      if (qq && !`${a.prenom ?? ""} ${a.nom}`.toLowerCase().includes(qq)) return false;
      // Filtre roles : evalue sur les stats EFFECTIVES (par champ ou globales).
      if (roles.size > 0) {
        const s = a._stats;
        const has = (r: string) =>
          (r === "principal" && s.matchsPrincipal > 0)
          || (r === "assistant" && s.matchsAssistant > 0)
          || (r === "autre" && s.matchsAutre > 0);
        let ok = false;
        for (const r of roles) if (has(r)) { ok = true; break; }
        if (!ok) return false;
      }
      // Filtre profil : evalue sur les stats effectives.
      if (profils.size > 0) {
        const p = a._stats.profil ?? "sans_profil";
        if (!profils.has(p)) return false;
      }
      return true;
    });
  }, [arbitresChamp, q, roles, profils]);

  const hasFilter = q.trim() !== "" || roles.size > 0 || profils.size > 0;
  const reset = () => { setQ(""); setRoles(new Set()); setProfils(new Set()); };

  return (
    <div className="space-y-4">
      {/* Barre de filtres */}
      <div className="panel p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-section flex items-center gap-2">
            <Filter size={11} className="text-turf"/>Filtres
          </div>
          {hasFilter && (
            <button onClick={reset}
              className="btn text-xs flex items-center gap-1">
              <X size={11}/> Reinitialiser
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-line bg-panel-inset max-w-xs">
          <Search size={13} className="text-faint"/>
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un nom"
            className="bg-transparent outline-none text-sm flex-1 text-ink placeholder:text-faint"/>
        </div>

        <div className="flex gap-6 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-faint mb-1.5">Role</div>
            <div className="flex gap-1.5 flex-wrap">
              {Object.entries(ROLES_LABEL).map(([k, label]) => {
                const on = roles.has(k);
                return (
                  <button key={k}
                    onClick={() => toggle(roles, k, setRoles)}
                    className={`badge text-[10px] ${on ? "badge-turf" : "opacity-70"}`}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-faint mb-1.5">Profil</div>
            <div className="flex gap-1.5 flex-wrap">
              {PROFILS.map((p) => {
                const on = profils.has(p);
                return (
                  <button key={p}
                    onClick={() => toggle(profils, p, setProfils)}
                    className={`badge text-[10px] ${on
                      ? (p === "Strict" ? "badge-danger"
                        : p === "Permissif" ? "badge-turf"
                        : p === "Standard" ? "badge-amber" : "badge-turf")
                      : "opacity-70"}`}>
                    {PROFILS_LABEL[p]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="text-[11px] text-faint">
          {filtered.length} arbitre{filtered.length > 1 ? "s" : ""}
          {hasFilter ? ` sur ${arbitresChamp.length}` : ""}
          {championnat ? (
            <span> · stats sur {championnat.competitionLibelle ?? "ce championnat"}
              {championnat.poule ? ` (Poule ${championnat.poule})` : ""}
            </span>
          ) : (
            <span> · stats globales (selectionne une equipe pour filtrer)</span>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <section className="panel p-8 text-sm text-muted text-center">
          {arbitresChamp.length === 0
            ? "Aucun arbitre n'a encore officie dans ce championnat."
            : "Aucun arbitre ne correspond a ces filtres."}
        </section>
      ) : (
        <section className="panel p-5">
          <table className="table-fm">
            <thead>
              <tr>
                <th>Arbitre</th>
                <th className="text-center">Roles</th>
                <th className="text-center">Officies</th>
                <th className="text-center">CJ donnes</th>
                <th className="text-center">CR donnes</th>
                <th>Profil</th>
                <th>Note moy.</th>
                <th>Motifs frequents</th>
                <th className="text-right"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const s = a._stats;
                const rolesArr: string[] = [];
                if (s.matchsPrincipal > 0) rolesArr.push("principal");
                if (s.matchsAssistant > 0) rolesArr.push("assistant");
                if (s.matchsAutre > 0) rolesArr.push("autre");
                return (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/arbitres/${a.id}`} className="font-semibold hover:text-turf">
                        <span className="text-faint mr-1">{a.prenom}</span>{a.nom}
                      </Link>
                    </td>
                    <td className="text-center">
                      <div className="flex gap-1 justify-center flex-wrap">
                        {rolesArr.map((r) => (
                          <span key={r} className="badge text-[9px]">
                            {ROLES_LABEL[r]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="text-center tabular-nums">{s.matchsOfficies}</td>
                    <td className="text-center text-amber font-mono">{s.cartonsJaunesDonnes || ""}</td>
                    <td className="text-center text-danger font-mono">{s.cartonsRougesDonnes || ""}</td>
                    <td>
                      {s.profil ? (
                        <span className={`badge ${
                          s.profil === "Strict" ? "badge-danger"
                          : s.profil === "Permissif" ? "badge-turf" : "badge-amber"
                        }`}>{s.profil}</span>
                      ) : <span className="text-faint">—</span>}
                    </td>
                    <td className="font-semibold text-turf tabular-nums">
                      {s.noteMoyenne != null ? s.noteMoyenne.toFixed(1) : <span className="text-faint">—</span>}
                    </td>
                    <td className="text-[11px] text-faint">{s.motifsTop ?? ""}</td>
                    <td className="text-right">
                      <Link href={`/arbitres/${a.id}`} className="btn text-xs">
                        <ChevronRight size={11}/>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
