"use client";

// src/features/direct/components/DirectPage.tsx
//
// L'ecran du direct d'un match : tableau de marque et chrono, grille d'actions, derniers evenements, frise. Un seul ecran qui
// s'adapte : une colonne sur telephone (la frise s'ouvre a part), deux colonnes (saisie | frise) sur grand ecran.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ListOrdered, Redo2, Undo2 } from "lucide-react";

import { Modal } from "@/shared/ui/Modal";
import { Spinner } from "@/shared/ui/Spinner";

import { etatCompo, joueursSurLeTerrain, type EtatCompo } from "../lib/compo-direct";
import { joueurLibelle, libelleEvenement } from "../lib/actions";
import { libelleMinute } from "../lib/chrono";
import type { Cote, EvenementDirect } from "../lib/direct-types";
import { libelleFormation } from "@/shared/lib/formation";
import { Saisie, saisieDepuisEvenement, saisieInitiale } from "../lib/saisie";
import { FeuilleSaisie } from "./FeuilleSaisie";
import { BilanMiTemps } from "./BilanMiTemps";
import { FeuilleSysteme } from "./FeuilleSysteme";
import { TerrainDeLEtat } from "./TerrainCompo";
import { sourceStaff, type SourceDirect } from "../lib/source-direct";
import { InviterSaisisseur } from "./InviterSaisisseur";
import { FriseDirect } from "./FriseDirect";
import { GrilleActions } from "./GrilleActions";
import { Tableau } from "./Tableau";
import { useDirect } from "./useDirect";

interface Ouverte { saisie: Saisie; id: string | null }

