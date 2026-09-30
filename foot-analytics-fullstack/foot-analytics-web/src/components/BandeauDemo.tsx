// src/components/BandeauDemo.tsx
//
// Bandeau d'avertissement pour les pages alimentees par des donnees de
// DEMONSTRATION (jeu d'exemple embarque), et non par les feuilles de match
// importees. Evite qu'un staff prenne pour une analyse de son equipe des
// chiffres qui n'en sont pas.

import { FlaskConical } from "lucide-react";

export function BandeauDemo({ children }: { children?: React.ReactNode }) {
  return (
    <div role="note"
      className="panel-inset p-3 flex items-start gap-3 border-l-2 border-amber text-xs text-muted">
      <FlaskConical size={16} className="text-amber shrink-0 mt-0.5"/>
      <p>
        <strong className="text-ink">Donnees de demonstration.</strong>{" "}
        {children ?? "Cette page utilise un jeu d'exemple embarque, pas vos feuilles de match : les chiffres ne concernent ni votre equipe ni la saison choisie."}
      </p>
    </div>
  );
}
