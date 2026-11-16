"use client";

// src/features/direct/components/DirectPage.tsx
//
// L'ecran du direct d'un match : tableau de marque et chrono, grille d'actions, derniers evenements, frise. Un seul ecran qui
// s'adapte : une colonne sur telephone (la frise s'ouvre a part), deux colonnes (saisie | frise) sur grand ecran.

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ListOrdered, Redo2, Undo2 } from "lucide-react";

import { Modal } from "@/shared/ui/Modal";
import { Spinner } from "@/shared/ui/Spinner";

import type { Cote, EvenementDirect } from "../lib/direct-types";
import { Saisie, saisieDepuisEvenement, saisieInitiale } from "../lib/saisie";
import { FeuilleSaisie } from "./FeuilleSaisie";
import { FriseDirect } from "./FriseDirect";
import { GrilleActions } from "./GrilleActions";
import { Tableau } from "./Tableau";
import { useDirect } from "./useDirect";

interface Ouverte { saisie: Saisie; id: string | null }

export default function DirectPage({ matchId }: { matchId: string }) {
  const d = useDirect(matchId);
  const [coteSaisie, setCoteSaisie] = useState<Cote | null>(null);
  const [ouverte, setOuverte] = useState<Ouverte | null>(null);
  const [frise, setFrise] = useState(false);

  if (d.introuvable) {
    return (
      <div className="panel mx-auto max-w-lg space-y-3 p-6 text-center">
        <h1 className="font-display text-xl font-bold text-ink">Match introuvable</h1>
        <p className="text-sm text-muted">Ce match n&apos;existe pas, ou tu n&apos;as pas accès à son direct.</p>
        <Link href="/matchs" className="btn btn-primary">Retour aux matchs</Link>
      </div>
    );
  }
  if (!d.etat) {
    return d.erreur ? (
      <div className="panel mx-auto max-w-lg space-y-3 p-6 text-center" role="alert">
        <h1 className="font-display text-xl font-bold text-ink">Direct indisponible</h1>
        <p className="text-sm text-muted">{d.erreur}</p>
        <div className="flex justify-center gap-2"><button type="button" onClick={() => void d.recharger()} className="btn btn-primary">Réessayer</button><Link href={`/matchs/${matchId}`} className="btn">Retour au match</Link></div>
      </div>
    ) : (
      <div className="flex justify-center p-12" role="status" aria-label="Chargement du direct"><Spinner taille={22} /></div>
    );
  }

  const { etat } = d;
  const nous = etat.nousCote;
  const eux: Cote = nous === "dom" ? "ext" : "dom";
  const cote = coteSaisie ?? nous;
  const cloture = !!etat.chrono.clotureLe;
  const ferme = cloture;
  const nomNous = nous === "dom" ? etat.match.nomDom : etat.match.nomExt;
  const nomEux = nous === "dom" ? etat.match.nomExt : etat.match.nomDom;
  const dureePeriode = etat.chrono.dureePeriodeMin;

  const ouvrir = (actionId: string) => setOuverte({ saisie: saisieInitiale(actionId, cote, etat.chrono.periode, d.minute), id: null });
  const corriger = (e: EvenementDirect) => { setFrise(false); setOuverte({ saisie: saisieDepuisEvenement(e), id: e.id }); };

  const colonneSaisie = (
    <div className="space-y-3">
      <Tableau nomNous={nomNous} nomEux={nomEux} scoreNous={d.score[nous]} scoreEux={d.score[eux]} chrono={etat.chrono}
        affichage={d.chronoAffiche} minute={d.minute} occupe={d.occupe} cloture={cloture} onAction={(a, m) => void d.chrono(a, m)} />

      {etat.chrono.statut === "termine" && !cloture && (
        <div className="panel-inset flex flex-wrap items-center justify-between gap-2 border-l-2 border-accent p-3" role="status">
          <span className="text-sm text-ink">Match terminé. Tu peux encore corriger la frise, puis clôturer.</span>
          <button type="button" disabled={d.occupe} onClick={() => void d.cloturer()} className="btn btn-primary">Clôturer le match</button>
        </div>
      )}
      {cloture && (
        <div className="panel-inset flex flex-wrap items-center justify-between gap-2 border-l-2 border-amber p-3" role="status">
          <span className="text-sm text-ink">Direct clôturé : la saisie est verrouillée.</span>
          <button type="button" disabled={d.occupe} onClick={() => void d.rouvrir()} className="btn">Rouvrir</button>
        </div>
      )}

      <div className="flex gap-1 rounded-2xl border border-line bg-surface p-1" role="group" aria-label="Équipe concernée">
        {([[nous, "Notre équipe"], [eux, "Adversaire"]] as [Cote, string][]).map(([c, libelle]) => (
          <button key={c} type="button" aria-pressed={cote === c} onClick={() => setCoteSaisie(c)}
            className={`h-11 flex-1 rounded-xl text-sm font-bold transition-colors ${cote === c ? (c === nous ? "bg-accentstrong text-white" : "bg-sky/20 text-ink ring-1 ring-sky") : "text-muted hover:text-ink"}`}>{libelle}</button>
        ))}
      </div>

      <GrilleActions onChoisir={ouvrir} desactive={ferme} />

      <section aria-label="Derniers événements" className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="h-section">Derniers événements</h2>
          <div className="flex gap-1.5">
            {d.peutRetablir && <button type="button" onClick={d.retablir} disabled={ferme} className="btn !h-9 text-[13px]"><Redo2 size={14} aria-hidden /> Rétablir</button>}
            <button type="button" onClick={d.annulerDernier} disabled={ferme || d.evenements.length === 0} className="btn !h-9 text-[13px] disabled:opacity-50"><Undo2 size={14} aria-hidden /> Annuler</button>
            <button type="button" onClick={() => setFrise(true)} className="btn !h-9 whitespace-nowrap text-[13px] lg:hidden"><ListOrdered size={14} aria-hidden /> Frise ({d.evenements.length})</button>
          </div>
        </div>
        <div className="lg:hidden"><FriseDirect evenements={d.evenements} nousCote={nous} dureePeriodeMin={dureePeriode} onChoisir={corriger} limite={3} desactive={ferme} /></div>
        <p className="flex items-center gap-2 text-xs text-muted" role="status">
          <span className={`h-2 w-2 rounded-full ${d.horsLigne ? "bg-danger" : d.enAttente ? "bg-amber" : "bg-win"}`} aria-hidden />
          {d.horsLigne
            ? `Pas de réseau : ${d.enAttente} événement${d.enAttente > 1 ? "s" : ""} en attente, renvoi automatique.`
            : d.enAttente ? "Envoi en cours…" : `${d.evenements.length} événement${d.evenements.length > 1 ? "s" : ""} · tout est envoyé`}
        </p>
      </section>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-3 fade-up">
      <h1 className="sr-only">Direct : {etat.match.nomDom} contre {etat.match.nomExt}</h1>
      <div className="flex items-center justify-between gap-2">
        <Link href={`/matchs/${matchId}`} className="btn !h-11" aria-label="Retour au match"><ArrowLeft size={16} aria-hidden /> <span className="max-sm:sr-only">Retour au match</span></Link>
      </div>

      {d.erreur && (
        <div role="alert" className="panel-inset flex items-start justify-between gap-3 border-l-2 border-danger p-3 text-sm text-ink">
          <span>{d.erreur}</span>
          <button type="button" onClick={d.effacerErreur} className="btn !h-8 text-xs">Fermer</button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        {colonneSaisie}
        <aside className="hidden lg:block" aria-label="Frise du match">
          <div className="panel p-4">
            <h2 className="mb-3 font-display text-base font-bold text-ink">Frise du match <span className="text-muted">({d.evenements.length})</span></h2>
            <FriseDirect evenements={d.evenements} nousCote={nous} dureePeriodeMin={dureePeriode} onChoisir={corriger} desactive={ferme} />
          </div>
        </aside>
      </div>

      {frise && (
        <Modal open onClose={() => setFrise(false)} maxWidth="max-w-md" titre="Frise du match">
          <div className="space-y-3">
            <h2 className="font-display text-lg font-bold text-ink">Frise du match <span className="text-muted">({d.evenements.length})</span></h2>
            <FriseDirect evenements={d.evenements} nousCote={nous} dureePeriodeMin={dureePeriode} onChoisir={corriger} desactive={ferme} />
            <div className="flex justify-end"><button type="button" className="btn" onClick={() => setFrise(false)}>Fermer</button></div>
          </div>
        </Modal>
      )}

      {ouverte && (
        <FeuilleSaisie
          saisie={ouverte.saisie} onChange={(saisie) => setOuverte({ ...ouverte, saisie })} joueurs={etat.joueurs} nousCote={nous}
          dureePeriodeMin={dureePeriode} correction={ouverte.id !== null}
          onFermer={() => setOuverte(null)}
          onEnregistrer={() => { d.enregistrer(ouverte.saisie, ouverte.id ?? undefined); setOuverte(null); }}
          onSupprimer={ouverte.id ? () => { d.supprimer(ouverte.id as string); setOuverte(null); } : undefined} />
      )}
    </div>
  );
}
