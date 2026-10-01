// src/app/template.tsx
//
// Contrairement au layout, un template est recree a chaque navigation : c'est ce
// qui rejoue l'animation d'entree de la page (fondu + leger glissement).

export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
