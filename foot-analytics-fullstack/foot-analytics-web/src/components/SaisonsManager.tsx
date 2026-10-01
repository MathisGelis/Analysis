"use client";
// src/components/SaisonsManager.tsx
//
// Tableau des saisons : creer, activer, lister. Les actions appellent
// le backend puis font un refresh router. Creer, activer une saison et fusionner des equipes
// concernent tous les clubs : l'API les reserve a l'administrateur, les autres comptes ne voient que la liste.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getCachedUser } from "@/lib/auth";
import { grouperParChampionnat } from "@/lib/championnats";
import { ClubBadge } from "@/components/ClubBadge";
import { Calendar, Check, Plus, Star } from "lucide-react";
import type { Club } from "@/lib/types";

interface Props {
  saisons: any[];
  equipes: any[];
  clubs: Club[];
  /** Clones provisoires devenus doublons de la vraie equipe (simulation de la reconciliation). */
  fusionsEnAttente?: {
    club: string; saison: string;
    source: { nom: string; poule: string | null };
    cible: { nom: string; poule: string | null };
    joueursDeplaces: number;
  }[];
}

const LIBELLE_STATUT: Record<string, string> = {
  en_cours: "En cours", terminee: "Terminee", a_venir: "A venir",
};

export function SaisonsManager({ saisons, equipes, clubs, fusionsEnAttente = [] }: Props) {
  const nomClub = (id: string) => clubs.find((c) => c.id === id)?.nom ?? id;
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [nom, setNom] = useState("");
  const [anneeDebut, setAnneeDebut] = useState<string>(
    String(new Date().getFullYear()),
  );
  const [busy, setBusy] = useState(false);
  // Le role vient du navigateur (jeton en cache) : lu apres le montage, donc sans ecart d'hydratation.
  const [estAdmin, setEstAdmin] = useState(false);
  useEffect(() => { setEstAdmin(getCachedUser()?.role === "admin"); }, []);

  const equipesParSaison = (saisonId: string) =>
    equipes.filter((e) => e.saisonId === saisonId);

  const onFusionner = async () => {
    setBusy(true);
    try { await api.reconcilierEquipes(true); router.refresh(); }
    finally { setBusy(false); }
  };
  const onActiver = async (id: string) => {
    setBusy(true);
    try { await api.activerSaison(id); router.refresh(); }
    finally { setBusy(false); }
  };
  const onCreer = async () => {
    if (!nom.trim()) return;
    setBusy(true);
    try {
      await api.creerSaison({
        nom: nom.trim(), anneeDebut: parseInt(anneeDebut, 10) || new Date().getFullYear(),
        actif: false,
      });
      setNom(""); setCreating(false); router.refresh();
    } finally { setBusy(false); }
  };

  return (
    <section className="space-y-4">
      {estAdmin && fusionsEnAttente.length > 0 && (
        <div className="panel-inset p-4 border-l-2 border-amber space-y-2" role="status">
          <div className="text-sm font-semibold text-ink">
            {fusionsEnAttente.length} equipe{fusionsEnAttente.length > 1 ? "s" : ""} provisoire
            {fusionsEnAttente.length > 1 ? "s" : ""} en doublon
          </div>
          <p className="text-xs text-muted">
            La saison a ete reconstruite avec les poules de l'an passe ; la vraie
            poule est connue depuis l'import des feuilles. Les equipes provisoires
            (sans match) sont fusionnees dans la vraie, joueurs et seances compris.
          </p>
          <ul className="text-xs space-y-0.5">
            {fusionsEnAttente.map((f, i) => (
              <li key={i}>
                <strong className="text-ink">{f.club}</strong> · {f.saison} :{" "}
                {f.source.nom} <span className="text-faint">→</span> {f.cible.nom}
                {f.joueursDeplaces > 0 && (
                  <span className="text-faint"> ({f.joueursDeplaces} joueur{f.joueursDeplaces > 1 ? "s" : ""} rattache{f.joueursDeplaces > 1 ? "s" : ""})</span>
                )}
              </li>
            ))}
          </ul>
          <button className="btn btn-accent text-xs" onClick={onFusionner} disabled={busy}>
            Fusionner maintenant
          </button>
        </div>
      )}

      <div className="panel p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="h-section flex items-center gap-2">
            <Calendar size={11} className="text-accent"/>
            Saisons enregistrees ({saisons.length})
          </div>
          {estAdmin && (
            <button
              className="btn text-xs"
              onClick={() => setCreating((c) => !c)}
            >
              <Plus size={12}/> Nouvelle saison
            </button>
          )}
        </div>

        {creating && (
          <div className="panel-inset p-3 mb-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-faint">Nom</span>
              <input
                className="inp text-sm"
                placeholder="2026-2027"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-faint">Annee de debut</span>
              <input
                className="inp text-sm w-28"
                type="number"
                value={anneeDebut}
                onChange={(e) => setAnneeDebut(e.target.value)}
              />
            </label>
            <button
              className="btn btn-primary text-xs"
              onClick={onCreer} disabled={busy || !nom.trim()}
            >
              Creer
            </button>
            <button className="btn text-xs" onClick={() => setCreating(false)}>
              Annuler
            </button>
          </div>
        )}

        {saisons.length === 0 ? (
          <p className="text-sm text-muted text-center py-6">
            Aucune saison enregistree. Importez des FMI : une saison sera
            creee automatiquement depuis la date des matchs.
          </p>
        ) : (
          <table className="table-fm">
            <thead>
              <tr>
                <th>Saison</th>
                <th>Statut</th>
                <th className="text-center">Annee debut</th>
                <th className="text-center">Equipes</th>
                <th className="text-right"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {saisons.map((s) => (
                <tr key={s.id} className={s.actif ? "is-mine" : ""}>
                  <td className="font-display font-bold">
                    {s.actif && <Star size={11} className="inline text-accent mr-1.5"/>}
                    {s.nom}
                  </td>
                  <td>
                    <span className={`badge text-[10px] ${
                      s.statut === "en_cours" ? "badge-accent"
                      : s.statut === "terminee" ? "" : "badge-amber"
                    }`}>{LIBELLE_STATUT[s.statut] ?? s.statut}</span>
                  </td>
                  <td className="text-center tabular-nums">{s.anneeDebut}</td>
                  <td className="text-center tabular-nums">
                    {equipesParSaison(s.id).length}
                  </td>
                  <td className="text-right">
                    {s.actif ? (
                      <span className="text-xs text-accent flex items-center justify-end gap-1">
                        <Check size={11}/> Active
                      </span>
                    ) : estAdmin ? (
                      <button
                        className="btn text-xs"
                        disabled={busy}
                        onClick={() => onActiver(s.id)}
                      >
                        Activer
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Liste des equipes par saison */}
      {saisons.length > 0 && (
        <div className="panel p-5">
          <div className="h-section mb-3">Equipes par saison</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {saisons.map((s) => {
              const equ = equipesParSaison(s.id);
              return (
                <div key={s.id} className="panel-inset p-3">
                  <div className="font-display font-bold mb-2">
                    {s.nom} {s.actif && <Star size={10} className="inline text-accent"/>}
                  </div>
                  {equ.length === 0 ? (
                    <p className="text-xs text-faint">Aucune equipe rattachee.</p>
                  ) : (
                    <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
                      {/* Par championnat : "Seniors D2 · Poule C (12 equipes)" puis les clubs. */}
                      {grouperParChampionnat(equ, nomClub).map((g) => (
                        <div key={g.cle}>
                          <div className="text-[11px] font-semibold text-ink flex items-baseline gap-2">
                            {g.libelle}{g.poule ? ` · Poule ${g.poule}` : ""}
                            <span className="text-faint font-normal">
                              {g.equipes.length} equipe{g.equipes.length > 1 ? "s" : ""}
                            </span>
                          </div>
                          <ul className="mt-1.5 flex flex-wrap gap-1.5">
                            {g.equipes.map((e) => (
                              <li key={e.id}
                                className="badge flex items-center gap-1.5"
                                title={`${e.clubNom} · ${e.nom}`}>
                                <ClubBadge clubId={e.clubId} size={14}/>
                                {e.clubNom}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
