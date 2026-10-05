"use client";
// src/features/ia/components/IaPage.tsx
//
// Espace admin de l'IA : entrainer le modele de prediction des compos sur toutes les feuilles de match, suivre
// l'entrainement, lire ce que l'IA a appris et ou elle se trompe, et choisir quel modele alimente l'application.
// Reserve a l'administrateur (le serveur le verifie).

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Brain, CalendarClock, CircleCheck, Play, Power, Square, Trash2 } from "lucide-react";

import { getCachedUser } from "@/features/auth/lib/auth";
import { api, messageApi } from "@/shared/lib/api";
import { useFeedback } from "@/shared/lib/feedback-context";
import { AdminOnglets } from "@/shared/ui/AdminOnglets";
import {
  badgeDecision, dateHeure, datePassage, dernierReussi, LIBELLE_STATUT, pct, resumeDernierAuto, texteFrequence, type TonDecision,
} from "@/features/ia/lib/ia-format";
import type { EntrainementDetail, EntrainementResume, EtatIa, StatutEntrainement } from "@/features/ia/lib/ia-types";

import { LancerEntrainementModale } from "./LancerEntrainementModale";
import { ResultatIa } from "./ResultatIa";

const BADGE: Record<StatutEntrainement, string> = { en_cours: "badge-sky", termine: "", echec: "badge-danger", annule: "badge-amber" };
const BADGE_DECISION: Record<TonDecision, string> = { ok: "badge-accent", non: "badge-amber", neutre: "" };

