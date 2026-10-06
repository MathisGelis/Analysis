// src/app/loading.tsx
//
// Squelette affiche pendant le chargement serveur d'une page (le calcul des
// Server Components appelle l'API). Un reflet traverse les blocs ; il est
// neutralise si l'utilisateur prefere moins d'animations.

function Bloc({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-[18px]! border border-line ${className}`} aria-hidden="true" />;
}

export default function Chargement() {
  return (
    <div className="space-y-6" role="status" aria-label="Chargement en cours">
      <Bloc className="h-44" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Bloc key={i} className="h-28" />)}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Bloc className="h-64 lg:col-span-2" />
        <Bloc className="h-64" />
      </div>
      <span className="sr-only">Chargement en cours</span>
    </div>
  );
}
