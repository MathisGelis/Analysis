"use client";

// src/features/apres-match/components/ObservationsAdversaire.tsx
//
// L'onglet « Adversaire » de l'apres-match : ce que le staff a observe de l'adversaire pendant le match, section par section (dispositif,
// meilleurs joueurs, joueurs faibles, points forts et faibles, sorties de balle, gardien, transitions, structures, pressing, couloirs,
// coups de pied arretes), avec de petits selecteurs. Tout s'enregistre au fil de l'eau, par section ; le tout resservira au rapport pre-match
// contre cet adversaire. Le catalogue des sections et des choix vient du serveur.

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";

import { api, messageApi } from "@/shared/lib/api";
import { Spinner } from "@/shared/ui/Spinner";

import {
  ajouterJoueur, basculer, choisir, ecrire, ecrireJoueurs, erreursJoueurs, lireJoueurs, MAX_JOUEURS, MAX_TEXTE, nbRemplies, noter,
  pourEnvoi, sectionRemplie, type ChampObservation, type EtatObservations, type JoueurObserve, type Observations, type SectionObservation, type ValeursSection,
} from "../lib/observations";
import { useSauvegardeDifferee } from "./useSauvegardeDifferee";

export function ObservationsAdversaire({ matchId, sauvegarde, onErreur }: {
  matchId: string;
  sauvegarde: ReturnType<typeof useSauvegardeDifferee>;
  onErreur: (message: string) => void;
}) {
  const [etat, setEtat] = useState<EtatObservations | null>(null);
  const [valeurs, setValeurs] = useState<Observations>({});
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try { const e = await api.apresMatchAdversaire(matchId); setEtat(e); setValeurs(e.valeurs); setErreur(null); }
    catch (e) { setErreur(messageApi(e, "Impossible de charger les observations.")); }
  }, [matchId]);
  useEffect(() => { void charger(); }, [charger]);

  if (erreur) return <p role="alert" className="panel-inset border-l-2 border-danger p-3 text-sm text-ink">{erreur}</p>;
  if (!etat) return <div className="flex justify-center p-8" role="status" aria-label="Chargement des observations"><Spinner taille={20} /></div>;

  /** Un appui : l'ecran change tout de suite, la section part au serveur apres un court calme. */
  const changer = (section: SectionObservation, suivant: ValeursSection) => {
    setValeurs((o) => { const n = { ...o }; if (sectionRemplie(suivant)) n[section.id] = suivant; else delete n[section.id]; return n; });
    const partant = pourEnvoi(suivant);
    sauvegarde.programmer(`adversaire:${section.id}`, async () => {
      try { await api.apresMatchObserver(matchId, section.id, partant); } catch (e) { onErreur(messageApi(e, "Enregistrement impossible.")); await charger(); }
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        Ce que tu as vu de l&apos;adversaire : des choix rapides par sujet. Ça resservira dans le rapport pré-match quand vous le jouerez à nouveau.
        {" "}<span className="font-semibold text-ink" aria-live="polite">{nbRemplies(valeurs)} sur {etat.catalogue.length} sujets renseignés.</span>
      </p>
      <ul className="space-y-2">
        {etat.catalogue.map((s) => {
          const v = valeurs[s.id] ?? {};
          const ouvert = ouverte === s.id;
          return (
            <li key={s.id} className="panel-inset">
              <button type="button" aria-expanded={ouvert} aria-controls={`obs-${s.id}`} onClick={() => setOuverte(ouvert ? null : s.id)}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{s.titre}</span>
                  {s.aide && <span className="block text-xs text-muted">{s.aide}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${sectionRemplie(v) ? "bg-accentstrong" : "bg-line-strong"}`} role="img" aria-label={sectionRemplie(v) ? "Renseigné" : "Pas encore renseigné"} />
                  <ChevronDown size={16} aria-hidden className={`text-muted transition-transform ${ouvert ? "rotate-180" : ""}`} />
                </span>
              </button>
              {ouvert && (
                <div id={`obs-${s.id}`} className="space-y-3 border-t border-line px-3 pb-3 pt-2">
                  {s.champs.map((c) => <Champ key={c.id} champ={c} section={s} valeurs={v} onChange={(n) => changer(s, n)} />)}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Champ({ champ, section, valeurs, onChange }: {
  champ: ChampObservation; section: SectionObservation; valeurs: ValeursSection; onChange: (v: ValeursSection) => void;
}) {
  const nom = `${section.titre} : ${champ.libelle}`;
  if (champ.type === "choix" || champ.type === "multi") {
    const actuel = valeurs[champ.id];
    const choisie = (o: string) => (champ.type === "multi" ? Array.isArray(actuel) && (actuel as string[]).includes(o) : actuel === o);
    return (
      <div role="group" aria-label={nom} className="space-y-1.5">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">{champ.libelle}</div>
        <div className="flex flex-wrap gap-1.5">
          {champ.options!.map((o) => (
            <button key={o} type="button" aria-pressed={choisie(o)}
              onClick={() => onChange(champ.type === "multi" ? basculer(valeurs, champ.id, o, champ.options!) : choisir(valeurs, champ.id, o))}
              className={`min-h-9 rounded-full border px-3 text-[13px] transition-colors ${choisie(o) ? "border-accent bg-accent/15 font-bold text-ink" : "border-line bg-surface text-ink hover:bg-line/40"}`}>{o}</button>
          ))}
        </div>
      </div>
    );
  }
  if (champ.type === "note") {
    return (
      <div role="group" aria-label={nom} className="space-y-1.5">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">{champ.libelle}</div>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-pressed={valeurs[champ.id] === n} aria-label={`${n} sur 5`} onClick={() => onChange(noter(valeurs, champ.id, n))}
              className={`h-9 w-9 rounded-full border text-sm font-bold tabular-nums transition-colors ${valeurs[champ.id] === n ? "border-accent bg-accent/15 font-bold text-ink" : "border-line bg-surface text-ink hover:bg-line/40"}`}>{n}</button>
          ))}
          <span className="self-center pl-1 text-xs text-muted">1 faible · 5 très bon</span>
        </div>
      </div>
    );
  }
  if (champ.type === "texte") {
    return (
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">{champ.libelle}</span>
        <input className="inp" maxLength={MAX_TEXTE} value={typeof valeurs[champ.id] === "string" ? (valeurs[champ.id] as string) : ""} placeholder="Une phrase si besoin"
          onChange={(e) => onChange(ecrire(valeurs, champ.id, e.target.value))} />
      </label>
    );
  }
  return <ChampJoueurs champ={champ} nom={nom} valeurs={valeurs} onChange={onChange} />;
}

/** Jusqu'a trois joueurs, par numero de maillot (on ne connait que lui) avec un commentaire court. Parti au serveur quand les numeros sont valides. */
function ChampJoueurs({ champ, nom, valeurs, onChange }: {
  champ: ChampObservation; nom: string; valeurs: ValeursSection; onChange: (v: ValeursSection) => void;
}) {
  const joueurs = lireJoueurs(valeurs, champ.id);
  const [brouillon, setBrouillon] = useState<JoueurObserve[]>(joueurs);
  useEffect(() => { setBrouillon(lireJoueurs(valeurs, champ.id)); }, [valeurs, champ.id]);
  const erreur = erreursJoueurs(brouillon);
  const maj = (liste: JoueurObserve[]) => { setBrouillon(liste); onChange(ecrireJoueurs(valeurs, champ.id, liste)); };
  return (
    <div role="group" aria-label={nom} className="space-y-1.5">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{champ.libelle}</div>
      {brouillon.map((j, i) => (
        <div key={i} className="flex items-center gap-2">
          <input className="inp !w-16 text-center tabular-nums" inputMode="numeric" aria-label={`Numéro du joueur ${i + 1}`} placeholder="N°" value={j.numero > 0 ? j.numero : ""}
            onChange={(e) => maj(brouillon.map((x, k) => (k === i ? { ...x, numero: Number(e.target.value.replace(/\D/g, "").slice(0, 2)) || 0 } : x)))} />
          <input className="inp flex-1" maxLength={MAX_TEXTE} aria-label={`Commentaire sur le joueur ${i + 1}`} placeholder="Pourquoi (gaucher, rapide, perd ses duels…)" value={j.commentaire ?? ""}
            onChange={(e) => maj(brouillon.map((x, k) => (k === i ? { ...x, commentaire: e.target.value } : x)))} />
          <button type="button" aria-label={`Retirer le joueur ${i + 1}`} onClick={() => maj(brouillon.filter((_, k) => k !== i))} className="btn !h-11 !w-11 shrink-0 !p-0"><X size={16} aria-hidden /></button>
        </div>
      ))}
      {erreur && brouillon.length > 0 && <p role="alert" className="text-xs text-amber">{erreur}</p>}
      {brouillon.length < MAX_JOUEURS && (
        <button type="button" onClick={() => setBrouillon(ajouterJoueur(brouillon))} className="btn !h-10 text-[13px]"><Plus size={14} aria-hidden /> Ajouter un joueur</button>
      )}
    </div>
  );
}
