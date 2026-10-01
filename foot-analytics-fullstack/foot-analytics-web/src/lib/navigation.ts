// src/lib/navigation.ts
//
// Plan de navigation de l'application, partage par la barre laterale et la barre
// du haut (titre de la page). Il ne sert qu'a naviguer entre les pages : la barre
// de recherche, elle, ne cherche que des fiches (joueurs, clubs, arbitres...).
// Fonctions pures.

import {
  Award, Brain, Calendar, CalendarRange, ClipboardList, Dumbbell, FileText, HeartPulse, Layout,
  LayoutDashboard, Search, Shield, ShieldCheck, Trophy, Upload, UserCog, Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface LienNav {
  href: string;
  label: string;
  icon: LucideIcon;
}
export interface SectionNav {
  section: string;
  items: LienNav[];
}

/**
 * Le lien de gestion des comptes, affiche en bas de la barre laterale a cote de la deconnexion (et non dans les menus) :
 * "Administration" pour l'administrateur, "Mes educateurs" pour le referent d'un club ; rien pour les autres.
 */
export function lienGestionComptes(role?: string | null): LienNav | null {
  if (role === "admin") return { href: "/admin/utilisateurs", label: "Administration", icon: ShieldCheck };
  if (role === "referent") return { href: "/admin/utilisateurs", label: "Mes educateurs", icon: UserCog };
  return null;
}

export function construireNavigation(ownClubId: string | null): SectionNav[] {
  return [
    {
      section: "Vue d'ensemble",
      items: [
        { href: "/", label: "Dashboard", icon: LayoutDashboard },
        { href: "/classement", label: "Classement", icon: Trophy },
        { href: "/calendrier", label: "Calendrier", icon: Calendar },
      ],
    },
    {
      section: "Mon equipe",
      items: [
        { href: ownClubId ? `/club/${ownClubId}` : "/", label: "Mon club", icon: Shield },
        { href: "/effectif", label: "Effectif", icon: Users },
        { href: "/entrainements", label: "Entrainements", icon: Dumbbell },
        { href: "/medical", label: "Medical & charge", icon: HeartPulse },
      ],
    },
    {
      section: "Match",
      items: [
        { href: "/matchs", label: "Matchs", icon: ClipboardList },
        { href: "/tactique", label: "Tactique", icon: Layout },
        { href: "/arbitres", label: "Arbitres", icon: Award },
      ],
    },
    {
      section: "Analyse",
      items: [
        { href: "/scouting", label: "Scouting", icon: Search },
        { href: "/ia", label: "Predictions", icon: Brain },
        { href: "/rapports", label: "Rapports", icon: FileText },
      ],
    },
    {
      section: "Donnees",
      items: [
        { href: "/import", label: "Import feuilles FMI", icon: Upload },
        { href: "/saisons", label: "Saisons", icon: CalendarRange },
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
