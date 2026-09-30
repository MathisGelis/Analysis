// src/lib/navigation.ts
//
// Plan de navigation de l'application, partage par la barre laterale, la barre
// du haut (titre de la page) et la palette de commandes. Fonctions pures.

import {
  Award, Brain, Calendar, ClipboardList, Dumbbell, FileText, HeartPulse, Layout,
  LayoutDashboard, Search, Shield, Trophy, Upload, Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface LienNav {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Mots-cles supplementaires pour la palette de commandes. */
  motsCles?: string;
}
export interface SectionNav {
  section: string;
  items: LienNav[];
}

export function construireNavigation(ownClubId: string | null): SectionNav[] {
  return [
    {
      section: "Vue d'ensemble",
      items: [
        { href: "/", label: "Dashboard", icon: LayoutDashboard, motsCles: "accueil resume" },
        { href: "/classement", label: "Classement", icon: Trophy, motsCles: "poule rang points buteurs" },
        { href: "/calendrier", label: "Calendrier", icon: Calendar, motsCles: "agenda planning" },
      ],
    },
    {
      section: "Mon equipe",
      items: [
        { href: ownClubId ? `/club/${ownClubId}` : "/", label: "Mon club", icon: Shield, motsCles: "equipe fiche" },
        { href: "/effectif", label: "Effectif", icon: Users, motsCles: "joueurs liste" },
        { href: "/entrainements", label: "Entrainements", icon: Dumbbell, motsCles: "seances charge" },
        { href: "/medical", label: "Medical & charge", icon: HeartPulse, motsCles: "blessures fatigue sante" },
      ],
    },
    {
      section: "Match",
      items: [
        { href: "/matchs", label: "Matchs", icon: ClipboardList, motsCles: "resultats feuilles fmi" },
        { href: "/tactique", label: "Tactique", icon: Layout, motsCles: "composition dispositif" },
        { href: "/arbitres", label: "Arbitres", icon: Award, motsCles: "arbitrage cartons" },
      ],
    },
    {
      section: "Analyse",
      items: [
        { href: "/scouting", label: "Scouting", icon: Search, motsCles: "adversaires rapport observation" },
        { href: "/ia", label: "Predictions", icon: Brain, motsCles: "prochain match resultat systeme dispositif onze probable projection" },
        { href: "/rapports", label: "Rapports", icon: FileText, motsCles: "analyse equipe pdf" },
      ],
    },
    {
      section: "Donnees",
      items: [
        { href: "/import", label: "Import feuilles FMI", icon: Upload, motsCles: "importer pdf fmi" },
      ],
    },
  ];
}

/** Le lien est-il "actif" pour ce chemin ? Le dashboard ne l'est que sur "/". */
export function lienActif(href: string, chemin: string): boolean {
  if (href === "/") return chemin === "/";
  return chemin === href || chemin.startsWith(`${href}/`);
}

const TITRES: [string, string][] = [
  ["/classement", "Classement"], ["/calendrier", "Calendrier"], ["/club", "Fiche club"],
  ["/effectif", "Effectif"], ["/entrainements", "Entrainements"], ["/medical", "Medical & charge"],
  ["/matchs", "Matchs"], ["/tactique", "Tactique"], ["/arbitres", "Arbitres"],
  ["/scouting", "Scouting"], ["/rapports", "Rapports"], ["/import", "Import FMI"],
  ["/saisons", "Saisons"], ["/joueur", "Fiche joueur"], ["/coachs", "Fiche entraineur"], ["/admin", "Administration"],
  ["/analytics", "Analytics"], ["/ia", "Predictions"],
];

/** Titre affiche dans la barre du haut pour un chemin. */
export function titrePage(chemin: string): string {
  if (chemin === "/") return "Dashboard";
  return TITRES.find(([prefixe]) => chemin === prefixe || chemin.startsWith(`${prefixe}/`))?.[1] ?? "Foot Analytics";
}
