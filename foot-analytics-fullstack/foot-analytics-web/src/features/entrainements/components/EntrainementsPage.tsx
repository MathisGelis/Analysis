// src/features/entrainements/components/EntrainementsPage.tsx
"use client";

// Planning + presences. Effectif filtre sur l'EQUIPE PROPRE selectionnee
// dans la sidebar (pas tout le club). Charge calculee en UA-RPE (methode
// Foster) qui prend en compte duree, intensite, type, ET espace de jeu.

import { useEffect, useMemo, useState } from "react";
import {
  Calendar, ChevronLeft, ChevronRight, Clock, Dumbbell, MapPin, Maximize2,
  Pencil, Plus, Trash2, Users,
} from "lucide-react";

import { api } from "@/shared/lib/api";
import { useOwnEquipe } from "@/features/equipes/lib/own-equipe-context";
import { useOwnClubId } from "@/features/equipes/lib/own-club-context";
import { Sparkline } from "@/shared/ui/Charts";
import { useFeedback } from "@/shared/lib/feedback-context";
import { dateVersIso } from "@/features/calendrier/lib/calendrier";
import {
  SeanceModal, type JoueurLite, type Seance,
} from "./SeanceModal";
import { libelleEspace, moyennePresence, ordonnerRecentsDabord, SEANCES_PAR_PAGE } from "../lib/seances";

