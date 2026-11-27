"use client";

// src/features/apres-match/components/ApresMatchPage.tsx
//
// L'apres-match de mon equipe (maquette « Apres ») : note de chaque joueur (staff seulement), note de l'arbitre, blessures vues
// en direct, bilan de l'entraineur. Tout s'enregistre au fil de l'eau ; « Clôturer le match » verrouille le direct.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, Minus, Plus } from "lucide-react";

import { api, ApiError, messageApi } from "@/shared/lib/api";
import { Spinner } from "@/shared/ui/Spinner";
import { ResumeMatchVue } from "@/features/analyse-jeu/components/ResumeMatchVue";

import type { BilanMatch, EtatApresMatch, JoueurApres } from "../lib/apres-types";
import { libelleFaits, noteTexte, noterPlus, tonNote } from "../lib/affichage";
import { ObservationsAdversaire } from "./ObservationsAdversaire";
import { useSauvegardeDifferee } from "./useSauvegardeDifferee";

type Onglet = "notes" | "arbitre" | "blessures" | "adversaire" | "bilan" | "resume";
const ONGLETS: [Onglet, string][] = [["notes", "Notes joueurs"], ["arbitre", "Arbitre"], ["blessures", "Blessures"], ["adversaire", "Adversaire"], ["bilan", "Bilan"], ["resume", "Résumé"]];
const TON: Record<string, string> = { haut: "text-accent", moyen: "text-ink", bas: "text-amber", vide: "text-faint" };

