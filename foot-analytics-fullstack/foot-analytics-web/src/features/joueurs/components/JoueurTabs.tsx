"use client";
// src/features/joueurs/components/JoueurTabs.tsx
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

import { TabBar } from "@/shared/ui/TabBar";

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
      <TabBar onglets={TABS} actif={active} onChange={setActive} label="Sections de la fiche joueur" />

      {/* Contenu de l'onglet actif */}
      <div className="fade-up">{content[active]}</div>
    </div>
  );
}
