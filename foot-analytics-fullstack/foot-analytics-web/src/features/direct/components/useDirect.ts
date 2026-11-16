"use client";

// src/features/direct/components/useDirect.ts
//
// L'etat vivant d'un direct : lecture, chrono (calcule sur l'ecran a l'heure du serveur), evenements saisis et annules, file d'envoi
// rejouee tant que le reseau manque. Les evenements s'affichent et comptent au score avant la confirmation du serveur.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiError, messageApi } from "@/shared/lib/api";
import { compteurs, score } from "../lib/calculs";
import { formaterChrono, minuteDe } from "../lib/chrono";
import type { ActionChrono, EtatDirect, EvenementDirect } from "../lib/direct-types";
import { evenementsAffiches, Operation, sansLaPremiere } from "../lib/file-envoi";
import { ecrireFile, lireFile, stockageLocal } from "../lib/file-persistante";
import { nouvelId } from "../lib/identifiant";
import { Saisie, versEvenement } from "../lib/saisie";
import type { SourceDirect } from "../lib/source-direct";

const DELAI_REESSAI_MS = 4_000;
/** Entre deux lectures du serveur : c'est ainsi qu'on voit ce que saisissent les autres appareils. */
const DELAI_SYNCHRO_MS = 5_000;

export function useDirect(matchId: string, source: SourceDirect) {
  const [etat, setEtat] = useState<EtatDirect | null>(null);
  const [introuvable, setIntrouvable] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [file, setFile] = useState<Operation[]>([]);
  const fileRestauree = useRef(false);
  /** Incremente a chaque nouvel essai d'envoi apres un echec : c'est ce qui relance l'effet de la file. */
  const [essai, setEssai] = useState(0);
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
    try { appliquer(await source.charger()); setErreur(null); }
    catch (e) {
      if (e instanceof ApiError && e.statut === 404) setIntrouvable(true);
      else setErreur(e instanceof ApiError ? messageApi(e) : "Impossible de joindre le serveur.");
    }
  }, [appliquer, source]);

  useEffect(() => { void charger(); }, [charger]);

  // La file survit au rechargement : on reprend ce qui n'avait pas ete confirme (apres le premier rendu, jamais pendant le rendu serveur).
  useEffect(() => {
    const restauree = lireFile(stockageLocal(), matchId);
    fileRestauree.current = true;
    if (restauree.length > 0) setFile((f) => [...restauree, ...f]);
  }, [matchId]);
  useEffect(() => { if (fileRestauree.current) ecrireFile(stockageLocal(), matchId, file); }, [file, matchId]);

  // Plusieurs saisisseurs : on relit le match toutes les 5 s quand rien n'est en attente d'envoi, et des qu'on revient sur l'onglet.
  const occupeRef = useRef(false);
  useEffect(() => { occupeRef.current = occupe || file.length > 0; }, [occupe, file.length]);
  useEffect(() => {
    const lire = async () => {
      if (occupeRef.current || (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
      try {
        const e = await source.charger();
        if (occupeRef.current) return;                    // une saisie est partie pendant la lecture : cette lecture est deja perimee
        appliquer(e); setHorsLigne(false);
      } catch (e) { if (!(e instanceof ApiError)) setHorsLigne(true); }
    };
    const t = setInterval(() => void lire(), DELAI_SYNCHRO_MS);
    const retour = () => { if (document.visibilityState === "visible") void lire(); };
    document.addEventListener("visibilitychange", retour);
    window.addEventListener("online", retour);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", retour); window.removeEventListener("online", retour); };
  }, [appliquer, source]);

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
          const confirme = await source.enregistrer(op.evenement);
          setEtat((s) => s && { ...s, evenements: [...s.evenements.filter((e) => e.id !== confirme.id), { ...confirme }] });
        } else {
          await source.supprimer(op.id);
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
          relancer = setTimeout(() => { envoiEnCours.current = false; setEssai((n) => n + 1); }, DELAI_REESSAI_MS);
          return;
        }
      }
      envoiEnCours.current = false;
      battre((n) => n + 1);
    })();
    return () => { if (relancer) clearTimeout(relancer); };
  }, [file, source, charger, essai]);

  const evenements = useMemo(() => (etat ? evenementsAffiches(etat.evenements, file) : []), [etat, file]);
  const scoreAffiche = useMemo(() => score(evenements), [evenements]);
  const compteursAffiches = useMemo(() => compteurs(evenements), [evenements]);

  const minute = etat ? minuteDe(etat.chrono, maintenant()) : 0;
  const chronoAffiche = etat ? formaterChrono(etat.chrono, maintenant()) : "00:00";

  const chrono = useCallback(async (action: ActionChrono, minuteCible?: number) => {
    setOccupe(true);
    try { appliquer(await source.chrono(action, minuteCible)); setErreur(null); setHorsLigne(false); }
    catch (e) {
      if (e instanceof ApiError) setErreur(messageApi(e));
      else { setErreur("Pas de réseau : l'action sur le chrono n'a pas été prise en compte."); setHorsLigne(true); }
    } finally { setOccupe(false); }
  }, [appliquer, source]);

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
    try { if (source.cloturer) appliquer(await source.cloturer()); setErreur(null); }
    catch (e) { setErreur(e instanceof ApiError ? messageApi(e) : "Pas de réseau."); }
    finally { setOccupe(false); }
  }, [appliquer, source]);

  const rouvrir = useCallback(async () => {
    setOccupe(true);
    try { if (source.rouvrir) appliquer(await source.rouvrir()); setErreur(null); }
    catch (e) { setErreur(e instanceof ApiError ? messageApi(e) : "Pas de réseau."); }
    finally { setOccupe(false); }
  }, [appliquer, source]);

  return {
    etat, introuvable, erreur, effacerErreur: () => setErreur(null), evenements, score: scoreAffiche, compteurs: compteursAffiches,
    minute, chronoAffiche, maintenant, chrono, enregistrer, supprimer, annulerDernier, retablir, peutRetablir: !!annule,
    cloturer, rouvrir, occupe, enAttente: file.length, horsLigne, recharger: charger,
  };
}
