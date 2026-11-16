"use client";

// src/features/avant-match/components/AvantMatchPage.tsx
//
// L'avant-match de mon equipe (maquette « Avant ») : le dispositif et le onze de depart sur le terrain, le groupe et le banc, l'arbitre
// designe. Le plan est celui de l'onglet Tactique (meme enregistrement, meme regle des mutes) : modifie ici, il l'est la-bas.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";

import { api, ApiError, messageApi } from "@/shared/lib/api";
import { Modal } from "@/shared/ui/Modal";
import { Spinner } from "@/shared/ui/Spinner";
import type { EtatDirect, JoueurDirect } from "@/features/direct/lib/direct-types";
import { usePaletteDirect } from "@/features/direct/lib/palette";
import { FORMATION_DEFAUT, formationsProposees, MAX_REMPLACANTS, NB_TITULAIRES } from "@/features/tactique/lib/composition";

import { affecter, basculerBanc, nbTitulaires, onzeComplet, postesDeFormation } from "../lib/terrain-avant";

interface Plan { formation: string; titulaires: string[]; remplacants: string[] }
const nomCourt = (j: JoueurDirect) => [j.prenom, j.nom].filter(Boolean).join(" ");

function quand(date: string | null, heure: string | null): string {
  if (!date) return "date à confirmer";
  const d = new Date(`${date}T12:00:00`);
  const jour = Number.isNaN(d.getTime()) ? date : d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  return heure ? `${jour} · ${heure.replace(":", " h ").replace(/ h 00$/, " h").trim()}` : jour;
}

