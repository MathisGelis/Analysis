"use client";
// src/components/JoueurTabs.tsx
//
// Selecteur d'onglets horizontal pour la fiche joueur. Quatre vues :
//   - Informations  : morpho, pied fort, statut, etc.
//   - Stats         : KPI matchs + terrain + courbes
//   - Medical       : score forme, silhouette + historique blessures
//   - Historique    : parcours par saison
//
// La topbar (header) reste affichee au-dessus, ce composant ne gere
// que la zone qui change selon l'onglet.

import { useState } from "react";
import { User, BarChart3, HeartPulse, Calendar } from "lucide-react";

const TABS = [
  { id: "infos", label: "Informations", icon: User },
  { id: "stats", label: "Stats", icon: BarChart3 },
  { id: "medical", label: "Medical", icon: HeartPulse },
  { id: "historique", label: "Historique", icon: Calendar },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function JoueurTabs({
  infosContent, statsContent, medicalContent, historiqueContent,
}: {
  infosContent: React.ReactNode;
  statsContent: React.ReactNode;
  medicalContent: React.ReactNode;
  historiqueContent: React.ReactNode;
}) {
  const [active, setActive] = useState<TabId>("stats");

  const content: Record<TabId, React.ReactNode> = {
    infos: infosContent,
    stats: statsContent,
    medical: medicalContent,
    historique: historiqueContent,
  };

  return (
    <div className="space-y-5">
      {/* Selecteur d'onglets */}
      <div className="flex gap-1 border-b border-line overflow-x-auto -mx-1 px-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const on = t.id === active;
          return (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap flex items-center gap-2
                border-b-2 -mb-px transition
                ${on
                  ? "border-turf text-turf"
                  : "border-transparent text-muted hover:text-ink"}`}
            >
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Contenu de l'onglet actif */}
      <div className="fade-up">{content[active]}</div>
    </div>
  );
}
