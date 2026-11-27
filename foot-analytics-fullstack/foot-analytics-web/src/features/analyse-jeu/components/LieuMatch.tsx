// src/features/analyse-jeu/components/LieuMatch.tsx
//
// Domicile ou exterieur, en toutes lettres courtes (« Dom. » / « Ext. ») : plus lisible que « vs » et « @ » devant un nom d'adversaire.

export function LieuMatch({ domicile }: { domicile: boolean }) {
  return (
    <span className={`badge !px-1.5 !py-0 text-[10px] ${domicile ? "" : "badge-accent"}`} title={domicile ? "À domicile" : "À l'extérieur"}>
      {domicile ? "Dom." : "Ext."}
    </span>
  );
}