export default function ApresMatchPage({ matchId }: { matchId: string }) {
  const [etat, setEtat] = useState<EtatApresMatch | null>(null);
  const [introuvable, setIntrouvable] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [onglet, setOnglet] = useState<Onglet>("notes");
  const [bilan, setBilan] = useState<BilanMatch | null>(null);
  const [occupe, setOccupe] = useState(false);
  const sauvegarde = useSauvegardeDifferee();
  const router = useRouter();

  const charger = useCallback(async () => {
    try {
      const e = await api.apresMatch(matchId);
      setEtat(e); setBilan((b) => b ?? e.bilan); setErreur(null);
    } catch (e) {
      if (e instanceof ApiError && (e.statut === 403 || e.statut === 404)) setIntrouvable(true);
      else setErreur(messageApi(e, "Impossible de charger l'après-match."));
    }
  }, [matchId]);
  useEffect(() => { void charger(); }, [charger]);

  const echec = async (e: unknown) => { setErreur(messageApi(e, "Enregistrement impossible.")); await charger(); };

  const noter = (j: JoueurApres, change: { note?: number | null; commentaire?: string | null }) => {
    setEtat((s) => s && { ...s, joueurs: s.joueurs.map((x) => (x.id === j.id ? { ...x, ...change } : x)) });
    sauvegarde.programmer(`joueur:${j.id}`, async () => { try { await api.apresMatchNoter(matchId, j.id, change); } catch (e) { await echec(e); } });
  };
  const noterArbitre = (lienId: string, note: number) => {
    setEtat((s) => s && { ...s, arbitres: s.arbitres.map((a) => (a.lienId === lienId ? { ...a, note } : a)) });
    sauvegarde.programmer(`arbitre:${lienId}`, async () => { try { await api.updateArbitreLink(lienId, { note }); await charger(); } catch (e) { await echec(e); } });
  };
  const changerBilan = (p: Partial<BilanMatch>) => {
    const suivant = { ...(bilan ?? { positifs: "", aTravailler: "", bilan: "" }), ...p };
    setBilan(suivant);
    sauvegarde.programmer("bilan", async () => { try { await api.apresMatchBilan(matchId, suivant); await charger(); } catch (e) { await echec(e); } });
  };

  if (introuvable) {
    return (
      <div className="panel mx-auto max-w-lg space-y-3 p-6 text-center">
        <h1 className="font-display text-xl font-bold text-ink">Après-match indisponible</h1>
        <p className="text-sm text-muted">Ce match n&apos;existe pas, ou tu n&apos;as pas accès à son après-match.</p>
        <Link href="/matchs" className="btn btn-primary">Retour aux matchs</Link>
      </div>
    );
  }
  if (!etat) {
    return erreur ? (
      <div className="panel mx-auto max-w-lg space-y-3 p-6 text-center" role="alert">
        <h1 className="font-display text-xl font-bold text-ink">Après-match indisponible</h1>
        <p className="text-sm text-muted">{erreur}</p>
        <div className="flex justify-center gap-2"><button type="button" onClick={() => void charger()} className="btn btn-primary">Réessayer</button><Link href={`/matchs/${matchId}`} className="btn">Retour au match</Link></div>
      </div>
    ) : (
      <div className="flex justify-center p-12" role="status" aria-label="Chargement de l'après-match"><Spinner taille={22} /></div>
    );
  }

  const av = etat.avancement;
  const nbFaits = [av.joueurs > 0 && av.notes === av.joueurs, av.arbitre === true, av.bilan].filter(Boolean).length;
  const total = av.arbitre === null ? 2 : 3;
  const peutCloturer = etat.statutDirect === "termine" && !etat.clotureLe;
  const score = etat.match.scoreDom !== null && etat.match.scoreExt !== null ? `${etat.match.scoreDom} - ${etat.match.scoreExt}` : null;

  /** Enregistre ce qui est en attente, puis ramene a la fiche du match (qui montre alors les dispositifs, le score et l'apres-match a jour). */
  // Pas de router.refresh() juste apres le push : il peut annuler la navigation qui vient de partir (Next 15) ; la page cible se recharge d'elle-meme.
  const retourAuMatch = async () => {
    setOccupe(true);
    try { await sauvegarde.vider(); router.push(`/matchs/${matchId}`); }
    catch (e) { setErreur(messageApi(e, "Enregistrement impossible.")); setOccupe(false); }
  };
  /** Cloture le match (apres avoir tout enregistre), puis ramene a sa fiche. */
  const cloturer = async () => {
    setOccupe(true);
    try { await sauvegarde.vider(); await api.directCloturer(matchId); router.push(`/matchs/${matchId}`); }
    catch (e) { setErreur(messageApi(e, "Clôture impossible.")); setOccupe(false); }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-3 fade-up">
      <div className="flex items-center gap-3">
        <Link href={`/matchs/${matchId}`} className="btn !h-11 !w-11 shrink-0 !p-0" aria-label="Retour au match"><ArrowLeft size={18} aria-hidden /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-lg font-bold text-ink">Après-match</h1>
          <p className="truncate text-xs text-muted">{score ? `Score ${score} · ` : ""}{etat.clotureLe ? "clôturé" : etat.statutDirect === "termine" ? "terminé" : "en cours"}</p>
        </div>
        <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-accent">{nbFaits} sur {total} faits</span>
      </div>

      <nav aria-label="Les trois temps du match" className="flex gap-1 rounded-2xl border border-line bg-surface p-1">
        <Link href={`/matchs/${matchId}/avant`} className="grid h-10 flex-1 place-items-center rounded-xl text-[13px] font-semibold text-muted hover:text-ink">Avant</Link>
        <Link href={`/matchs/${matchId}/direct`} className="grid h-10 flex-1 place-items-center rounded-xl text-[13px] font-semibold text-muted hover:text-ink">Direct</Link>
        <span aria-current="page" className="grid h-10 flex-1 place-items-center rounded-xl bg-accentstrong text-[13px] font-bold sur-accent">Après</span>
      </nav>

      <div role="tablist" aria-label="Étapes de l'après-match" className="flex gap-2 overflow-x-auto pb-1">
        {ONGLETS.map(([id, libelle]) => (
          <button key={id} type="button" role="tab" id={`onglet-${id}`} aria-selected={onglet === id} aria-controls="panneau-apres" onClick={() => setOnglet(id)}
            className={`btn !h-9 shrink-0 !rounded-full !px-3 text-[13px] ${onglet === id ? "!border-accent bg-accent/15 font-bold text-accent" : ""}`}>{libelle}</button>
        ))}
      </div>

      {erreur && (
        <div role="alert" className="panel-inset flex items-start justify-between gap-3 border-l-2 border-danger p-3 text-sm text-ink">
          <span>{erreur}</span><button type="button" onClick={() => setErreur(null)} className="btn !h-8 text-xs">Fermer</button>
        </div>
      )}

      <section role="tabpanel" id="panneau-apres" aria-labelledby={`onglet-${onglet}`} className="space-y-2">
        {onglet === "notes" && <Notes etat={etat} onNoter={noter} />}
        {onglet === "arbitre" && <Arbitres etat={etat} onNoter={noterArbitre} />}
        {onglet === "blessures" && <Blessures etat={etat} />}
        {onglet === "adversaire" && <ObservationsAdversaire matchId={matchId} sauvegarde={sauvegarde} onErreur={setErreur} />}
        {onglet === "bilan" && <Bilan bilan={bilan ?? etat.bilan} onChange={changerBilan} />}
        {onglet === "resume" && <ResumeMatchVue matchId={matchId} />}
      </section>

      <p className="flex items-center gap-2 text-xs text-muted" role="status">
        <span className={`h-2 w-2 rounded-full ${sauvegarde.enAttente || sauvegarde.enCours ? "bg-amber" : "bg-win"}`} aria-hidden />
        {sauvegarde.enAttente || sauvegarde.enCours ? "Enregistrement…" : "Tout est enregistré"}
      </p>

      <div className="flex gap-2 pt-1">
        <button type="button" className="btn !h-12 flex-1" disabled={occupe} onClick={() => void sauvegarde.vider()}>Enregistrer</button>
        {etat.clotureLe ? (
          <button type="button" className="btn !h-12 flex-1" disabled={occupe} onClick={() => void retourAuMatch()}
            title="Enregistre puis retourne à la fiche du match"><Check size={16} aria-hidden /> Match clôturé</button>
        ) : (
          <button type="button" className="btn btn-primary !h-12 flex-1" disabled={!peutCloturer || occupe} onClick={() => void cloturer()}
            title={peutCloturer ? undefined : "Siffle la fin du match dans le direct pour pouvoir le clôturer."}>Clôturer le match</button>
        )}
      </div>
      {!etat.clotureLe && !peutCloturer && <p className="text-xs text-muted">Le match se clôture une fois la fin sifflée dans <Link href={`/matchs/${matchId}/direct`} className="underline">le direct</Link>.</p>}
    </div>
  );
}

