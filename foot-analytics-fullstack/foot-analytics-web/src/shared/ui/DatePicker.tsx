"use client";
// src/shared/ui/DatePicker.tsx
//
// Selecteur de date maison : remplace <input type="date"> (dont le calendrier est dessine par le navigateur).
// Un champ de saisie JJ/MM/AAAA (les chiffres se regroupent tout seuls : "12032004" -> "12/03/2004") et un bouton
// qui ouvre un calendrier dans un panneau flottant. Le titre du calendrier ouvre le choix du mois, puis de l'annee :
// retrouver une date de naissance ne demande pas trente clics. La valeur circule en ISO "AAAA-MM-JJ", "" si vide.
//
// Clavier : fleches (jour), PageHaut / PageBas (mois ; Maj = annee), Debut / Fin (semaine), Entree choisit, Echap ferme.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import {
  ajouterJours, ajouterMois, aujourdhuiIso, borner, construireIso, debutPageAnnees, decouper, formaterFrappe,
  grilleDuMois, isoDepuisSaisie, isoDepuisValeur, isoValide, JOURS_COURTS, libelleLong, MOIS, saisieDepuisIso,
} from "@/shared/lib/selecteur-date";

import { Flottant } from "./Flottant";

type Vue = "jours" | "mois" | "annees";

interface Props {
  valeur: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
  ariaLabel?: string;
  id?: string;
  disabled?: boolean;
  /** Classes du champ : "inp" par defaut. */
  className?: string;
  placeholder?: string;
  /** Date sur laquelle s'ouvre le calendrier quand rien n'est choisi (par defaut : aujourd'hui). */
  ouvrirSur?: string;
  /** Propose "Effacer" (defaut : oui). */
  effacable?: boolean;
  /** Date de naissance : pas de date future, et le calendrier s'ouvre sur il y a vingt ans plutot que sur aujourd'hui. */
  naissance?: boolean;
  "data-testid"?: string;
}

const MOIS_COURTS = ["Janv.", "Fevr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Aout", "Sept.", "Oct.", "Nov.", "Dec."];
const COMPLETE = /^(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})$/;

