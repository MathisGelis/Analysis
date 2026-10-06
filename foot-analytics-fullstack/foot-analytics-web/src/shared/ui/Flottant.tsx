"use client";
// src/shared/ui/Flottant.tsx
//
// Panneau flottant ancre a un element (liste deroulante, calendrier). Rendu dans document.body par un portail :
// aucun conteneur a defilement ou a `overflow` (modale, tableau) ne peut le couper. Il se place sous l'ancre, ou
// au-dessus s'il n'y a pas la place, reste dans l'ecran et suit l'ancre quand la page defile.
//
// Fermeture : clic en dehors (le clic n'agit pas sur ce qu'il touche, comme une liste native), Echap (sans fermer
// la modale qui contient peut-etre l'ancre : l'ecoute se fait en phase de capture sur window).

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  ancre: HTMLElement | null;
  onFermer: () => void;
  /** Hauteur maximale souhaitee (px) : la place disponible la reduit si besoin. */
  hauteurMax?: number;
  /** Largeur minimale (px) en plus de celle de l'ancre. */
  largeurMin?: number;
  /** Largeur imposee (px), par exemple pour un calendrier. */
  largeur?: number;
  className?: string;
  children: React.ReactNode;
  id?: string;
  role?: string;
  ariaLabel?: string;
}

interface Position { top: number; left: number; width: number; maxHeight: number }

const MARGE = 8;

export function Flottant({ ancre, onFermer, hauteurMax = 320, largeurMin = 0, largeur, className = "", children, id, role, ariaLabel }: Props) {
  const panneau = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Position | null>(null);
  const fermer = useRef(onFermer);
  fermer.current = onFermer;
  const replacer = useRef<() => void>(() => {});

  // Placement : recalcule a l'ouverture, au redimensionnement et quand n'importe quel parent defile.
  useLayoutEffect(() => {
    if (!ancre) return;
    const placer = () => {
      const r = ancre.getBoundingClientRect();
      const largeurPanneau = Math.min(largeur ?? Math.max(r.width, largeurMin), window.innerWidth - 2 * MARGE);
      const dessous = window.innerHeight - r.bottom - MARGE;
      const dessus = r.top - MARGE;
      const enBas = dessous >= Math.min(hauteurMax, 220) || dessous >= dessus;
      const place = Math.max(120, enBas ? dessous : dessus);
      const maxHeight = Math.min(hauteurMax, place);
      const hauteur = Math.min(panneau.current?.offsetHeight ?? maxHeight, maxHeight);
      setPos({
        width: largeurPanneau,
        maxHeight,
        left: Math.max(MARGE, Math.min(r.left, window.innerWidth - largeurPanneau - MARGE)),
        top: enBas ? r.bottom + 4 : Math.max(MARGE, r.top - hauteur - 4),
      });
    };
    replacer.current = placer;
    placer();
    window.addEventListener("resize", placer);
    window.addEventListener("scroll", placer, true);
    return () => {
      window.removeEventListener("resize", placer);
      window.removeEventListener("scroll", placer, true);
    };
  }, [ancre, hauteurMax, largeurMin, largeur]);

  useEffect(() => {
    // Le panneau peut changer de hauteur (filtre d'une liste) : on re-place sans attendre un evenement.
    const obs = typeof ResizeObserver !== "undefined" && panneau.current ? new ResizeObserver(() => replacer.current()) : null;
    if (obs && panneau.current) obs.observe(panneau.current);

    const dehors = (e: PointerEvent) => {
      const cible = e.target as Node | null;
      if (!cible || panneau.current?.contains(cible) || ancre?.contains(cible)) return;
      fermer.current();
      // Le clic qui suit ne doit rien declencher (ni fermer la modale, ni activer un bouton sous le pointeur).
      const avaler = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener("click", avaler, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", avaler, true), 400);
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      fermer.current();
    };
    document.addEventListener("pointerdown", dehors, true);
    window.addEventListener("keydown", echap, true);
    return () => {
      obs?.disconnect();
      document.removeEventListener("pointerdown", dehors, true);
      window.removeEventListener("keydown", echap, true);
    };
  }, [ancre]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={panneau} id={id} role={role} aria-label={ariaLabel}
      // Avant son placement (un instant, avant le premier affichage) le panneau est transparent et non cliquable, jamais
      // `visibility:hidden` : un element cache ne peut pas prendre le focus, et la liste doit le prendre des l'ouverture.
      style={pos ? { top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight } : { top: 0, left: 0, opacity: 0, pointerEvents: "none" }}
      className={`panel-pop pop-in fixed z-70 flex flex-col overflow-hidden !rounded-xl ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}