export default function AvantMatchPage({ matchId }: { matchId: string }) {
  usePaletteDirect();
  const [etat, setEtat] = useState<EtatDirect | null>(null);
  const [introuvable, setIntrouvable] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [violations, setViolations] = useState<string[] | null>(null);
  const [plan, setPlan] = useState<Plan>({ formation: FORMATION_DEFAUT, titulaires: onzeComplet([]), remplacants: [] });
  const [enregistre, setEnregistre] = useState<string>("");
  const [planDuMatch, setPlanDuMatch] = useState(false);
  const [blesses, setBlesses] = useState<Set<string>>(new Set());
  const [arbitre, setArbitre] = useState<string | null>(null);
  const [poste, setPoste] = useState<number | null>(null);
  const [choixDispositif, setChoixDispositif] = useState(false);
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    try {
      const e = await api.direct(matchId);
      const equipeId = e.nousCote === "dom" ? e.match.equipeDomId : e.match.equipeExtId;
      const [duMatch, courant, bless, arbitres] = await Promise.all([
        equipeId ? api.tactique(equipeId, matchId) : null, equipeId ? api.tactique(equipeId) : null, api.blessures(), api.arbitresForMatch(matchId),
      ]);
      const source = duMatch ?? courant;
      const p: Plan = source
        ? { formation: source.formation, titulaires: onzeComplet(source.titulaires), remplacants: source.remplacants ?? [] }
        : { formation: FORMATION_DEFAUT, titulaires: onzeComplet([]), remplacants: [] };
      setEtat(e); setPlan(p); setEnregistre(JSON.stringify(p)); setPlanDuMatch(!!duMatch);
      setBlesses(new Set((bless as any[]).filter((b) => b.statut && b.statut !== "Retabli").map((b) => b.joueurId)));
      const principal = (arbitres as any[]).find((a) => a.role === "principal") ?? (arbitres as any[])[0];
      setArbitre(principal ? [principal.arbitre?.prenom ?? principal.prenom, principal.arbitre?.nom ?? principal.nom].filter(Boolean).join(" ") || null : null);
      setErreur(null);
    } catch (e) {
      if (e instanceof ApiError && (e.statut === 403 || e.statut === 404)) setIntrouvable(true);
      else setErreur(messageApi(e, "Impossible de charger l'avant-match."));
    }
  }, [matchId]);
  useEffect(() => { void charger(); }, [charger]);

  const joueurs = etat?.joueurs ?? [];
  const parId = useMemo(() => new Map(joueurs.map((j) => [j.id, j])), [joueurs]);
  const postes = useMemo(() => postesDeFormation(plan.formation), [plan.formation]);
  const modifie = JSON.stringify(plan) !== enregistre;

  if (introuvable) {
    return (
      <div className="panel mx-auto max-w-lg space-y-3 p-6 text-center">
        <h1 className="font-display text-xl font-bold text-ink">Avant-match indisponible</h1>
        <p className="text-sm text-muted">Ce match n&apos;existe pas, ou tu n&apos;as pas accès à sa préparation.</p>
        <Link href="/matchs" className="btn btn-primary">Retour aux matchs</Link>
      </div>
    );
  }
  if (!etat) {
    return erreur ? (
      <div className="panel mx-auto max-w-lg space-y-3 p-6 text-center" role="alert">
        <h1 className="font-display text-xl font-bold text-ink">Avant-match indisponible</h1>
        <p className="text-sm text-muted">{erreur}</p>
        <div className="flex justify-center gap-2"><button type="button" onClick={() => void charger()} className="btn btn-primary">Réessayer</button><Link href={`/matchs/${matchId}`} className="btn">Retour au match</Link></div>
      </div>
    ) : (
      <div className="flex justify-center p-12" role="status" aria-label="Chargement de l'avant-match"><Spinner taille={22} /></div>
    );
  }

  const equipeId = etat.nousCote === "dom" ? etat.match.equipeDomId : etat.match.equipeExtId;
  const groupe = joueurs.filter((j) => !plan.titulaires.includes(j.id));
  const complet = nbTitulaires(plan.titulaires) === NB_TITULAIRES;
  const statut = planDuMatch && !modifie ? (complet ? "Prête" : "Incomplète") : "Brouillon";

  const maj = (p: Partial<Plan>) => setPlan((s) => ({ ...s, ...p }));
  const choisir = (joueurId: string) => {
    if (poste === null) return;
    maj(affecter(plan.titulaires, plan.remplacants, poste, joueurId));
    setPoste(null);
  };

  const enregistrer = async () => {
    if (!equipeId) return;
    setOccupe(true); setViolations(null); setErreur(null);
    try {
      const saved = await api.enregistrerTactique({ equipeId, matchId, formation: plan.formation, titulaires: plan.titulaires, remplacants: plan.remplacants });
      const p: Plan = { formation: saved.formation, titulaires: onzeComplet(saved.titulaires), remplacants: saved.remplacants ?? [] };
      setPlan(p); setEnregistre(JSON.stringify(p)); setPlanDuMatch(true);
    } catch (e) {
      const corps = e instanceof ApiError ? e.corps : null;
      if (corps?.code === "REGLE_MUTATIONS") setViolations(corps.violations ?? [corps.message]);
      else setErreur(messageApi(e, "Enregistrement impossible. Réessaie dans un instant."));
    } finally { setOccupe(false); }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-3 fade-up">
      <div className="flex items-center gap-3">
        <Link href={`/matchs/${matchId}`} className="btn !h-11 !w-11 shrink-0 !p-0" aria-label="Retour au match"><ArrowLeft size={18} aria-hidden /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-lg font-bold text-ink">Avant-match</h1>
          <p className="text-xs text-muted">{etat.match.nomDom} - {etat.match.nomExt} · {quand(etat.match.date, etat.match.heure)}</p>
        </div>
        <span className={`rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-semibold ${statut === "Prête" ? "text-accent" : "text-amber"}`}>{statut}</span>
      </div>

      <nav aria-label="Les trois temps du match" className="flex gap-1 rounded-2xl border border-line bg-surface p-1">
        <span aria-current="page" className="grid h-10 flex-1 place-items-center rounded-xl bg-accentstrong text-[13px] font-bold sur-accent">Avant</span>
        <Link href={`/matchs/${matchId}/direct`} className="grid h-10 flex-1 place-items-center rounded-xl text-[13px] font-semibold text-muted hover:text-ink">Direct</Link>
        <Link href={`/matchs/${matchId}/apres`} className="grid h-10 flex-1 place-items-center rounded-xl text-[13px] font-semibold text-muted hover:text-ink">Après</Link>
      </nav>

      {!equipeId ? (
        <p className="panel-inset p-4 text-sm text-muted">Ce match n&apos;est pas rattaché à une de tes équipes : choisis l&apos;équipe sur la fiche du match pour composer ton onze.</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 pt-1">
            <h2 className="text-sm font-semibold text-ink">Composition de départ</h2>
            <button type="button" onClick={() => setChoixDispositif(true)} aria-label={`Dispositif : ${plan.formation}. Changer`} className="btn !h-9 font-display font-bold">{plan.formation}</button>
          </div>

          <div className="relative h-[340px] overflow-hidden rounded-2xl border-2" style={{ borderColor: "rgb(var(--terrain-ligne))", backgroundColor: "rgb(var(--terrain))" }}>
            <div className="absolute inset-x-0 top-1/2 h-0.5" style={{ backgroundColor: "rgb(var(--terrain-trace) / 0.35)" }} aria-hidden />
            <div className="absolute left-1/2 top-1/2 h-[70px] w-[70px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2" style={{ borderColor: "rgb(var(--terrain-trace) / 0.35)" }} aria-hidden />
            {postes.map((p) => {
              const j = parId.get(plan.titulaires[p.index]);
              return (
                <button key={p.index} type="button" onClick={() => setPoste(p.index)} style={{ left: `${p.x}%`, top: `${p.y}%` }}
                  aria-label={`${p.libelle} : ${j ? nomCourt(j) : "vide"}`}
                  className="absolute flex w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5">
                  <span className={`grid h-11 w-11 place-items-center rounded-full border-2 font-display text-sm font-bold ${j ? "border-accent bg-bg text-ink" : "border-dashed border-line-strong bg-bg/60 text-muted"}`}>{j ? (j.numero ?? "–") : "+"}</span>
                  <span className="max-w-full truncate rounded bg-bg/70 px-1 text-[10px] font-semibold text-ink">{j ? j.nom : p.libelle}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-baseline justify-between gap-x-3 pt-1">
            <h2 className="h-section">Groupe : {joueurs.length} joueur{joueurs.length > 1 ? "s" : ""}</h2>
            <span className="text-xs text-muted">Banc {plan.remplacants.length}/{MAX_REMPLACANTS} · touche pour changer</span>
          </div>
          {joueurs.length === 0 ? (
            <p className="panel-inset p-4 text-sm text-muted">Aucun joueur dans l&apos;effectif de cette équipe. Ajoute-les depuis l&apos;onglet Effectif.</p>
          ) : (
            <ul className="flex flex-wrap gap-2" aria-label="Groupe">
              {groupe.map((j) => {
                const banc = plan.remplacants.includes(j.id);
                const blesse = blesses.has(j.id);
                return (
                  <li key={j.id}>
                    <button type="button" aria-pressed={banc} onClick={() => maj({ remplacants: basculerBanc(plan.titulaires, plan.remplacants, j.id) })}
                      className={`inline-flex h-[34px] items-center rounded-full border px-3 text-[13px] ${blesse ? "border-danger text-danger" : banc ? "border-accent bg-accent/15 text-accent" : "border-line bg-surface text-ink"}`}>
                      {[j.numero, j.nom].filter((x) => x !== null && x !== "").join(" ")}{blesse ? " · blessé" : banc ? " · banc" : ""}
                    </button>
                  </li>
                );
              })}
              {groupe.length === 0 && <li className="text-sm text-muted">Tout le groupe est sur le terrain.</li>}
            </ul>
          )}

          {violations && (
            <div role="alert" className="panel-inset border-l-2 border-danger p-3 text-sm text-ink">Le serveur a refusé cette composition : {violations.join(" ")}</div>
          )}
          {erreur && (
            <div role="alert" className="panel-inset flex items-start justify-between gap-3 border-l-2 border-danger p-3 text-sm text-ink">
              <span>{erreur}</span><button type="button" onClick={() => setErreur(null)} className="btn !h-8 text-xs">Fermer</button>
            </div>
          )}

          <p className="panel-inset p-3 text-[13px] leading-snug text-muted">
            {arbitre ? `Arbitre désigné : ${arbitre}. ` : "Aucun arbitre désigné pour l'instant. "}
            La composition est la même que dans l&apos;onglet <Link href="/tactique" className="underline">Tactique</Link> : la règle des joueurs mutés est vérifiée à l&apos;enregistrement.
          </p>

          <div className="flex gap-2 pt-1">
            <button type="button" className={`btn !h-12 flex-1 ${modifie ? "btn-primary" : ""}`} disabled={occupe || !modifie} onClick={() => void enregistrer()}>
              {!modifie && planDuMatch ? <><Check size={16} aria-hidden /> Enregistrée</> : "Enregistrer"}
            </button>
            <Link href={`/matchs/${matchId}/direct`} className={`btn !h-12 flex-1 ${modifie ? "" : "btn-primary"}`}>Coup d&apos;envoi</Link>
          </div>
        </>
      )}

      {poste !== null && (
        <Modal open onClose={() => setPoste(null)} maxWidth="max-w-md" titre={`Choisir le joueur : ${postes[poste]?.libelle}`}>
          <div className="space-y-3">
            <h2 className="font-display text-lg font-bold text-ink">{postes[poste]?.libelle}</h2>
            <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto">
              {joueurs.filter((j) => j.id === plan.titulaires[poste] || !plan.titulaires.includes(j.id)).map((j) => (
                <li key={j.id}>
                  <button type="button" onClick={() => choisir(j.id)} aria-pressed={plan.titulaires[poste] === j.id}
                    className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left ${plan.titulaires[poste] === j.id ? "border-accent bg-accent/10" : "border-line bg-surface"}`}>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 font-display text-sm font-bold text-ink">{j.numero ?? "–"}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{nomCourt(j)}</span>
                    <span className="text-xs text-muted">{j.poste ?? ""}{blesses.has(j.id) ? " · blessé" : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex justify-between gap-2">
              <button type="button" className="btn" onClick={() => choisir("")} disabled={!plan.titulaires[poste]}>Libérer le poste</button>
              <button type="button" className="btn" onClick={() => setPoste(null)}>Fermer</button>
            </div>
          </div>
        </Modal>
      )}

      {choixDispositif && (
        <Modal open onClose={() => setChoixDispositif(false)} maxWidth="max-w-sm" titre="Choisir le dispositif">
          <div className="space-y-3">
            <h2 className="font-display text-lg font-bold text-ink">Dispositif</h2>
            <div className="flex flex-wrap gap-2">
              {formationsProposees(plan.formation).map((f) => (
                <button key={f} type="button" aria-pressed={plan.formation === f} onClick={() => { maj({ formation: f }); setChoixDispositif(false); }}
                  className={`btn !h-11 font-display font-bold ${plan.formation === f ? "!border-accent bg-accent/15 text-accent" : ""}`}>{f}</button>
              ))}
            </div>
            <div className="flex justify-end"><button type="button" className="btn" onClick={() => setChoixDispositif(false)}>Fermer</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
