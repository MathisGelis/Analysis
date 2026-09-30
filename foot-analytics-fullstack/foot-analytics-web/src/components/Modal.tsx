// src/components/Modal.tsx
"use client";

// Modale rendue via portail React dans document.body, pour echapper
// aux containing blocks crees par les animations CSS (fade-up : translateY)
// des pages parentes — sinon position:fixed s'ancre au document, pas
// au viewport, et la fenetre apparait au milieu du document.
//
// Bonus : verrouille le scroll du body tant que la modale est ouverte
// et ferme avec Escape.

import { useEffect } from "react";
import { createPortal } from "react-dom";

export function Modal({
  open, onClose, children, maxWidth = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  // Fermeture clavier (Esc) + lock du scroll body
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  if (typeof window === "undefined") return null;

  return createPortal(
    <div
      // overflow-y-auto sur l'overlay : si la modale est plus haute que le
      // viewport, on peut scroller dans la modale (et non dans la page).
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm "
      onClick={onClose}
    >
      {/* Wrapper qui centre verticalement le contenu sur la hauteur du
          viewport, avec un padding qui permet aussi le scroll en interne. */}
      <div className="min-h-full flex items-center justify-center p-4">
        <div
          className={`panel-pop pop-in w-full ${maxWidth} p-6 my-auto`}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
