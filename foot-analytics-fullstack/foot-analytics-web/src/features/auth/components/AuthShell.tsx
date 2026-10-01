// src/features/auth/components/AuthShell.tsx
//
// Cadre des pages hors connexion (login, changement de mot de passe) : a gauche
// la promesse du produit sur fond degrade, a droite le formulaire. Sur mobile
// seul le formulaire reste, sous la marque.

import { BarChart3, FileUp, ShieldCheck } from "lucide-react";

import { Logo } from "@/features/shell/components/Logo";

const ATOUTS = [
  { icon: FileUp, titre: "Import des feuilles de match", texte: "Glissez la FMI en PDF : compositions, cartons, remplacements et arbitres sont lus pour vous." },
  { icon: BarChart3, titre: "Des stats par equipe et par saison", texte: "Chaque chiffre est calcule sur la bonne poule et la bonne saison, jamais melange." },
  { icon: ShieldCheck, titre: "Scouting et preparation", texte: "Rapports adverses, joueurs cles, discipline : de quoi preparer le prochain match." },
];

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative z-10 grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside aria-label="Presentation" className="relative hidden overflow-hidden border-r border-line lg:block">
        <div className="absolute inset-0 bg-gradient-to-br from-accentstrong/30 via-panel to-accent2/15" />
        <div className="pitch-lines !opacity-100" style={{ maskPosition: "right 20% top 45%", WebkitMaskPosition: "right 20% top 45%", maskSize: "auto 120%", WebkitMaskSize: "auto 120%" }} />
        <div className="relative flex h-full flex-col justify-between p-12 xl:p-16">
          <div className="flex items-center gap-3">
            <Logo size={44} />
            <div className="leading-tight">
              <div className="font-display text-xl font-bold text-ink">Foot Analytics</div>
              <div className="text-xs font-medium text-muted">Console staff</div>
            </div>
          </div>

          <div className="max-w-lg">
            <h2 className="font-display text-4xl font-bold leading-[1.08] text-ink xl:text-5xl">
              Preparez le prochain match <span className="text-gradient">avec les bons chiffres.</span>
            </h2>
            <ul className="mt-10 space-y-5">
              {ATOUTS.map(({ icon: Icone, titre, texte }) => (
                <li key={titre} className="flex gap-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent">
                    <Icone size={18} />
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-ink">{titre}</div>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted">{texte}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-faint">Outil prive du staff technique.</p>
        </div>
      </aside>

      <div className="flex items-center justify-center p-5 sm:p-10">
        <div className="fade-up w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Logo size={40} />
            <div className="font-display text-xl font-bold text-ink">Foot Analytics</div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