export function DatePicker({
  valeur: valeurBrute, onChange, min, ariaLabel, id, disabled = false, className = "inp", placeholder = "jj/mm/aaaa",
  ouvrirSur: ouvrirSurDemande, effacable = true, naissance = false, max: maxDemande, "data-testid": testId,
}: Props) {
  // La base peut contenir "18/10/2026" (feuilles FMI) ou une date avec heure : le champ la montre, sans reecrire la valeur d'origine.
  const valeur = isoDepuisValeur(valeurBrute);
  const aujourdhuiLocal = aujourdhuiIso();
  const max = maxDemande ?? (naissance ? aujourdhuiLocal : undefined);
  const ouvrirSur = ouvrirSurDemande ?? (naissance ? `${+aujourdhuiLocal.slice(0, 4) - 20}-01-01` : undefined);
  const idPanneau = useId();
  const ancre = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const contenu = useRef<HTMLDivElement>(null);
  const [texte, setTexte] = useState(() => saisieDepuisIso(valeur));
  const [ouvert, setOuvert] = useState(false);
  const [vue, setVue] = useState<Vue>("jours");
  const [affiche, setAffiche] = useState(() => aujourdhuiIso());     // un jour du mois montre
  const [focus, setFocus] = useState(() => aujourdhuiIso());         // jour qui a le focus clavier
  const aujourdhui = aujourdhuiIso();
  // Le focus entre dans la grille a l'ouverture et quand on la parcourt au clavier, pas quand on clique les fleches du mois.
  const donnerFocus = useRef(true);

  // La valeur change depuis l'exterieur (reinitialisation du formulaire, choix dans le calendrier) : le champ suit.
  useEffect(() => { setTexte(saisieDepuisIso(valeur)); }, [valeur]);

  const dansBornes = (iso: string) => (!min || !isoValide(min) || iso >= min) && (!max || !isoValide(max) || iso <= max);

  function valider(iso: string) {
    const v = borner(iso, min, max);
    setTexte(saisieDepuisIso(v));
    if (v !== valeur) onChange(v);
  }

  function saisir(brut: string) {
    const f = formaterFrappe(brut);
    setTexte(f);
    if (f === "") { if (effacable && valeur) onChange(""); return; }
    const iso = COMPLETE.test(f) ? isoDepuisSaisie(f) : null;
    if (iso) valider(iso);
  }

  function quitterChamp() {
    // Saisie incomplete ou impossible : on revient a la derniere date valide plutot que de laisser un champ mensonger.
    const iso = isoDepuisSaisie(texte);
    if (texte.trim() === "") { if (effacable && valeur) onChange(""); else setTexte(saisieDepuisIso(valeur)); }
    else if (iso) valider(iso);
    else setTexte(saisieDepuisIso(valeur));
  }

  function ouvrir() {
    if (disabled) return;
    const depart = isoValide(valeur) ? valeur : isoValide(ouvrirSur) ? ouvrirSur : aujourdhui;
    const d = borner(depart, min, max);
    donnerFocus.current = true;
    setAffiche(d); setFocus(d); setVue("jours"); setOuvert(true);
  }
  const fermer = (rendreLeFocus = true) => {
    setOuvert(false);
    if (rendreLeFocus) champ.current?.focus({ preventScroll: true });
  };
  function choisir(iso: string) {
    if (!dansBornes(iso)) return;
    valider(iso);
    fermer();
  }

  // Le focus clavier suit le jour actif (et entre dans le calendrier a l'ouverture).
  useEffect(() => {
    if (!ouvert || vue !== "jours") return;
    if (!donnerFocus.current) { donnerFocus.current = true; return; }
    contenu.current?.querySelector<HTMLElement>(`[data-iso="${focus}"]`)?.focus({ preventScroll: true });
  }, [ouvert, vue, focus, affiche]);
  useEffect(() => {
    if (!ouvert || vue === "jours") return;
    contenu.current?.querySelector<HTMLElement>("[data-courant='true']")?.focus({ preventScroll: true });
  }, [ouvert, vue]);

  function surToucheGrille(e: React.KeyboardEvent) {
    const decalage: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let suivant: string | null = null;
    if (e.key in decalage) suivant = ajouterJours(focus, decalage[e.key]);
    else if (e.key === "PageUp") suivant = ajouterMois(focus, e.shiftKey ? -12 : -1);
    else if (e.key === "PageDown") suivant = ajouterMois(focus, e.shiftKey ? 12 : 1);
    else if (e.key === "Home") suivant = ajouterJours(focus, -((new Date(focus + "T00:00:00Z").getUTCDay() + 6) % 7));
    else if (e.key === "End") suivant = ajouterJours(focus, 6 - ((new Date(focus + "T00:00:00Z").getUTCDay() + 6) % 7));
    if (!suivant) return;
    e.preventDefault();
    const v = borner(suivant, min, max);
    donnerFocus.current = true;
    setFocus(v);
    setAffiche(v);
  }

  const { annee, mois } = decouper(affiche);
  const cases = useMemo(() => grilleDuMois(annee, mois), [annee, mois]);
  const debutAnnees = debutPageAnnees(annee);

  function precedentSuivant(pas: 1 | -1) {
    if (vue === "jours") {
      donnerFocus.current = false;
      setAffiche(ajouterMois(affiche, pas));
      setFocus(borner(ajouterMois(focus, pas), min, max));
    }
    else if (vue === "mois") setAffiche(ajouterMois(affiche, 12 * pas));
    else setAffiche(ajouterMois(affiche, 144 * pas));
  }
  const titre = vue === "jours" ? `${MOIS[mois - 1]} ${annee}` : vue === "mois" ? String(annee) : `${debutAnnees} - ${debutAnnees + 11}`;
  const libellePas = vue === "jours" ? ["Mois precedent", "Mois suivant"] : vue === "mois" ? ["Annee precedente", "Annee suivante"] : ["Annees precedentes", "Annees suivantes"];

  const bouton = "rounded-lg text-sm transition-colors hover:bg-accent/[0.13] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <div ref={ancre} className="relative">
      <input
        ref={champ} id={id} type="text" inputMode="numeric" autoComplete="off" spellCheck={false} maxLength={10}
        value={texte} placeholder={placeholder} disabled={disabled} aria-label={ariaLabel} data-testid={testId}
        aria-haspopup="dialog"
        onChange={(e) => saisir(e.target.value)} onBlur={quitterChamp}
        onKeyDown={(e) => { if (e.key === "ArrowDown" && e.altKey) { e.preventDefault(); ouvrir(); } }}
        className={`${className} !pr-10 tabular-nums`}
      />
      <button
        type="button" disabled={disabled} onClick={() => (ouvert ? fermer(false) : ouvrir())}
        aria-label="Ouvrir le calendrier" aria-haspopup="dialog" aria-expanded={ouvert} aria-controls={ouvert ? idPanneau : undefined}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted transition-colors hover:text-ink disabled:opacity-50"
      >
        <CalendarDays size={15} aria-hidden />
      </button>

      {ouvert && (
        <Flottant ancre={ancre.current} onFermer={fermer} hauteurMax={400} largeur={288} id={idPanneau} role="dialog" ariaLabel="Choisir une date">
          <div ref={contenu} className="p-3">
            <div className="mb-2 flex items-center justify-between gap-1">
              <button type="button" aria-label={libellePas[0]} onClick={() => precedentSuivant(-1)} className={`${bouton} p-1.5`}>
                <ChevronLeft size={16} aria-hidden />
              </button>
              <button
                type="button" aria-live="polite"
                aria-label={vue === "jours" ? `${titre}, choisir un mois` : vue === "mois" ? `${titre}, choisir une annee` : "Revenir aux jours"}
                onClick={() => setVue(vue === "jours" ? "mois" : vue === "mois" ? "annees" : "jours")}
                className={`${bouton} px-3 py-1 font-semibold capitalize text-ink`}
              >
                {titre}
              </button>
              <button type="button" aria-label={libellePas[1]} onClick={() => precedentSuivant(1)} className={`${bouton} p-1.5`}>
                <ChevronRight size={16} aria-hidden />
              </button>
            </div>

            {vue === "jours" && (
              <table className="w-full border-separate" style={{ borderSpacing: 2 }} onKeyDown={surToucheGrille}>
                <thead>
                  <tr>{JOURS_COURTS.map((j, i) => (
                    <th key={i} scope="col" className="h-7 text-[11px] font-semibold uppercase text-faint">{j}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {Array.from({ length: 6 }, (_, ligne) => (
                    <tr key={ligne}>
                      {cases.slice(ligne * 7, ligne * 7 + 7).map((c) => {
                        const choisi = c.iso === valeur;
                        const permis = dansBornes(c.iso);
                        return (
                          <td key={c.iso} className="p-0 text-center">
                            <button
                              type="button" data-iso={c.iso} disabled={!permis}
                              tabIndex={c.iso === focus ? 0 : -1} aria-label={libelleLong(c.iso)} aria-pressed={choisi}
                              aria-current={c.iso === aujourdhui ? "date" : undefined}
                              onClick={() => choisir(c.iso)}
                              className={`${bouton} h-9 w-9 tabular-nums ${
                                choisi ? "!bg-accent font-semibold text-white"
                                  : c.dansMois ? "text-ink" : "text-faint"
                              } ${c.iso === aujourdhui && !choisi ? "ring-1 ring-accent/60" : ""}`}
                            >
                              {c.jour}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {vue === "mois" && (
              <div className="grid grid-cols-3 gap-1.5 py-1">
                {MOIS_COURTS.map((m, i) => {
                  const debut = construireIso(annee, i + 1, 1);
                  const fin = construireIso(annee, i + 1, 28);
                  const permis = (!max || debut <= max) && (!min || fin >= min);
                  const courant = i + 1 === mois;
                  return (
                    <button
                      key={m} type="button" disabled={!permis} data-courant={courant} aria-label={`${MOIS[i]} ${annee}`}
                      onClick={() => { const v = borner(construireIso(annee, i + 1, Math.min(decouper(focus).jour, 28)), min, max); setAffiche(v); setFocus(v); setVue("jours"); }}
                      className={`${bouton} h-11 ${courant ? "!bg-accent/[0.18] font-semibold text-accent" : "text-ink"}`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            )}

            {vue === "annees" && (
              <div className="grid grid-cols-3 gap-1.5 py-1">
                {Array.from({ length: 12 }, (_, i) => debutAnnees + i).map((a) => {
                  const permis = (!max || a <= decouper(max).annee) && (!min || a >= decouper(min).annee);
                  const courant = a === annee;
                  return (
                    <button
                      key={a} type="button" disabled={!permis} data-courant={courant}
                      onClick={() => { setAffiche(borner(construireIso(a, mois, 1), min, max)); setVue("mois"); }}
                      className={`${bouton} h-11 tabular-nums ${courant ? "!bg-accent/[0.18] font-semibold text-accent" : "text-ink"}`}
                    >
                      {a}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
              <button type="button" className="btn !px-3 !py-1 text-xs" disabled={!dansBornes(aujourdhui)} onClick={() => choisir(aujourdhui)}>
                Aujourd'hui
              </button>
              {effacable && (
                <button type="button" className="btn btn-ghost !px-3 !py-1 text-xs" disabled={!valeur}
                  onClick={() => { onChange(""); setTexte(""); fermer(); }}>
                  Effacer
                </button>
              )}
            </div>
          </div>
        </Flottant>
      )}
    </div>
  );
}
