// src/shared/ui/Spinner.tsx
//
// Petit cercle de chargement : un anneau dont un quart est a l'accent. Decoratif (aria-hidden) : l'annonce aux lecteurs
// d'ecran est faite par l'ecran de chargement (app/loading.tsx). L'animation est coupee si l'utilisateur prefere moins de
// mouvement (voir globals.css) ; l'anneau reste alors visible, fixe.

export function Spinner({ taille = 18, className = "" }: { taille?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-testid="spinner"
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-line2 border-t-accent ${className}`}
      style={{ width: taille, height: taille }}
    />
  );
}
