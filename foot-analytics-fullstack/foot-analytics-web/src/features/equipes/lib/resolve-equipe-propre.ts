// src/features/equipes/lib/resolve-equipe-propre.ts
//
// Resolution CENTRALISEE de "mon equipe" pour les Server Components
// (classement, matchs, arbitres, medical...). Cote serveur uniquement : lit
// les cookies via own-equipe.ts / own-club.ts.
//
// Regles, par ordre de priorite :
//  1. Cookie ownEquipeId qui designe une equipe de la saison ownSaisonId
//     (ou de n'importe quelle saison si aucun cookie de saison) -> on la prend.
//  2. Cookie ownEquipeId sur une AUTRE saison (bascule recente dans le
//     switcher) -> on cherche l'equivalent sur ownSaisonId (cf. equipeEquivalente).
//  3. Repli : l'equipe de mon club la plus active (nombre de matchs) sur
//     ownSaisonId, sinon la saison active, sinon la premiere saison.
//
// Les fonctions pures (equipeDepuisCookie, equipeParDefaut, resoudreSaison)
// sont exportees separement pour etre testees sans Next.

import { api } from "@/shared/lib/api";
import type { Equipe, Match, Saison } from "@/shared/lib/types";

import { getOwnClubIdServer } from "./own-club";
import { getOwnEquipeIdServer, getOwnSaisonIdServer } from "./own-equipe";
import { equipeEquivalente, memeChampionnat } from "./empreinte-equipe";

export interface Championnat {
  saisonId: string | null;
  competitionLibelle: string | null;
  poule: string | null;
}

export interface EquipePropre {
  equipe: Equipe | null;
  saison: Saison | null;
  championnat: Championnat | null;
  /** Ids de toutes les equipes du meme championnat (dont la mienne). */
  equipesDuChampionnat: Set<string>;
}

/** Donnees deja chargees par la page : evite de les re-telecharger. */
export interface DonneesResolution {
  equipes?: Equipe[];
  saisons?: Saison[];
  matchs?: Match[];
}

/* ------------------------------ Fonctions pures --------------------------- */

/** Etapes 1 et 2 : equipe designee par le cookie, ramenee a la saison choisie. */
export function equipeDepuisCookie(
  equipes: Equipe[],
  cookieEquipeId: string | null,
  cookieSaisonId: string | null,
): Equipe | null {
  const eq = cookieEquipeId ? equipes.find((e) => e.id === cookieEquipeId) ?? null : null;
  if (!eq) return null;
  if (!cookieSaisonId || eq.saisonId === cookieSaisonId) return eq;
  return equipes.find((e) =>
    e.saisonId === cookieSaisonId && equipeEquivalente(e, eq),
  ) ?? null;
}

/** Saison visee : cookie > saison de l'equipe > saison active > premiere. */
export function resoudreSaison(
  saisons: Saison[],
  cookieSaisonId: string | null,
  equipe: Pick<Equipe, "saisonId"> | null = null,
): Saison | null {
  return (cookieSaisonId ? saisons.find((s) => s.id === cookieSaisonId) : null)
    ?? (equipe?.saisonId ? saisons.find((s) => s.id === equipe.saisonId) : null)
    ?? saisons.find((s) => s.actif)
    ?? saisons[0]
    ?? null;
}

/** Etape 3 : equipe de mon club la plus active sur la saison cible. */
export function equipeParDefaut(
  equipes: Equipe[],
  matchs: Pick<Match, "equipeDomId" | "equipeExtId">[],
  clubId: string,
  saisonCibleId: string | null,
): Equipe | null {
  const candidates = equipes.filter((e) =>
    e.clubId === clubId && (!saisonCibleId || e.saisonId === saisonCibleId));
  if (candidates.length === 0) return null;

  const activite = new Map<string, number>();
  for (const m of matchs) {
    if (m.equipeDomId) activite.set(m.equipeDomId, (activite.get(m.equipeDomId) ?? 0) + 1);
    if (m.equipeExtId) activite.set(m.equipeExtId, (activite.get(m.equipeExtId) ?? 0) + 1);
  }
  // Tri stable : a activite egale, l'ordre d'origine est conserve.
  return [...candidates].sort(
    (a, b) => (activite.get(b.id) ?? 0) - (activite.get(a.id) ?? 0),
  )[0];
}

/** Championnat d'une equipe + ids de toutes les equipes qui y jouent. */
export function championnatDe(
  equipe: Equipe | null,
  equipes: Equipe[],
): { championnat: Championnat | null; equipesDuChampionnat: Set<string> } {
  if (!equipe) return { championnat: null, equipesDuChampionnat: new Set() };
  return {
    championnat: {
      saisonId: equipe.saisonId ?? null,
      competitionLibelle: equipe.competitionLibelle ?? null,
      poule: equipe.poule ?? null,
    },
    equipesDuChampionnat: new Set(
      equipes.filter((e) => memeChampionnat(e, equipe)).map((e) => e.id),
    ),
  };
}

/* ------------------------------ Point d'entree ---------------------------- */

export async function resolveEquipePropre(
  donnees: DonneesResolution = {},
): Promise<EquipePropre> {
  const [cookieEquipeId, cookieSaisonId, clubId] = await Promise.all([
    getOwnEquipeIdServer(), getOwnSaisonIdServer(), getOwnClubIdServer(),
  ]);

  const [equipes, saisons] = await Promise.all([
    donnees.equipes ?? (api.equipes() as Promise<Equipe[]>),
    donnees.saisons ?? (api.saisons() as Promise<Saison[]>),
  ]);

  let equipe = equipeDepuisCookie(equipes, cookieEquipeId, cookieSaisonId);
  if (!equipe) {
    // Les matchs ne servent qu'a departager les equipes : on ne les charge
    // que si la page ne les a pas deja.
    const matchs = donnees.matchs ?? await api.matchs();
    const saisonCible = cookieSaisonId
      ?? saisons.find((s) => s.actif)?.id
      ?? saisons[0]?.id
      ?? null;
    equipe = equipeParDefaut(equipes, matchs, clubId, saisonCible);
  }

  const saison = resoudreSaison(saisons, cookieSaisonId, equipe);
  return { equipe, saison, ...championnatDe(equipe, equipes) };
}
