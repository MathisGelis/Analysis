// src/common/acces.ts
//
// Politique d'acces, appliquee par l'API (jamais laissee au front). Fonctions et classe PURES : le service
// d'acces (modules/acces) charge le compte, ses equipes attribuees et les saisons, puis construit un `ContexteAcces`
// sur lequel les controleurs posent leurs questions.
//
// Trois roles :
//   - admin    : tout ;
//   - referent : son club, toutes ses equipes, toutes les saisons ;
//   - user     : son club, les equipes qui lui sont attribuees (aucune = toutes), les saisons qui lui sont ouvertes.
//
// Deux familles de donnees :
//   - les donnees de CHAMPIONNAT (matchs, classements, clubs, joueurs et arbitres adverses...) : lisibles par tous les
//     comptes connectes, pour le scouting, mais jamais au-dela des saisons ouvertes au compte ;
//   - les donnees PRIVEES d'un club (seances, blessures, plans de jeu, effectif saisi...) et les ecritures : limitees
//     au club du compte et, pour un educateur, aux equipes qui lui sont attribuees.
// Les totaux cumules d'un joueur, d'un arbitre ou d'un entraineur (denormalises sur toute sa carriere) ne se decoupent pas
// par saison : ils restent visibles ; tout ce qui est ventile par saison (matchs, classements, parcours) est filtre.

import { anneeDebutPourDate } from "@/common/saison-date";

export interface CompteAcces {
  id: string;
  role: string;
  clubId: string | null;
  /** Equipes attribuees a un educateur ; vide = toutes les equipes de son club. */
  equipeIds: string[];
  toutesSaisons: boolean;
  /** Saisons passees visibles en plus de la saison actuelle (educateur restreint). */
  saisonIds: string[];
}

export interface EquipeAcces {
  id: string;
  clubId: string;
  categorie?: string | null;
  division?: string | null;
  competitionLibelle?: string | null;
  poule?: string | null;
  saisonId?: string | null;
}

export interface SaisonAcces { id: string; anneeDebut: number; actif: boolean }

/** Empreinte stable d'une equipe, independante de la saison : club + categorie + competition + poule. */
export const empreinteEquipe = (e: Pick<EquipeAcces, "clubId" | "categorie" | "competitionLibelle" | "poule">): string =>
  `${e.clubId}|${e.categorie ?? ""}|${e.competitionLibelle ?? ""}|${e.poule ?? ""}`;

/** Niveau d'une equipe : club + categorie + division, sans la poule (qui change d'une saison a l'autre). Null si incomplet. */
export const niveauEquipe = (e: Pick<EquipeAcces, "clubId" | "categorie" | "division">): string | null =>
  e.categorie && e.division ? `${e.clubId}|${e.categorie}|${e.division}` : null;

/** La saison "actuelle" : la plus recente des saisons actives, a defaut la plus recente tout court. */
export function saisonActuelle<S extends SaisonAcces>(saisons: S[]): S | null {
  const parRecence = [...saisons].sort((a, b) => b.anneeDebut - a.anneeDebut);
  return parRecence.find((s) => s.actif) ?? parRecence[0] ?? null;
}

/**
 * Saisons ouvertes au compte : null = toutes. Un educateur restreint voit la saison actuelle, les suivantes (a venir) et
 * les saisons passees cochees par son gestionnaire.
 */
export function saisonsOuvertes(compte: Pick<CompteAcces, "role" | "toutesSaisons" | "saisonIds">, saisons: SaisonAcces[]): Set<string> | null {
  if (compte.role !== "user" || compte.toutesSaisons) return null;
  const actuelle = saisonActuelle(saisons);
  if (!actuelle) return null;
  const cochees = new Set(compte.saisonIds);
  return new Set(saisons.filter((s) => s.anneeDebut >= actuelle.anneeDebut || cochees.has(s.id)).map((s) => s.id));
}

/** Champs reserves au club qui les a saisis ou calcules : jamais montres pour un joueur d'un autre club. */
export const CHAMPS_PRIVES_JOUEUR = [
  "commentaire", "scoreFatigue", "fatigueEntree", "fatigueDetail", "acwr", "chargeAcute7j", "chargeChronic28j",
  "tailleCm", "poidsKg", "piedFort", "blessuresAnt",
] as const;

export class ContexteAcces {
  /** Annee de debut de la saison actuelle et des saisons passees cochees (pour juger une date), null si tout est ouvert. */
  private readonly annees: { actuelle: number; cochees: Set<number> } | null;
  private readonly attribuees: Set<string>;
  private readonly empreintes: Set<string>;
  private readonly niveaux: Set<string>;