export default function IaPage() {
  const { notifier, confirmer } = useFeedback();
  const router = useRouter();
  const [etat, setEtat] = useState<EtatIa | null>(null);
  const [liste, setListe] = useState<EntrainementResume[]>([]);
  const [detail, setDetail] = useState<EntrainementDetail | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [modale, setModale] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const enCoursId = etat?.enCours?.id ?? null;
  const dernierStatutVu = useRef<string | null>(null);

  // Le role est verifie ici pour la commodite (redirection) ; le vrai garde est cote serveur.
  useEffect(() => {
    const u = getCachedUser();
    if (u && u.role !== "admin") router.replace("/");
  }, [router]);

  const voir = useCallback(async (id: string) => {
    try { setDetail(await api.iaEntrainement(id)); }
    catch (e) { notifier.erreur(`Resultat illisible : ${messageApi(e)}`); }
  }, [notifier]);

  const recharger = useCallback(async (afficherDernier = true) => {
    try {
      const [e, l] = await Promise.all([api.iaEtat(), api.iaEntrainements()]);
      setEtat(e); setListe(l); setErreur(null);
      if (afficherDernier) {
        const cible = dernierReussi(l);
        if (cible) await voir(cible.id);
        else setDetail(null);
      }
    } catch (e) {
      setErreur(messageApi(e, "L'IA est indisponible."));
    } finally {
      setChargement(false);
    }
  }, [voir]);

  useEffect(() => { void recharger(); }, [recharger]);

  // Suivi de l'entrainement en cours : on l'interroge chaque seconde, jusqu'a sa fin.
  useEffect(() => {
    if (!enCoursId) return;
    const minuteur = setInterval(async () => {
      try {
        const r = await api.iaResume(enCoursId);
        if (r.statut === "en_cours") {
          setEtat((e) => (e && e.enCours ? { ...e, enCours: r } : e));
          return;
        }
        clearInterval(minuteur);
        if (dernierStatutVu.current !== `${r.id}:${r.statut}`) {
          dernierStatutVu.current = `${r.id}:${r.statut}`;
          if (r.statut === "termine") notifier.succes("Entrainement termine.");
          else if (r.statut === "echec") notifier.erreur(r.message ?? "L'entrainement a echoue.");
          else notifier.info("Entrainement annule.");
        }
        await recharger(r.statut === "termine");
      } catch (e) {
        clearInterval(minuteur);
        setErreur(messageApi(e, "Le suivi de l'entrainement a echoue."));
      }
    }, 1000);
    return () => clearInterval(minuteur);
  }, [enCoursId, notifier, recharger]);

  async function lancer(options: { optimiser: boolean; saisonIds: string[] }) {
    setOccupe(true);
    try {
      await api.iaLancer(options);
      setModale(false);
      await recharger(false);
    } catch (e) {
      notifier.erreur(`Lancement impossible : ${messageApi(e)}`);
    } finally {
      setOccupe(false);
    }
  }

  async function annuler() {
    if (!enCoursId) return;
    try { await api.iaAnnuler(enCoursId); await recharger(false); }
    catch (e) { notifier.erreur(`Annulation impossible : ${messageApi(e)}`); }
  }

  async function activer(id: string, nom: string) {
    const ok = await confirmer({
      titre: `Activer ${nom} ?`,
      message: "La compo probable des rapports et du scouting sera predite par ce modele. Vous pouvez revenir au moteur a regles a tout moment.",
      libelleConfirmer: "Activer",
    });
    if (!ok) return;
    try { await api.iaActiver(id); notifier.succes(`${nom} est actif.`); await recharger(false); if (detail) await voir(detail.id); }
    catch (e) { notifier.erreur(`Activation impossible : ${messageApi(e)}`); }
  }

  async function desactiver() {
    const ok = await confirmer({ titre: "Revenir au moteur a regles ?", message: "Le modele actif sera retire : les rapports reprennent le moteur a regles.", libelleConfirmer: "Desactiver" });
    if (!ok) return;
    try { await api.iaDesactiver(); notifier.succes("Moteur a regles retabli."); await recharger(false); if (detail) await voir(detail.id); }
    catch (e) { notifier.erreur(`Desactivation impossible : ${messageApi(e)}`); }
  }

  async function basculerPlanning(actif: boolean) {
    try {
      const planning = await api.iaDefinirPlanning(actif);
      setEtat((e) => (e ? { ...e, planning } : e));
      notifier.succes(actif ? "Reentrainement automatique active." : "Reentrainement automatique suspendu.");
    } catch (e) { notifier.erreur(`Changement impossible : ${messageApi(e)}`); }
  }

  async function supprimer(id: string, nom: string) {
    const ok = await confirmer({ titre: `Supprimer ${nom} ?`, message: "Le resultat de son entrainement reste consultable.", libelleConfirmer: "Supprimer", danger: true });
    if (!ok) return;
    try { await api.iaSupprimerModele(id); notifier.succes(`${nom} supprime.`); await recharger(false); if (detail) await voir(detail.id); }
    catch (e) { notifier.erreur(`Suppression impossible : ${messageApi(e)}`); }
  }

  const enCours = etat?.enCours ?? null;
  const modeleDuDetail = detail?.modele ?? null;

  return (
    <div className="space-y-6 fade-up">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="h-section flex items-center gap-2"><Brain size={11} className="text-accent" aria-hidden /> Administration</div>
          <h1 className="font-display text-2xl font-bold text-ink">Intelligence artificielle</h1>
          <p className="mt-1 max-w-2xl text-xs text-muted">
            L'IA apprend a predire les compos : elle rejoue toutes les feuilles de match dans l'ordre des dates, predit chaque semaine avant
            de la decouvrir, note ses erreurs, puis se corrige. Ce qu'elle apprend peut ensuite alimenter la compo probable des rapports.
          </p>
        </div>
        <button type="button" className="btn btn-accent" onClick={() => setModale(true)} disabled={!!enCours || !etat}>
          <Play size={14} aria-hidden /> Lancer un entrainement
        </button>
      </header>

      <AdminOnglets />

      {erreur && <p role="alert" className="panel border-danger/40 p-4 text-sm text-danger">{erreur}</p>}

      {chargement ? (
        <div className="panel p-6" aria-busy="true"><div className="skeleton h-5 w-1/3 rounded" /><div className="skeleton mt-3 h-4 w-2/3 rounded" /></div>
      ) : etat && (
        <>
          <section className="grid gap-4 lg:grid-cols-2" aria-label="Etat de l'IA">
            <div className="panel p-5" data-testid="modele-actif">
              <div className="h-section">Modele actif</div>
              {etat.actif ? (
                <>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="font-display text-xl font-bold text-ink">{etat.actif.nom}</span>
                    <span className="badge badge-accent text-[10px]">Actif</span>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {pct(etat.actif.resume.onze)} des titulaires predits ({etat.actif.resume.predictions} compositions),
                    entraine le {dateHeure(etat.actif.creeLe)}.
                  </p>
                  <button type="button" className="btn mt-3 text-sm" onClick={desactiver}><Power size={14} aria-hidden /> Revenir au moteur a regles</button>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  Aucun modele actif : les rapports utilisent le moteur a regles. Entrainez un modele, comparez-le aux methodes simples, puis activez-le s'il fait mieux.
                </p>
              )}
            </div>
            <div className="panel p-5" data-testid="donnees-disponibles">
              <div className="h-section">Donnees disponibles</div>
              <div className="mt-2 font-display text-xl font-bold text-ink">{etat.donnees.matchsJoues} matchs joues</div>
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted">
                {etat.donnees.saisons.filter((s) => s.matchs > 0).map((s) => <li key={s.id}>{s.nom} : {s.matchs}</li>)}
              </ul>
              <p className="mt-2 text-xs text-faint">Chaque match donne deux feuilles d'equipe. Plus il y a de saisons importees, mieux l'IA apprend.</p>
            </div>
          </section>

          <section className="panel p-5" aria-label="Reentrainement automatique" data-testid="planning-ia">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="h-section flex items-center gap-2"><CalendarClock size={11} className="text-accent" aria-hidden /> Reentrainement automatique</div>
                <p className="mt-2 text-sm text-ink">
                  {etat.planning.actif
                    ? <>Actif : l'IA se reentraine {texteFrequence(etat.planning)}. Prochain passage : <strong>{datePassage(etat.planning.prochain)}</strong>.</>
                    : "Suspendu : l'IA ne se reentraine que quand vous lancez un entrainement."}
                </p>
                <p className="mt-1 max-w-3xl text-xs text-muted">
                  Le nouveau modele ne remplace le modele actif que s'il fait au moins aussi bien, sur les semaines que l'actif n'avait pas encore vues.
                  Sinon il reste dans l'historique des modeles, et l'actif continue. Sans modele actif, il n'est jamais active tout seul.
                </p>
                {resumeDernierAuto(etat.planning.dernier) && (
                  <p className="mt-2 text-xs text-muted" data-testid="planning-dernier"><span className="text-faint">Dernier passage : </span>{resumeDernierAuto(etat.planning.dernier)}</p>
                )}
                {!etat.planning.operationnel && (
                  <p role="status" className="mt-2 text-xs text-amber" data-testid="planning-inactif">
                    Le planificateur ne tourne pas sur ce serveur (il demarre en production, ou avec IA_PLANIFICATEUR=on) : aucun entrainement automatique n'aura lieu ici.
                  </p>
                )}
              </div>
              <button type="button" className="btn text-sm" onClick={() => basculerPlanning(!etat.planning.actif)} aria-pressed={etat.planning.actif}>
                <Power size={14} aria-hidden /> {etat.planning.actif ? "Suspendre" : "Reactiver"}
              </button>
            </div>
          </section>

          {enCours && (
            <section className="panel p-5" aria-label="Entrainement en cours" data-testid="entrainement-en-cours">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="h-section">Entrainement en cours</div>
                  <p className="mt-1 text-sm text-ink" aria-live="polite">{enCours.message ?? "Demarrage"}</p>
                </div>
                <button type="button" className="btn text-sm" onClick={annuler}><Square size={13} aria-hidden /> Annuler</button>
              </div>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-panel3/70" role="progressbar" aria-label="Progression de l'entrainement"
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={enCours.progression}>
                <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-smooth" style={{ width: `${enCours.progression}%` }} />
              </div>
              <p className="mt-1 text-right font-mono text-xs text-muted">{enCours.progression} %</p>
            </section>
          )}

          {!enCours && etat.dernier && etat.dernier.statut !== "termine" && (
            <p role="status" className={`panel p-4 text-sm ${etat.dernier.statut === "echec" ? "border-danger/40 text-danger" : "text-muted"}`} data-testid="dernier-echec">
              Dernier entrainement ({LIBELLE_STATUT[etat.dernier.statut].toLowerCase()}, {dateHeure(etat.dernier.creeLe)}) : {etat.dernier.message}
            </p>
          )}

          {liste.length === 0 && !enCours && (
            <section className="panel p-8 text-center" data-testid="ia-vide">
              <Brain size={28} className="mx-auto text-accent" aria-hidden />
              <h2 className="mt-3 font-display text-lg font-bold text-ink">L'IA n'a encore rien appris</h2>
              <p className="mx-auto mt-1 max-w-lg text-sm text-muted">
                Lancez un premier entrainement : elle rejouera toutes les feuilles de match de la base, semaine apres semaine, et vous montrera sa progression.
              </p>
            </section>
          )}

          {detail?.resultat && (
            <>
              <section className="panel flex flex-wrap items-center justify-between gap-3 p-4" aria-label="Entrainement affiche" data-testid="entrainement-affiche">
                <div className="min-w-0">
                  <div className="h-section">Entrainement du {dateHeure(detail.creeLe)}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="font-display text-lg font-bold text-ink">{modeleDuDetail?.nom ?? "Modele supprime"}</span>
                    {modeleDuDetail?.actif && <span className="badge badge-accent text-[10px]">Actif</span>}
                  </div>
                </div>
                {modeleDuDetail && (
                  <div className="flex flex-wrap gap-2">
                    {modeleDuDetail.actif
                      ? <button type="button" className="btn text-sm" onClick={desactiver}><Power size={14} aria-hidden /> Desactiver</button>
                      : <button type="button" className="btn btn-primary text-sm" onClick={() => activer(modeleDuDetail.id, modeleDuDetail.nom)}><CircleCheck size={14} aria-hidden /> Activer ce modele</button>}
                    {!modeleDuDetail.actif && (
                      <button type="button" className="btn btn-ghost text-sm text-danger" onClick={() => supprimer(modeleDuDetail.id, modeleDuDetail.nom)} aria-label={`Supprimer ${modeleDuDetail.nom}`}>
                        <Trash2 size={14} aria-hidden />
                      </button>
                    )}
                  </div>
                )}
              </section>
              <ResultatIa detail={detail} />
            </>
          )}

          {liste.length > 0 && (
            <section className="panel p-5" aria-label="Historique des entrainements" data-testid="historique-ia">
              <h2 className="font-display text-lg font-bold text-ink">Historique</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="table-fm">
                  <thead><tr><th>Date</th><th>Statut</th><th>Modele</th><th>Face a l'actif</th><th className="text-right">Titulaires predits</th><th className="text-right">Meilleur repere</th><th><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>
                    {liste.map((e) => (
                      <tr key={e.id} className={detail?.id === e.id ? "is-mine" : ""}>
                        <td className="whitespace-nowrap text-sm">{dateHeure(e.creeLe)}{e.declencheur === "auto" && <span className="badge ml-2 text-[10px]" title="Reentrainement automatique">Auto</span>}</td>
                        <td><span className={`badge text-[10px] ${BADGE[e.statut]}`}>{LIBELLE_STATUT[e.statut]}</span></td>
                        <td className="text-sm">{e.modele ? <>{e.modele.nom}{e.modele.actif && <span className="badge badge-accent ml-2 text-[10px]">Actif</span>}</> : <span className="text-faint">—</span>}</td>
                        <td className="text-sm">
                          {(() => {
                            const b = badgeDecision(e.decision);
                            return b ? <span className={`badge text-[10px] ${BADGE_DECISION[b.ton]}`} title={e.decision?.raison}>{b.texte}</span> : <span className="text-faint">—</span>;
                          })()}
                        </td>
                        <td className="text-right font-mono text-sm">{e.modele ? pct(e.modele.resume.onze) : "—"}</td>
                        <td className="text-right font-mono text-sm text-muted">{e.modele ? pct(e.modele.resume.referenceOnze) : "—"}</td>
                        <td className="text-right">
                          {e.statut === "termine" && (
                            <button type="button" className="btn text-xs" onClick={() => voir(e.id)} disabled={detail?.id === e.id}>Voir</button>
                          )}
                          {e.statut !== "termine" && e.message && <span className="text-xs text-faint" title={e.message}>{e.statut === "en_cours" ? "" : "Voir le message"}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {etat && (
        <LancerEntrainementModale ouvert={modale} onClose={() => setModale(false)} donnees={etat.donnees} occupe={occupe} onLancer={lancer} />
      )}
    </div>
  );
}
