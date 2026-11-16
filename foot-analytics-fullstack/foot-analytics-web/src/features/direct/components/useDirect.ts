"use client";

// src/features/direct/components/useDirect.ts
//
// L'etat vivant d'un direct : lecture, chrono (calcule sur l'ecran a l'heure du serveur), evenements saisis et annules, file d'envoi
// rejouee tant que le reseau manque. Les evenements s'affichent et comptent au score avant la confirmation du serveur.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, ApiError, messageApi } from "@/shared/lib/api";
import { compteurs, score } from "../lib/calculs";
import { formaterChrono, minuteDe } from "../lib/chrono";
import type { ActionChrono, EtatDirect, EvenementDirect } from "../lib/direct-types";
import { evenementsAffiches, Operation, sansLaPremiere } from "../lib/file-envoi";
import { nouvelId } from "../lib/identifiant";
import { Saisie, versEvenement } from "../lib/saisie";

const DELAI_REESSAI_MS = 4_000;

export function useDirect(matchId: string) {
  const [etat, setEtat] = useState<EtatDirect | null>(null);
  const [introuvable, setIntrouvable] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [file, setFile] = useState<Operation[]>([]);
  const [horsLigne, setHorsLigne] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [annule, setAnnule] = useState<EvenementDirect | null>(null);
  const [, battre] = useState(0);
  const decalage = useRef(0);
  const envoiEnCours = useRef(false);

  const appliquer = useCallback((e: EtatDirect) => {
    decalage.current = e.chrono.serveurMs - Date.now();
    setEtat(e);
  }, []);

  const charger = useCallback(async () => {
    try { appliquer(await api.direct(matchId)); setErreur(null); }
    catch (e) {
      if (e instanceof ApiError && e.statut === 404) setIntrouvable(true);
      else setErreur(e instanceof ApiError ? messageApi(e) : "Impossible de joindre le serveur.");
    }
  }, [appliquer, matchId]);

  useEffect(() => { void charger(); }, [charger]);

  // Le chrono avance chaque seconde, sans appel reseau.
  useEffect(() => {
    const t = setInterval(() => battre((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const maintenant = () => Date.now() + decalage.current;

  // La file : une operation a la fois, dans l'ordre ; reseau coupe ou serveur en panne = on attend et on recommence.
  useEffect(() => {
    if (file.length === 0 || envoiEnCours.current) return;
    envoiEnCours.current = true;
    const op = file[0];
    let relancer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        if (op.genre === "ajout") {
          const confirme = await api.directEnregistrer(matchId, op.evenement);
          setEtat((s) => s && { ...s, evenements: [...s.evenements.filter((e) => e.id !== confirme.id), { ...confirme }] });
        } else {
          await api.directSupprimer(matchId, op.id);
          setEtat((s) => s && { ...s, evenements: s.evenements.filter((e) => e.id !== op.id) });
        }
        setHorsLigne(false);
        setFile((f) => sansLaPremiere(f));
      } catch (e) {
        if (e instanceof ApiError && e.statut >= 400 && e.statut < 500 && e.statut !== 408 && e.statut !== 429) {
          // Le serveur refuse pour de bon (match cloture, droits) : rejouer n'y changerait rien.
          setErreur(messageApi(e));
          setFile((f) => sansLaPremiere(f));
          void charger();
        } else {
          setHorsLigne(true);
          relancer = setTimeout(() => { envoiEnCours.current = false; battre((n) => n + 1); }, DELAI_REESSAI_MS);
          return;
        }
      }
      envoiEnCours.current = false;
      battre((n) => n + 1);
    })();
    return () => { if (relancer) clearTimeout(relancer); };
  }, [file, matchId, charger]);

  const evenements = useMemo(() => (etat ? evenementsAffiches(etat.evenements, file) : []), [etat, file]);
  const scoreAffiche = useMemo(() => score(evenements), [evenements]);
  const compteursAffiches = useMemo(() => compteurs(evenements), [evenements]);

  const minute = etat ? minuteDe(etat.chrono, maintenant()) : 0;
  const chronoAffiche = etat ? formaterChrono(etat.chrono, maintenant()) : "00:00";

  const chrono = useCallback(async (action: ActionChrono, minuteCible?: number) => {
    setOccupe(true);
    try { appliquer(await api.directChrono(matchId, action, minuteCible)); setErreur(null); setHorsLigne(false); }
    catch (e) {
      if (e instanceof ApiError) setErreur(messageApi(e));
      else { setErreur("Pas de réseau : l'action sur le chrono n'a pas été prise en compte."); setHorsLigne(true); }
    } finally { setOccupe(false); }
  }, [appliquer, matchId]);

  /** Enregistre une saisie (nouvelle, ou corrigee si `id` est donne). */
  const enregistrer = useCallback((saisie: Saisie, id: string = nouvelId()) => {
    setFile((f) => [...f, { genre: "ajout", evenement: versEvenement(saisie, id) }]);
    return id;
  }, []);

  const supprimer = useCallback((id: string) => {
    const ev = evenements.find((e) => e.id === id);
    if (ev) setAnnule(ev);
    setFile((f) => [...f, { genre: "suppression", id }]);
  }, [evenements]);

  /** Annule le dernier evenement saisi (celui qui est arrive en dernier, pas le plus tardif en minute). */
  const annulerDernier = useCallback(() => {
    const dernier = [...evenements].sort((a, b) => (a.creeLe ?? "9").localeCompare(b.creeLe ?? "9"))[evenements.length - 1];
    if (dernier) supprimer(dernier.id);
  }, [evenements, supprimer]);

  /** Remet l'evenement qu'on vient d'annuler : meme identifiant, le serveur le restaure. */
  const retablir = useCallback(() => {
    if (!annule) return;
    const { minuteAffichee: _m, creeLe: _c, ...e } = annule;
    void _m; void _c;
    setFile((f) => [...f, { genre: "ajout", evenement: e }]);
    setAnnule(null);
  }, [annule]);

  const cloturer = useCallback(async () => {
    setOccupe(true);
    try { appliquer(await api.directCloturer(matchId)); setErreur(null); }
    catch (e) { setErreur(e instanceof ApiError ? messageApi(e) : "Pas de réseau."); }
    finally { setOccupe(false); }
  }, [appliquer, matchId]);

  const rouvrir = useCallback(async () => {
    setOccupe(true);
    try { appliquer(await api.directRouvrir(matchId)); setErreur(null); }
    catch (e) { setErreur(e instanceof ApiError ? messageApi(e) : "Pas de réseau."); }
    finally { setOccupe(false); }
  }, [appliquer, matchId]);

  return {
    etat, introuvable, erreur, effacerErreur: () => setErreur(null), evenements, score: scoreAffiche, compteurs: compteursAffiches,
    minute, chronoAffiche, maintenant, chrono, enregistrer, supprimer, annulerDernier, retablir, peutRetablir: !!annule,
    cloturer, rouvrir, occupe, enAttente: file.length, horsLigne, recharger: charger,
  };
}