export default function DirectPage({ matchId, source: sourceFournie }: { matchId: string; source?: SourceDirect }) {
  // Staff par defaut ; un saisisseur invite fournit la source de sa session (pas de cloture, pas de liens vers le reste de l'application).
  const source = useMemo(() => sourceFournie ?? sourceStaff(matchId), [sourceFournie, matchId]);
  const invite = !!sourceFournie;
  const d = useDirect(matchId, source);
  const [coteSaisie, setCoteSaisie] = useState<Cote | null>(null);
  const [ouverte, setOuverte] = useState<Ouverte | null>(null);
  const [frise, setFrise] = useState(false);
  const [vueSaisie, setVueSaisie] = useState<"actions" | "compo">("actions");
  const [systeme, setSysteme] = useState<Ouverte | null>(null);

  // Le parcours : le direct ne s'ouvre pas tant que l'avant-match de ce match n'est pas fait (onze et numeros enregistres), sauf s'il
  // est deja commence. Un saisisseur invite n'est jamais renvoye : c'est le staff qui a prepare le match.
  const router = useRouter();
  const aForcer = !invite && !!d.etat?.avantMatch?.possible && !d.etat.avantMatch.pret && d.etat.chrono.statut === "avant" && d.evenements.length === 0;
  useEffect(() => { if (aForcer) router.replace(`/matchs/${matchId}/avant?depuis=direct`); }, [aForcer, router, matchId]);
  if (aForcer) return <div className="flex justify-center p-12" role="status" aria-label="Préparation du match"><Spinner taille={22} /></div>;

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
        <div className="flex justify-center gap-2"><button type="button" onClick={() => void d.recharger()} className="btn btn-primary">Réessayer</button>{!invite && <Link href={`/matchs/${matchId}`} className="btn">Retour au match</Link>}</div>
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

  // La compo visuelle : le onze du coup d'envoi, rejoue avec les remplacements, rouges et changements de systeme de notre equipe.
  const compoDe = (evs: EvenementDirect[]): EtatCompo | null => (etat.compo ? etatCompo({ compo: etat.compo, joueurs: etat.joueurs, evenements: evs, nousCote: nous }) : null);
  const compoMaintenant = compoDe(d.evenements);
  /** La compo telle qu'elle etait au moment d'une saisie (corriger un ancien evenement ne propose pas ceux qui n'etaient pas encore la). */
  const compoAvant = (periode: number, minute: number, idExclu: string | null) =>
    compoDe(d.evenements.filter((e) => e.id !== idExclu && (e.periode < periode || (e.periode === periode && e.minute <= minute))));
  const ouvrirSysteme = () => setSysteme({ saisie: saisieInitiale("systeme", nous, etat.chrono.periode, d.minute), id: null });

  const ouvrir = (actionId: string) => setOuverte({ saisie: saisieInitiale(actionId, cote, etat.chrono.periode, d.minute), id: null });
  const corriger = (e: EvenementDirect) => { setFrise(false); if (e.type === "systeme") setSysteme({ saisie: saisieDepuisEvenement(e), id: e.id }); else setOuverte({ saisie: saisieDepuisEvenement(e), id: e.id }); };

  const colonneSaisie = (
    <div className="space-y-3">
      <Tableau nomNous={nomNous} nomEux={nomEux} scoreNous={d.score[nous]} scoreEux={d.score[eux]} chrono={etat.chrono}
        affichage={d.chronoAffiche} minute={d.minute} occupe={d.occupe} cloture={cloture} onAction={(a, m) => void d.chrono(a, m)}
        chronoPermis={!invite || !!etat.invitation?.peutChrono} />

      {invite ? (
        (etat.chrono.statut === "termine" || cloture) && <p className="panel-inset border-l-2 border-accent p-3 text-sm text-ink" role="status">{cloture ? "Direct clôturé par le staff : la saisie est verrouillée." : "Match terminé. Le staff clôturera le direct."}</p>
      ) : (
        <>
      {etat.chrono.statut === "termine" && !cloture && (
        <div className="panel-inset flex flex-wrap items-center justify-between gap-2 border-l-2 border-accent p-3" role="status">
          <span className="text-sm text-ink">Match terminé. Tu peux encore corriger la frise, puis clôturer.</span>
          <div className="flex gap-2">
            <Link href={`/matchs/${matchId}/apres`} className="btn">Après-match</Link>
            <button type="button" disabled={d.occupe} onClick={() => void d.cloturer()} className="btn btn-primary">Clôturer le match</button>
          </div>
        </div>
      )}
      {cloture && (
        <div className="panel-inset flex flex-wrap items-center justify-between gap-2 border-l-2 border-amber p-3" role="status">
          <span className="text-sm text-ink">Direct clôturé : la saisie est verrouillée.</span>
          <div className="flex gap-2">
            <Link href={`/matchs/${matchId}/apres`} className="btn btn-primary">Après-match</Link>
            <button type="button" disabled={d.occupe} onClick={() => void d.rouvrir()} className="btn">Rouvrir</button>
          </div>
        </div>
      )}
        </>
      )}

      {!invite && etat.chrono.statut === "mi_temps" && d.evenements.length > 0 && <BilanMiTemps key={d.evenements.length} matchId={matchId} nomNous={nomNous} nomEux={nomEux} />}

      {compoMaintenant && (
        <div role="tablist" aria-label="Vue du direct" className="flex gap-1 rounded-2xl border border-line bg-surface p-1">
          {([["actions", "Actions"], ["compo", "Compo"]] as const).map(([id, libelle]) => (
            <button key={id} type="button" role="tab" aria-selected={vueSaisie === id} onClick={() => setVueSaisie(id)}
              className={`h-11 flex-1 rounded-xl text-sm font-bold transition-colors ${vueSaisie === id ? "bg-accentstrong sur-accent" : "text-muted hover:text-ink"}`}>{libelle}</button>
          ))}
        </div>
      )}

      {compoMaintenant && vueSaisie === "compo" ? (
        <VueCompo etat={compoMaintenant} evenements={d.evenements.filter((e) => e.cote === nous && ["remplacement", "carton_rouge", "systeme"].includes(e.type))}
          dureePeriodeMin={dureePeriode} desactive={ferme} onRemplacant={() => ouvrir("remplacement")} onSysteme={ouvrirSysteme} />
      ) : (
        <>
      <div className="flex gap-1 rounded-2xl border border-line bg-surface p-1" role="group" aria-label="Équipe concernée">
        {([[nous, "Notre équipe"], [eux, "Adversaire"]] as [Cote, string][]).map(([c, libelle]) => (
          <button key={c} type="button" aria-pressed={cote === c} onClick={() => setCoteSaisie(c)}
            className={`h-11 flex-1 rounded-xl text-sm font-bold transition-colors ${cote === c ? (c === nous ? "bg-accentstrong sur-accent" : "bg-sky/20 text-ink ring-1 ring-sky") : "text-muted hover:text-ink"}`}>{libelle}</button>
        ))}
      </div>

      <GrilleActions onChoisir={ouvrir} desactive={ferme} />

        </>
      )}

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
        {invite ? (
          <p className="text-sm text-muted">Saisie invitée : <strong className="text-ink">{etat.invitation?.libelle}</strong></p>
        ) : (
          <>
            <Link href={`/matchs/${matchId}`} className="btn !h-11" aria-label="Retour au match"><ArrowLeft size={16} aria-hidden /> <span className="max-sm:sr-only">Retour au match</span></Link>
            <InviterSaisisseur matchId={matchId} disabled={cloture} />
          </>
        )}
      </div>

      {!invite && etat.avantMatch?.possible && !etat.avantMatch.pret && (
        <p role="status" className="panel-inset border-l-2 border-amber p-3 text-sm text-ink">
          L&apos;avant-match de ce match n&apos;est pas fait : tout l&apos;effectif est proposé. <Link href={`/matchs/${matchId}/avant`} className="underline">Compose ton onze et les numéros</Link> pour ne voir que les joueurs retenus.
        </p>
      )}

      {!invite && etat.avantMatch?.possible && etat.avantMatch.pret && etat.chrono.statut === "avant" && (
        <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>Onze et numéros prêts ({etat.avantMatch.titulaires} titulaires, {etat.avantMatch.banc} remplaçants).</span>
          <Link href={`/matchs/${matchId}/avant`} className="underline" data-testid="modifier-avant-match">Modifier l&apos;avant-match</Link>
        </p>
      )}

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
          compo={compoAvant(ouverte.saisie.periode, ouverte.saisie.minute, ouverte.id)}
          dureePeriodeMin={dureePeriode} correction={ouverte.id !== null}
          onFermer={() => setOuverte(null)}
          onEnregistrer={() => { d.enregistrer(ouverte.saisie, ouverte.id ?? undefined); setOuverte(null); }}
          onSupprimer={ouverte.id ? () => { d.supprimer(ouverte.id as string); setOuverte(null); } : undefined} />
      )}
      {systeme && (() => {
        const compo = compoAvant(systeme.saisie.periode, systeme.saisie.minute, systeme.id);
        return compo ? (
          <FeuilleSysteme compo={compo} periode={systeme.saisie.periode} minute={systeme.saisie.minute} dureePeriodeMin={dureePeriode}
            formationInitiale={systeme.id ? systeme.saisie.resultat : null} correction={systeme.id !== null}
            onFermer={() => setSysteme(null)}
            onValider={(formation, ordre) => { d.enregistrer({ ...systeme.saisie, resultat: formation, contextes: ordre }, systeme.id ?? undefined); setSysteme(null); setVueSaisie("compo"); }}
            onSupprimer={systeme.id ? () => { d.supprimer(systeme.id as string); setSysteme(null); } : undefined} />
        ) : null;
      })()}
    </div>
  );
}

