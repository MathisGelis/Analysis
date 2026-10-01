// src/features/utilisateurs/droits-comptes.ts
//
// Qui peut gerer quels comptes. Trois roles :
//   - admin   : tous les comptes, de tous les clubs, tous les roles ;
//   - referent: le referent d'un club ; il ne voit et ne gere que les comptes "user" (educateurs) de SON club ;
//   - user    : un educateur, aucun droit de gestion.
// Fonctions pures ; le service les applique et verifie l'existence des equipes.

export const ROLES = ["admin", "referent", "user"] as const;
export type Role = (typeof ROLES)[number];

export interface Acteur { id: string; role: string; clubId: string | null }
export interface CibleCompte { role: string; clubId?: string | null }

export const estRole = (r: unknown): r is Role => typeof r === "string" && (ROLES as readonly string[]).includes(r);

/** Roles qu'un acteur peut donner a un compte qu'il cree ou modifie. */
export function rolesAttribuables(acteur: Acteur): Role[] {
  if (acteur.role === "admin") return [...ROLES];
  if (acteur.role === "referent") return ["user"];
  return [];
}

/** Le compte est-il dans le perimetre de gestion de l'acteur ? Un referent : les educateurs de son club, rien d'autre. */
export function dansPerimetre(acteur: Acteur, cible: CibleCompte): boolean {
  if (acteur.role === "admin") return true;
  if (acteur.role === "referent") return !!acteur.clubId && cible.clubId === acteur.clubId && cible.role === "user";
  return false;
}

/** Un referent et un educateur sont toujours rattaches a un club ; un admin n'en a pas. */
export const roleAvecClub = (role: string): boolean => role === "referent" || role === "user";

/** Equipes que l'acteur n'a pas le droit d'attribuer : celles qui ne sont pas de son club (referent). */
export function equipesHorsPerimetre(acteur: Acteur, equipes: { id: string; clubId: string }[], demandees: string[]): string[] {
  if (acteur.role === "admin") return [];
  const autorisees = new Set(equipes.filter((e) => e.clubId === acteur.clubId).map((e) => e.id));
  return demandees.filter((id) => !autorisees.has(id));
}