export default function Entrainements() {
  const { notifier, confirmer } = useFeedback();
  const ownClubId = useOwnClubId();
  const { equipeId: ownEquipeId } = useOwnEquipe();
  const [seances, setSeances] = useState<Seance[]>([]);
  const [equipe, setEquipe] = useState<any | null>(null);
  const [effectif, setEffectif] = useState<JoueurLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Seance | null>(null);
  const [page, setPage] = useState(1);

  // Charge effectif filtre sur l'equipe propre.
  // - Si equipe propre selectionnee : charge son effectif et ses seances
  // - Sinon : etat vide. On ne fallback PAS sur equipes[0] (qui pourrait
  //   etre une equipe d'une autre saison — mixerait les donnees).
  useEffect(() => {
    (async () => {
      setLoading(true);
      const equipes = await api.equipes(ownClubId);
      let eq: any = null;
      if (ownEquipeId) eq = equipes.find((e: any) => e.id === ownEquipeId) ?? null;
      setEquipe(eq);
      if (eq) {
        const [eff, seancesData] = await Promise.all([
          api.effectifEquipe(eq.id),
          api.entrainements(eq.id),
        ]);
        // Une presence s'enregistre par identifiant de fiche : un joueur sans fiche ne peut pas etre
        // coche (et, sans identifiant, il partagerait sa case avec tous les autres joueurs sans fiche).
        setEffectif(eff.filter((j: any) => !!j.id));
        setSeances(seancesData);
      } else {
        setEffectif([]); setSeances([]);
      }
      setLoading(false);
    })();
  }, [ownClubId, ownEquipeId]);

  async function reload() {
    if (!equipe) return;
    setSeances(await api.entrainements(equipe.id));
  }
  async function onDelete(id: string) {
    if (!(await confirmer({ titre: "Supprimer cette seance ?", message: "Sa charge sort du calcul de fatigue des joueurs.", danger: true }))) return;
    try {
      await api.deleteEntrainement(id);
      await reload();
      notifier.succes("Seance supprimee.");
    } catch (e) {
      notifier.erreur("Suppression impossible : " + (e as Error).message);
    }
  }

  const chargeTotale = seances.reduce((s, x) => s + (x.charge ?? 0), 0);
  const chargeMoyenne = seances.length ? Math.round(chargeTotale / seances.length) : 0;
  const presenceMoyenne = moyennePresence(seances);
  const recentes = useMemo(() => ordonnerRecentsDabord(seances, dateVersIso), [seances]);
  const nbPages = Math.max(1, Math.ceil(recentes.length / SEANCES_PAR_PAGE));
  const pageCourante = Math.min(page, nbPages);
  const visibles = recentes.slice(
    (pageCourante - 1) * SEANCES_PAR_PAGE, pageCourante * SEANCES_PAR_PAGE,
  );

  return (
    <div className="space-y-6 fade-up">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="h-section">
            {equipe ? `${equipe.nom}${equipe.competitionLibelle ? ` · ${equipe.competitionLibelle}` : ""}` : "Aucune equipe"}
          </div>
          <h1 className="font-display text-2xl font-bold text-ink">Entrainements</h1>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setAdding(true)}
          disabled={!equipe || effectif.length === 0}
          title={!equipe ? "Aucune equipe selectionnee" : ""}
        >
          <Plus size={14}/> Nouvel entrainement
        </button>
      </header>

      {!loading && !equipe && (
        <section className="panel p-6 border-l-2 border-amber text-sm text-muted">
          Aucune equipe selectionnee. Choisis ton equipe dans le selecteur
          en bas de la sidebar.
        </section>
      )}

      {equipe && (
        <>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Seances" value={seances.length} icon={<Calendar size={14}/>}/>
            <Kpi label="Effectif" value={effectif.length} icon={<Users size={14}/>}/>
            <Kpi label="Charge totale" value={Math.round(chargeTotale)} suffix="UA-RPE" icon={<Dumbbell size={14}/>}/>
            <Kpi label="Charge moyenne / seance" value={chargeMoyenne} suffix="UA-RPE" icon={<Dumbbell size={14}/>}/>
          </section>

          <section>
            {loading ? (
              <p className="text-muted text-sm">Chargement…</p>
            ) : seances.length === 0 ? (
              <p className="text-muted text-sm py-6 text-center">
                Aucune seance enregistree pour cette equipe.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {visibles.map((s) => (
                  <div key={s.id} className="panel-inset p-4 flex flex-col gap-2 relative group">
                    <div className="flex items-center justify-between">
                      <div className="font-display font-bold text-ink">
                        {s.jour ?? ""} <span className="text-muted font-light">{s.date}</span>
                      </div>
                      <span className={`badge ${
                        s.type === "Physique" ? "badge-danger"
                        : s.type === "Tactique" ? "badge-accent"
                        : s.type === "Pre-match" ? "badge-amber" : ""}`}>{s.type}</span>
                    </div>
                    <div className="text-sm text-ink font-semibold">{s.theme}</div>
                    <div className="text-[11px] text-muted flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1"><Clock size={10}/>{s.heure ?? "—"} · {s.dureeMin}'</span>
                      {s.terrain && <span className="flex items-center gap-1"><MapPin size={10}/>{s.terrain}</span>}
                      {s.espace && <span className="flex items-center gap-1"><Maximize2 size={10}/>{libelleEspace(s.espace)}</span>}
                    </div>
                    <div className="flex items-center gap-4 mt-1">
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-[10px] text-faint uppercase tracking-wider">
                          <span>Charge</span><span>{Math.round(s.charge)} UA-RPE</span>
                        </div>
                        <div className="w-full bg-line h-1.5 rounded-full overflow-hidden mt-1">
                          <div className="h-full bg-amber" style={{ width: `${Math.min(s.charge/10, 100)}%` }}/>
                        </div>
                        {s.total > 0 && (
                          <div className="flex items-center justify-between text-[10px] text-faint uppercase tracking-wider mt-1.5"
                            data-testid="presence-seance">
                            <span>Presence</span><span>{Math.round((s.presents / s.total) * 100)} %</span>
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-faint uppercase tracking-wider">Presents</div>
                        <div className="text-sm font-display font-bold">{s.presents}<span className="text-muted">/{s.total}</span></div>
                      </div>
                    </div>
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button className="btn text-[10px]" onClick={() => setEditing(s)} title="Modifier">
                        <Pencil size={10}/>
                      </button>
                      <button className="btn text-[10px] text-danger" onClick={() => onDelete(s.id)} title="Supprimer">
                        <Trash2 size={10}/>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {nbPages > 1 && (
              <nav className="flex items-center justify-center gap-3 mt-4" aria-label="Pagination des seances">
                <button className="btn text-xs" disabled={pageCourante <= 1}
                  onClick={() => setPage(pageCourante - 1)}>
                  <ChevronLeft size={12}/> Precedent
                </button>
                <span className="text-xs text-muted tabular-nums" data-testid="pagination-seances">
                  Page {pageCourante} / {nbPages}
                </span>
                <button className="btn text-xs" disabled={pageCourante >= nbPages}
                  onClick={() => setPage(pageCourante + 1)}>
                  Suivant <ChevronRight size={12}/>
                </button>
              </nav>
            )}
          </section>

          <section className="panel p-5">
            <div className="h-section mb-3">Charge par seance (UA-RPE)</div>
            <Sparkline values={[...recentes].reverse().map((s) => s.charge)} width={620} height={120} color="rgb(var(--amber))"/>
            <p className="text-[11px] text-faint mt-2">
              Charge calculee via la methode session-RPE (Foster) :
              <span className="text-ink"> duree x intensite x facteur_type x facteur_espace</span>.
              Reference match officiel ~700-900 UA-RPE.
            </p>
          </section>

          {presenceMoyenne !== null && (
            <section className="panel p-5" data-testid="presence-moyenne">
              <div className="flex items-center justify-between mb-3">
                <div className="h-section">Presence par seance (%)</div>
                <span className="badge badge-accent">Moyenne : {presenceMoyenne} %</span>
              </div>
              <Sparkline values={[...recentes].reverse().filter((s) => s.total > 0)
                .map((s) => Math.round((s.presents / s.total) * 100))}
                width={620} height={120} color="rgb(var(--accent))"/>
            </section>
          )}
        </>
      )}

      {adding && equipe && (
        <SeanceModal
          equipeId={equipe.id}
          effectif={effectif}
          onClose={() => setAdding(false)}
          onSaved={async () => { setAdding(false); await reload(); }}
        />
      )}
      {editing && equipe && (
        <SeanceModal
          equipeId={equipe.id}
          effectif={effectif}
          seance={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await reload(); }}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, suffix, icon }:{label:string;value:string|number;suffix?:string;icon?:React.ReactNode;extra?:string}) {
  return (
    <div className="stat-tile">
      <div className="flex items-center justify-between">
        <span className="stat-label">{label}</span>
        <span className="text-faint">{icon}</span>
      </div>
      <div className="stat-value tabular-nums">{value}</div>
      {suffix && <div className="stat-suffix">{suffix}</div>}
    </div>
  );
}