function Notes({ etat, onNoter }: { etat: EtatApresMatch; onNoter: (j: JoueurApres, c: { note?: number | null; commentaire?: string | null }) => void }) {
  const [commentaire, setCommentaire] = useState<string | null>(null);
  if (etat.joueurs.length === 0) {
    return <p className="panel-inset p-4 text-sm text-muted">Aucun joueur n&apos;a encore joué : l&apos;effectif de l&apos;équipe se renseigne dans l&apos;onglet Effectif, les titulaires dans la tactique.</p>;
  }
  return (
    <>
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2 className="text-sm font-semibold text-ink">Note de chaque joueur, sur 10</h2>
        <span className="text-xs text-muted">Visible du staff seulement</span>
      </div>
      <ul className="space-y-1.5">
        {etat.joueurs.map((j) => {
          const nom = j.nom;
          return (
            <li key={j.id} className="rounded-xl border border-line bg-surface px-2.5 py-2">
              <div className="flex items-center gap-2.5">
                <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg bg-surface-2 font-display text-sm font-bold text-ink">{j.numero ?? "–"}</span>
                <button type="button" onClick={() => setCommentaire(commentaire === j.id ? null : j.id)} aria-expanded={commentaire === j.id} aria-label={`Commentaire sur ${nom}`} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-semibold text-ink">{[j.prenom, nom].filter(Boolean).join(" ")}</span>
                  <span className="block truncate text-[11px] text-muted">{j.aJoue ? `${j.minutes}'` : "n'a pas joué"} · {libelleFaits(j.faits)}{j.commentaire ? " · 💬" : ""}</span>
                </button>
                <button type="button" aria-label={`Retirer un demi-point à ${nom}`} className="btn !h-9 !w-9 !p-0" onClick={() => onNoter(j, { note: noterPlus(j.note, -0.5) })}><Minus size={16} aria-hidden /></button>
                <span className={`w-11 text-center font-display text-xl font-bold tabular-nums ${TON[tonNote(j.note)]}`} aria-label={`Note de ${nom} : ${j.note === null ? "aucune" : noteTexte(j.note)}`}>{noteTexte(j.note)}</span>
                <button type="button" aria-label={`Ajouter un demi-point à ${nom}`} className="btn !h-9 !w-9 !p-0" onClick={() => onNoter(j, { note: noterPlus(j.note, 0.5) })}><Plus size={16} aria-hidden /></button>
              </div>
              {commentaire === j.id && (
                <label className="mt-2 block text-xs text-muted">Commentaire court
                  <textarea rows={2} maxLength={500} defaultValue={j.commentaire ?? ""} onChange={(e) => onNoter(j, { commentaire: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-line bg-bg p-2 text-sm text-ink" />
                </label>
              )}
            </li>
          );
        })}
      </ul>
      <p className="px-1 text-xs text-muted">Temps de jeu et faits du match (buts, passes, cartons) repris du direct. Touche un joueur pour ajouter un commentaire.</p>
    </>
  );
}

function Arbitres({ etat, onNoter }: { etat: EtatApresMatch; onNoter: (lienId: string, note: number) => void }) {
  if (etat.arbitres.length === 0) {
    return <p className="panel-inset p-4 text-sm text-muted">Aucun arbitre n&apos;est renseigné sur ce match. Ajoute-le depuis la <Link href={`/matchs/${etat.match.id}`} className="underline">fiche du match</Link> (import de la feuille de match ou saisie), puis reviens le noter.</p>;
  }
  return (
    <>
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2 className="text-sm font-semibold text-ink">Note de l&apos;arbitrage, sur 10</h2>
        <span className="text-xs text-muted">Visible du staff seulement</span>
      </div>
      <ul className="space-y-1.5">
        {etat.arbitres.map((a) => (
          <li key={a.lienId} className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-2.5 py-2">
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{a.nom}</span><span className="block text-[11px] text-muted">{a.libelleRole}</span></span>
            <button type="button" aria-label={`Retirer un demi-point à ${a.nom}`} className="btn !h-9 !w-9 !p-0" onClick={() => onNoter(a.lienId, noterPlus(a.note, -0.5))}><Minus size={16} aria-hidden /></button>
            <span className={`w-11 text-center font-display text-xl font-bold tabular-nums ${TON[tonNote(a.note)]}`}>{noteTexte(a.note)}</span>
            <button type="button" aria-label={`Ajouter un demi-point à ${a.nom}`} className="btn !h-9 !w-9 !p-0" onClick={() => onNoter(a.lienId, noterPlus(a.note, 0.5))}><Plus size={16} aria-hidden /></button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Blessures({ etat }: { etat: EtatApresMatch }) {
  return (
    <>
      <h2 className="px-1 text-sm font-semibold text-ink">Blessures signalées pendant le match</h2>
      {etat.blessures.length === 0
        ? <p className="panel-inset p-4 text-sm text-muted">Aucune blessure signalée dans le direct.</p>
        : (
          <ul className="space-y-1.5">
            {etat.blessures.map((b) => (
              <li key={b.id} className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5">
                <span className="w-9 font-display text-sm font-bold text-muted">{b.minute}&apos;</span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{[b.joueurNumero === null ? null : `n°${b.joueurNumero}`, b.joueurNom].filter(Boolean).join(" ") || "Joueur inconnu"}</span>
                {b.joueurId && <Link href={`/medical?joueur=${b.joueurId}`} className="btn !h-9 text-xs">Fiche médicale</Link>}
              </li>
            ))}
          </ul>
        )}
      <p className="px-1 text-xs text-muted">La blessure confirmée (localisation, gravité, retour estimé) se saisit dans le <Link href="/medical" className="underline">module Médical</Link>, réservé au staff.</p>
    </>
  );
}

function Bilan({ bilan, onChange }: { bilan: BilanMatch; onChange: (p: Partial<BilanMatch>) => void }) {
  const champ = (cle: keyof BilanMatch, libelle: string, aide: string, lignes: number) => (
    <label className="block space-y-1">
      <span className="text-sm font-semibold text-ink">{libelle}</span>
      <textarea rows={lignes} maxLength={2000} value={bilan[cle]} onChange={(e) => onChange({ [cle]: e.target.value })} placeholder={aide}
        className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink placeholder:text-faint" />
    </label>
  );
  return (
    <div className="space-y-3">
      {champ("positifs", "Ce qui a marché", "Pressing haut, jeu long vers l'avant-centre…", 3)}
      {champ("aTravailler", "À travailler", "Coups de pied arrêtés défensifs, sorties de balle…", 3)}
      {champ("bilan", "Bilan libre", "Un mot sur le match, l'état d'esprit, la suite…", 4)}
      <p className="text-xs text-muted">Visible du staff seulement.</p>
    </div>
  );
}