  constructor(
    readonly compte: CompteAcces,
    equipesAttribuees: EquipeAcces[],
    saisons: SaisonAcces[],
  ) {
    this.attribuees = new Set(compte.equipeIds);
    this.empreintes = new Set(equipesAttribuees.map(empreinteEquipe));
    this.niveaux = new Set(equipesAttribuees.map(niveauEquipe).filter((n): n is string => !!n));
    const ouvertes = saisonsOuvertes(compte, saisons);
    this.saisonsVisibles = ouvertes;
    const actuelle = saisonActuelle(saisons);
    this.saisonActuelleId = ouvertes && actuelle ? actuelle.id : null;
    this.annees = ouvertes && actuelle
      ? { actuelle: actuelle.anneeDebut, cochees: new Set(saisons.filter((s) => compte.saisonIds.includes(s.id)).map((s) => s.anneeDebut)) }
      : null;
  }

  /** Identifiants des saisons ouvertes, null = toutes. */
  readonly saisonsVisibles: Set<string> | null;
  /** La saison actuelle, pour un compte aux saisons restreintes (null sinon) : la portee par defaut d'une analyse. */
  readonly saisonActuelleId: string | null;

  get admin(): boolean { return this.compte.role === "admin"; }
  get referent(): boolean { return this.compte.role === "referent"; }
  get clubId(): string | null { return this.compte.clubId; }
  /** Les saisons sont-elles restreintes pour ce compte ? */
  get saisonsRestreintes(): boolean { return this.saisonsVisibles !== null; }

  /** La saison est-elle ouverte ? Une donnee sans saison est visible : on ne devine pas. */
  voitSaison(saisonId: string | null | undefined): boolean {
    if (!this.saisonsVisibles || !saisonId) return true;
    return this.saisonsVisibles.has(saisonId);
  }

  /** La date ("2026-03-15" ou "15/03/2026") tombe-t-elle dans une saison ouverte ? Une date illisible reste visible. */
  voitDate(date: string | null | undefined): boolean {
    if (!this.annees) return true;
    const annee = anneeDebutPourDate(date);
    if (annee == null) return true;
    return annee >= this.annees.actuelle || this.annees.cochees.has(annee);
  }

  /** Garde les elements dont la saison est ouverte. */
  filtrerSaison<T>(items: T[], saisonDe: (x: T) => string | null | undefined): T[] {
    return this.saisonsVisibles ? items.filter((x) => this.voitSaison(saisonDe(x))) : items;
  }

  /** Le club est-il celui du compte ? (un admin gere tous les clubs) */
  gereClub(clubId: string | null | undefined): boolean {
    return this.admin || (!!clubId && clubId === this.compte.clubId);
  }

  /** Le compte peut-il gerer cette equipe (sa saison est ouverte, c'est une equipe de son club qui lui est attribuee) ? */
  gereEquipe(e: EquipeAcces): boolean {
    if (this.admin) return true;
    if (!this.compte.clubId || e.clubId !== this.compte.clubId) return false;
    if (!this.voitSaison(e.saisonId)) return false;
    if (this.referent) return true;
    // Educateur : aucune equipe attribuee = toutes celles du club ; sinon l'equipe attribuee, ou son equivalent d'une
    // autre saison (meme empreinte, ou meme niveau quand la poule a change).
    if (this.attribuees.size === 0 || this.attribuees.has(e.id)) return true;
    const niveau = niveauEquipe(e);
    return this.empreintes.has(empreinteEquipe(e)) || (!!niveau && this.niveaux.has(niveau));
  }

  /** L'equipe est-elle consultable : equipe adverse (saison ouverte), ou equipe de mon club que je gere ? */
  voitEquipe(e: EquipeAcces): boolean {
    if (this.admin) return true;
    if (!this.voitSaison(e.saisonId)) return false;
    if (e.clubId === this.compte.clubId) return this.gereEquipe(e);
    return true;
  }

  /** Retire d'un joueur d'un autre club ce qui est prive ; le joueur de mon club (et tout pour un admin) reste complet. */
  masquerPrive<T extends { clubId?: string | null }>(joueur: T): T {
    if (this.gereClub(joueur.clubId)) return joueur;
    const copie: Record<string, unknown> = { ...joueur };
    for (const champ of CHAMPS_PRIVES_JOUEUR) if (champ in copie) copie[champ] = null;
    return copie as T;
  }
}