/** L'onglet Compo : les joueurs sur le terrain, les mouvements du match, le banc, et les deux touches propres a l'effectif (remplacant, systeme). */
function VueCompo({ etat, evenements, dureePeriodeMin, desactive, onRemplacant, onSysteme }: {
  etat: EtatCompo; evenements: EvenementDirect[]; dureePeriodeMin: number; desactive: boolean; onRemplacant: () => void; onSysteme: () => void;
}) {
  const sur = joueursSurLeTerrain(etat);
  const mouvements = [...evenements].sort((a, b) => a.periode - b.periode || a.minute - b.minute);
  const nbChangements = evenements.filter((e) => e.type === "remplacement").length;
  return (
    <section aria-label="Compo de l'équipe" className="space-y-3" data-testid="vue-compo">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="h-section">Sur le terrain · {sur} sur 11</h2>
        <span className="text-xs text-muted">{libelleFormation(etat.formation)} · {nbChangements} changement{nbChangements > 1 ? "s" : ""}</span>
      </div>
      <TerrainDeLEtat etat={etat} />
      <p className="flex items-center gap-2 text-xs text-muted"><span aria-hidden className="h-3.5 w-3.5 rounded-full border-2 border-white bg-surface-2" /> L&apos;entrant prend le poste du sortant ; un joueur expulsé reste grisé à son poste.</p>
      <div className="panel-inset space-y-2 p-3">
        <h3 className="h-section">Mouvements</h3>
        {mouvements.length === 0 && <p className="text-sm text-muted">Aucun changement pour l&apos;instant.</p>}
        {mouvements.map((e) => (
          <div key={e.id} className="flex items-baseline gap-2.5 text-sm">
            <span className={`w-9 shrink-0 font-display text-[13px] font-bold tabular-nums ${e.type === "carton_rouge" ? "text-danger" : e.type === "systeme" ? "text-sky" : "text-amber"}`}>{libelleMinute(e.minute, e.periode, dureePeriodeMin)}&apos;</span>
            <span className="text-ink">
              {e.type === "remplacement" ? <><b>{joueurLibelle(e.joueur2Numero, e.joueur2Nom)}</b> remplace {joueurLibelle(e.joueurNumero, e.joueurNom)}</>
                : e.type === "carton_rouge" ? <>Carton rouge · <b>{joueurLibelle(e.joueurNumero, e.joueurNom)}</b></> : libelleEvenement(e)}
            </span>
          </div>
        ))}
        <p className="text-xs text-muted">Banc restant : {etat.banc.length === 0 ? "plus personne" : `${etat.banc.length} joueur${etat.banc.length > 1 ? "s" : ""} (${etat.banc.map((j) => `n°${j.numero ?? "–"}`).join(", ")})`}</p>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={desactive} onClick={onRemplacant} className="btn btn-primary !h-13 flex-1 text-sm font-bold disabled:opacity-50">Remplaçant</button>
        <button type="button" disabled={desactive} onClick={onSysteme} className="btn !h-13 flex-1 text-sm font-bold disabled:opacity-50">Changer de système</button>
      </div>
    </section>
  );
}
