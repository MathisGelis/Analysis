// src/app/loading.tsx
//
// Squelette affiche pendant le chargement serveur d'une page (le calcul des
// Server Components appelle l'API). Pulse desactive si l'utilisateur prefere
// moins d'animations.

function Bloc({ className = "" }: { className?: string }) {
  return <div className={`panel motion-safe:animate-pulse ${className}`} aria-hidden="true" />;
}

export default function Chargement() {
  return (
    <div className="space-y-6 max-w-[1400px]" role="status" aria-label="Chargement en cours">
      <Bloc className="h-36" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Bloc key={i} className="h-28" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Bloc className="h-56 lg:col-span-2" />
        <Bloc className="h-56" />
      </div>
      <span className="sr-only">Chargement en cours</span>
    </div>
  );
}
