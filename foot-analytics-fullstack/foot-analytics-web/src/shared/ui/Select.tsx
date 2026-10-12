"use client";
// src/shared/ui/Select.tsx
//
// Liste deroulante maison : remplace tous les <select> natifs (leur menu est dessine par le navigateur, hors de
// notre charte, et change d'un systeme a l'autre). Le declencheur est un bouton ; la liste s'ouvre dans un panneau
// flottant (voir Flottant.tsx) qu'aucune modale ni aucun tableau ne peut couper.
//
// - clavier : Entree / Espace / fleches ouvrent, fleches / Debut / Fin naviguent, Entree choisit, Echap ferme,
//   une lettre saute a l'option qui commence par elle (comme une liste native) ;
// - plus de 12 options : un champ de recherche en tete de liste (accents et casse ignores) ;
// - options groupees, grisees (avec leur raison en `detail`), entree vide ;
// - accessible : role combobox + listbox, aria-activedescendant, aria-expanded.

import { forwardRef, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

import {
  dernierActif, filtrerOptions, grouperOptions, indexParFrappe, indexSuivant, premierActif, type OptionSelect,
} from "@/shared/lib/selecteur";

import { Flottant } from "./Flottant";

export type { OptionSelect };

/** Au-dela, la liste est trop longue pour etre parcourue a l'oeil : on ajoute la recherche. */
const SEUIL_RECHERCHE = 12;

interface Props {
  valeur: string;
  options: OptionSelect[];
  onChange: (valeur: string) => void;
  /** Texte du declencheur quand `valeur` ne correspond a aucune option (typiquement ""). */
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  id?: string;
  /** Classes du declencheur : "inp" (defaut), "select-fm", "btn"... */
  className?: string;
  /** Recherche en tete de liste : automatique au-dela de 12 options. */
  recherche?: boolean;
  /** Largeur minimale (px) de la liste, si les libelles sont plus longs que le declencheur. */
  largeurListe?: number;
  /** Affiche la fleche du declencheur (defaut : oui). */
  fleche?: boolean;
  "data-testid"?: string;
}

export const Select = forwardRef<HTMLButtonElement, Props>(function Select({
  valeur, options, onChange, placeholder = "Choisir...", disabled = false, ariaLabel, id, className = "inp",
  recherche, largeurListe, fleche = true, "data-testid": testId,
}, refExterne) {
  const idListe = useId();
  const declencheur = useRef<HTMLButtonElement | null>(null);
  const champ = useRef<HTMLInputElement>(null);
  const liste = useRef<HTMLDivElement>(null);
  const frappe = useRef({ texte: "", t: 0 });
  const [ouvert, setOuvert] = useState(false);
  const [requete, setRequete] = useState("");
  const [actif, setActif] = useState(-1);

  const avecRecherche = recherche ?? options.length > SEUIL_RECHERCHE;
  const visibles = useMemo(() => (avecRecherche ? filtrerOptions(options, requete) : options), [avecRecherche, options, requete]);
  const groupes = useMemo(() => grouperOptions(visibles), [visibles]);
  const choisie = options.find((o) => o.valeur === valeur);

  const poser = useCallback((el: HTMLButtonElement | null) => {
    declencheur.current = el;
    if (typeof refExterne === "function") refExterne(el);
    else if (refExterne) refExterne.current = el;
  }, [refExterne]);

  function ouvrir() {
    if (disabled) return;
    setRequete("");
    const i = options.findIndex((o) => o.valeur === valeur && !o.desactive);
    setActif(i >= 0 ? i : premierActif(options));
    setOuvert(true);
  }
  const fermer = useCallback((rendreLeFocus = true) => {
    setOuvert(false);
    if (rendreLeFocus) declencheur.current?.focus({ preventScroll: true });
  }, []);

  function choisir(i: number) {
    const o = visibles[i];
    if (!o || o.desactive) return;
    if (o.valeur !== valeur) onChange(o.valeur);
    fermer();
  }

  // Avec la recherche, le clavier est capte par le champ de recherche ; sinon par le declencheur.
  useEffect(() => { if (ouvert && avecRecherche) champ.current?.focus({ preventScroll: true }); }, [ouvert, avecRecherche]);

  // Le filtre change : on se positionne sur la premiere option qui reste (ou on garde l'option choisie).
  useEffect(() => {
    if (!ouvert || !avecRecherche) return;
    const i = visibles.findIndex((o) => o.valeur === valeur && !o.desactive);
    setActif(requete.trim() === "" && i >= 0 ? i : premierActif(visibles));
  }, [requete]); // eslint-disable-line react-hooks/exhaustive-deps

  // L'option active reste visible dans la liste. A l'image suivante : le panneau n'a sa hauteur maximale (donc son
  // defilement) qu'une fois place par Flottant.
  useEffect(() => {
    if (!ouvert) return;
    const image = requestAnimationFrame(() => {
      liste.current?.querySelector<HTMLElement>(`[data-index="${actif}"]`)?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(image);
  }, [actif, ouvert, groupes]);

  function surTouche(e: React.KeyboardEvent<HTMLElement>) {
    const touche = e.key;
    if (!ouvert) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(touche)) { e.preventDefault(); ouvrir(); }
      else if (touche.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !avecRecherche) {
        // Une lettre sur la liste fermee : comme une liste native, on ouvre sur l'option correspondante.
        ouvrir();
        frappe.current = { texte: touche, t: Date.now() };
        setActif(indexParFrappe(options, touche, options.findIndex((o) => o.valeur === valeur)));
      }
      return;
    }
    if (touche === "ArrowDown") { e.preventDefault(); setActif((i) => (i < 0 ? premierActif(visibles) : indexSuivant(visibles, i, 1))); }
    else if (touche === "ArrowUp") { e.preventDefault(); setActif((i) => (i < 0 ? dernierActif(visibles) : indexSuivant(visibles, i, -1))); }
    else if (touche === "Home" && !avecRecherche) { e.preventDefault(); setActif(premierActif(visibles)); }
    else if (touche === "End" && !avecRecherche) { e.preventDefault(); setActif(dernierActif(visibles)); }
    else if (touche === "Enter" || (touche === " " && !avecRecherche)) { e.preventDefault(); choisir(actif); }
    else if (touche === "Tab") { setOuvert(false); }
    else if (touche.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !avecRecherche) {
      const maintenant = Date.now();
      const texte = maintenant - frappe.current.t < 700 ? frappe.current.texte + touche : touche;
      frappe.current = { texte, t: maintenant };
      setActif((i) => indexParFrappe(visibles, texte, i));
    }
  }

  const idOption = (i: number) => `${idListe}-o${i}`;
  const enCours = actif >= 0 && actif < visibles.length ? idOption(actif) : undefined;
  // Valeur inconnue (une option retiree depuis) : on l'affiche telle quelle plutot que de la cacher.
  const texteAffiche = choisie?.libelle ?? (valeur || null);

  return (
    <>
      <button
        ref={poser} type="button" id={id} disabled={disabled} data-testid={testId}
        role="combobox" aria-haspopup="listbox" aria-expanded={ouvert} aria-controls={ouvert ? idListe : undefined}
        aria-label={ariaLabel} aria-activedescendant={ouvert && !avecRecherche ? enCours : undefined}
        onClick={() => (ouvert ? fermer() : ouvrir())} onKeyDown={surTouche}
        // Espace active un bouton au relachement dans certains navigateurs : la touche est deja traitee a l'enfoncement.
        onKeyUp={(e) => { if (e.key === " ") e.preventDefault(); }}
        className={`${className} ${className.split(/\s+/).includes("btn") ? "" : "flex"} items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <span className={`min-w-0 flex-1 truncate ${texteAffiche === null ? "text-faint" : ""}`}>
          {texteAffiche ?? placeholder}
        </span>
        {fleche && <ChevronDown size={13} aria-hidden className={`shrink-0 text-muted transition-transform ${ouvert ? "rotate-180" : ""}`} />}
      </button>

      {ouvert && (
        <Flottant ancre={declencheur.current} onFermer={fermer} hauteurMax={avecRecherche ? 340 : 288} largeurMin={largeurListe}>
          {avecRecherche && (
            <div className="relative shrink-0 border-b border-line p-2">
              <Search size={14} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
              <input
                ref={champ} value={requete} onChange={(e) => setRequete(e.target.value)} onKeyDown={surTouche}
                type="text" autoComplete="off" spellCheck={false} placeholder="Rechercher..."
                aria-label="Rechercher dans la liste" role="combobox" aria-expanded aria-controls={idListe}
                aria-autocomplete="list" aria-activedescendant={enCours}
                className="inp !py-1.5 !pl-8 text-sm"
              />
            </div>
          )}
          <div ref={liste} id={idListe} role="listbox" aria-label={ariaLabel} className="min-h-0 flex-1 overflow-y-auto p-1">
            {visibles.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-muted">Aucun resultat pour "{requete.trim()}".</p>
            ) : groupes.map((g, k) => (
              <div key={g.titre ?? `_${k}`} role="group" aria-label={g.titre ?? undefined}>
                {g.titre && <div className="h-section px-2.5 pb-1 pt-2">{g.titre}</div>}
                {g.options.map(({ option: o, index: i }) => (
                  <div
                    key={`${o.valeur}-${i}`} id={idOption(i)} role="option" data-index={i}
                    aria-selected={o.valeur === valeur} aria-disabled={o.desactive || undefined}
                    onMouseDown={(e) => e.preventDefault()} onClick={() => choisir(i)}
                    onMouseMove={() => { if (!o.desactive && actif !== i) setActif(i); }}
                    className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                      o.desactive ? "cursor-not-allowed text-faint" : "cursor-pointer text-ink"
                    } ${i === actif && !o.desactive ? "bg-accent/[0.13]" : ""}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate" title={o.libelle}>{o.libelle}</span>
                      {o.detail && <span className="block truncate text-[11px] text-muted" title={o.detail}>{o.detail}</span>}
                    </span>
                    {o.valeur === valeur && <Check size={14} aria-hidden className="shrink-0 text-accent" />}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Flottant>
      )}
    </>
  );
});
