// src/features/shell/lib/navigation.ts
//
// Plan de navigation de l'application, partage par la barre laterale et la barre
// du haut (titre de la page). Il ne sert qu'a naviguer entre les pages : la barre
// de recherche, elle, ne cherche que des fiches (joueurs, clubs, arbitres...).
// Fonctions pures.

import {
  Award, Brain, Calendar, CalendarRange, ClipboardList, Dumbbell, FileText, HeartPulse, Layout,
  LayoutDashboard, Shield, ShieldCheck, Trophy, Upload, UserCog, Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { type ContexteAccesPages, pageAccessible } from "./acces-pages";

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

/**
 * La navigation du compte : les pages fermees (saison passee, reserve a l'administrateur : voir acces-pages.ts) sont
 * masquees, et une section sans entree disparait. Sans contexte, tout est montre.
 */
export function construireNavigation(ownClubId: string | null, acces?: ContexteAccesPages): SectionNav[] {
  const sections: SectionNav[] = [
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
        { href: "/medical", label: "Medical", icon: HeartPulse },
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
      // Un seul point d'entree : le rapport pre-match (avec ses predictions), l'analyse d'equipe et le scouting de chaque
      // club s'ouvrent depuis /rapports.
      section: "Analyse",
      items: [{ href: "/rapports", label: "Rapports", icon: FileText }],
    },
    {
      section: "Donnees",
      items: [
        { href: "/import", label: "Import feuilles FMI", icon: Upload },
        // Les deux dernieres sont reservees a l'administrateur : elles disparaissent du menu des autres comptes.
        { href: "/saisons", label: "Saisons", icon: CalendarRange },
        { href: "/admin/ia", label: "IA", icon: Brain },
      ],
    },
  ];
  if (!acces) return sections;
  return sections
    .map((s) => ({ ...s, items: s.items.filter((it) => pageAccessible(it.href, acces)) }))
    .filter((s) => s.items.length > 0);
}

/** Le lien est-il "actif" pour ce chemin ? Le dashboard ne l'est que sur "/". */
export function lienActif(href: string, chemin: string): boolean {
  if (href === "/") return chemin === "/";
  return chemin === href || chemin.startsWith(`${href}/`);
}

const TITRES: [string, string][] = [
  ["/classement", "Classement"], ["/calendrier", "Calendrier"], ["/club", "Fiche club"],
  ["/effectif", "Effectif"], ["/entrainements", "Entrainements"], ["/medical", "Medical"],
  ["/matchs", "Matchs"], ["/tactique", "Tactique"], ["/arbitres", "Arbitres"],
  ["/rapports", "Rapports"], ["/import", "Import FMI"],
  ["/saisons", "Saisons"], ["/joueur", "Fiche joueur"], ["/coachs", "Fiche entraineur"], ["/admin/ia", "IA"], ["/admin", "Administration"],
  ["/analytics", "Analytics"],
];

/** Titre affiche dans la barre du haut pour un chemin. */
export function titrePage(chemin: string): string {
  if (chemin === "/") return "Dashboard";
  return TITRES.find(([prefixe]) => chemin === prefixe || chemin.startsWith(`${prefixe}/`))?.[1] ?? "Foot Analytics";
}
