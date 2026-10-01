// src/lib/acces-saisons.ts
//
// Formulaire de compte : equipes proposees quand on en attribue (par niveau, sans poule) et saisons de l'historique ouvertes
// a un educateur. Fonctions pures. Le FILTRAGE lui-meme est fait par l'API (voir api/common/acces.ts), jamais ici :
// l'API ne renvoie a un compte que les saisons, les equipes et les donnees qui lui sont ouvertes.
//
// Un educateur a soit l'acces a TOUTES les saisons (comptes anterieurs a ce reglage compris), soit la saison actuelle
// (et les suivantes) plus les saisons passees que son gestionnaire a cochees.

import { empreinteEquipe, niveauEquipe } from "@/lib/empreinte-equipe";
import type { Equipe, Saison } from "@/lib/types";

type SaisonMin = Pick<Saison, "id" | "anneeDebut" | "actif">;
type EquipeMin = Pick<Equipe, "id" | "clubId" | "categorie" | "division" | "competitionLibelle" | "poule" | "nom" | "saisonId">;

/** Ce qu'il faut savoir du compte (jeton decode ou utilisateur en cache). */
export interface PerimetreSaisons {
  role?: string;
  /** Absent ou true : toutes les saisons. */
  toutesSaisons?: boolean | null;
  /** Saisons passees visibles en plus de l'actuelle, quand `toutesSaisons` est faux. */
  saisonIds?: string[] | null;
}

/** La saison "actuelle" : la plus recente des saisons actives, a defaut la plus recente tout court. */
export function saisonActuelle<S extends SaisonMin>(saisons: S[]): S | null {
  const parRecence = [...saisons].sort((a, b) => b.anneeDebut - a.anneeDebut);
  return parRecence.find((s) => s.actif) ?? parRecence[0] ?? null;
}

/** Le compte voit-il toutes les saisons ? (un administrateur et un referent, oui toujours) */
const voitToutesLesSaisons = (user: PerimetreSaisons | null | undefined): boolean =>
  !user || user.role === "admin" || user.role === "referent" || user.toutesSaisons !== false;

/** Les saisons passees (avant l'actuelle), de la plus recente a la plus ancienne : celles qu'on peut ouvrir a un educateur. */
export function saisonsPassees<S extends SaisonMin>(saisons: S[]): S[] {
  const actuelle = saisonActuelle(saisons);
  if (!actuelle) return [];
  return saisons.filter((s) => s.anneeDebut < actuelle.anneeDebut).sort((a, b) => b.anneeDebut - a.anneeDebut);
}

/**
 * Nom d'une equipe sans sa poule : "Seniors D2" (categorie + division), ou son nom prive d'un "Poule X" final quand la
 * categorie ou la division manque. La poule change d'une saison a l'autre ; l'equipe, non.
 */
export function libelleNiveau(e: Pick<Equipe, "categorie" | "division" | "nom">): string {
  if (e.categorie && e.division) return `${e.categorie} ${e.division}`;
  return e.nom.replace(/\s*[-·]?\s*poule\s+\S+\s*$/i, "").trim() || e.nom;
}

/** Une equipe a attribuer : un niveau de la saison actuelle (plusieurs poules d'un meme niveau n'en font qu'un). */
export interface NiveauAttribuable { cle: string; libelle: string; ids: string[] }

const cleNiveau = (e: EquipeMin) => niveauEquipe(e) ?? empreinteEquipe(e);

/** Les equipes du club sur la saison donnee, regroupees par niveau, triees par libelle. */
export function niveauxAttribuables(equipes: EquipeMin[], clubId: string, saisonId: string | null): NiveauAttribuable[] {
  const groupes = new Map<string, NiveauAttribuable>();
  for (const e of equipes) {
    if (e.clubId !== clubId || !saisonId || e.saisonId !== saisonId) continue;
    const cle = cleNiveau(e);
    const g = groupes.get(cle) ?? { cle, libelle: libelleNiveau(e), ids: [] };
    g.ids.push(e.id);
    groupes.set(cle, g);
  }
  return [...groupes.values()].sort((a, b) => a.libelle.localeCompare(b.libelle, "fr"));
}

/**
 * Les niveaux coches pour un compte : un niveau l'est quand une equipe attribuee au compte (de n'importe quelle saison)
 * en est l'equivalent, par son identifiant, son empreinte ou son niveau. C'est la regle qui donne l'acces au compte
 * d'une saison a l'autre : le formulaire montre donc ce que le compte voit vraiment.
 */
export function niveauxCoches(niveaux: NiveauAttribuable[], equipes: EquipeMin[], equipeIdsDuCompte: string[]): Set<string> {
  const ids = new Set(equipeIdsDuCompte);
  const attribuees = equipes.filter((e) => ids.has(e.id));
  const cles = new Set(attribuees.flatMap((e) => [cleNiveau(e), empreinteEquipe(e)]));
  const coches = new Set<string>();
  for (const n of niveaux) {
    const equipesDuNiveau = equipes.filter((e) => n.ids.includes(e.id));
    if (n.ids.some((id) => ids.has(id)) || cles.has(n.cle) || equipesDuNiveau.some((e) => cles.has(empreinteEquipe(e)))) coches.add(n.cle);
  }
  return coches;
}

/** Les ids d'equipes a enregistrer pour les niveaux coches (equipes de la saison actuelle). */
export const idsDesNiveaux = (niveaux: NiveauAttribuable[], coches: Set<string>): string[] =>
  niveaux.filter((n) => coches.has(n.cle)).flatMap((n) => n.ids);

export type ModeSaisons = "courante" | "choix" | "toutes";

/** Le mode a montrer pour un compte : comptes anterieurs et saisons toutes cochees compris. */
export function modeSaisons(user: PerimetreSaisons | null | undefined): ModeSaisons {
  if (voitToutesLesSaisons(user)) return "toutes";
  return (user?.saisonIds ?? []).length > 0 ? "choix" : "courante";
}

/** Resume court des saisons d'un compte, pour la liste : "Saison actuelle", "Toutes les saisons", "Actuelle + 2025-2026 · 2024-2025". */
export function resumeSaisons(user: PerimetreSaisons, saisons: Pick<Saison, "id" | "nom" | "anneeDebut">[]): string {
  if (user.role === "admin" || user.role === "referent" || user.toutesSaisons !== false) return "Toutes les saisons";
  const cochees = (user.saisonIds ?? [])
    .map((id) => saisons.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .sort((a, b) => b.anneeDebut - a.anneeDebut);
  return cochees.length === 0 ? "Saison actuelle" : `Actuelle + ${cochees.map((s) => s.nom).join(" · ")}`;
}
