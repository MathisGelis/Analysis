// src/features/shell/lib/garde-page.ts
//
// Cote serveur : la page demandee est-elle fermee a ce compte, sur cette saison ? La meme regle que la navigation
// (acces-pages.ts), appliquee a l'URL elle-meme : masquer un lien ne suffit pas, on peut taper l'adresse.

import { getCurrentUserServer } from "@/features/auth/lib/auth";
import { getOwnSaisonIdServer } from "@/features/equipes/lib/own-equipe";
import { modeSaison } from "@/features/saisons/lib/saison-mode";
import { api } from "@/shared/lib/api";
import type { Saison } from "@/shared/lib/types";

import { restrictionDe, type RestrictionPage } from "./acces-pages";

export interface VerdictPage {
  restriction: RestrictionPage | null;
  saisonChoisie: Saison | null;
  saisonActive: Saison | null;
}

/** `chemin` : celui de la page (ex. "/tactique", "/rapports/prematch/club-1"). */
export async function verdictPage(chemin: string): Promise<VerdictPage> {
  const [utilisateur, saisons, saisonId] = await Promise.all([getCurrentUserServer(), api.saisons(), getOwnSaisonIdServer()]);
  const saisonActive = saisons.find((s: Saison) => s.actif) ?? null;
  const saisonChoisie = saisons.find((s: Saison) => s.id === saisonId) ?? null;
  const restriction = restrictionDe(chemin, { role: utilisateur?.role ?? null, mode: modeSaison(saisonChoisie, saisonActive) });
  return { restriction, saisonChoisie, saisonActive };
}
