// src/features/recherche-joueurs/lib/recherche-joueurs.ts
//
// Recherche avancee de joueurs (page /recherche) : le formulaire, sa traduction en criteres pour l'API
// (POST /joueurs/recherche-avancee), les listes proposees (categories et divisions de la saison choisie), le resume
// lisible des criteres et l'etat dans l'URL (identifiants et codes seulement : jamais un nom). Fonctions pures.

import type { OptionSelect } from "@/shared/lib/selecteur";

export type StatutSituation = "sans_club" | "meme_club" | "autre_club";
export type SituationVoulue = StatutSituation | "indifferent";

export interface OptionsRecherche {
  saisons: { id: string; nom: string; anneeDebut: number; actuelle: boolean }[];
  niveaux: { saisonId: string; categorie: string; division: string | null }[];
  defauts: { saisonId: string | null; situationSaisonId: string | null };
}

export interface EquipeResultat { id: string; nom: string; categorie: string | null; division: string | null; clubId: string }

export interface ResultatRecherche {
  joueurId: string;
  nom: string;
  prenom: string | null;
  poste: string | null;
  posteDeduit: boolean;
  periode: { clubId: string; equipes: EquipeResultat[]; matchs: number; titularisations: number; minutes: number; buts: number };
  situation: { statut: StatutSituation; clubId: string | null; equipe: EquipeResultat | null } | null;
}

export interface ReponseRecherche { total: number; resultats: ResultatRecherche[] }

/** Le formulaire, tel que saisi (chaines : "" = indifferent). */
export interface FormulaireRecherche {
  poste: string;
  saisonId: string;
  categorie: string;
  division: string;
  clubId: string;
  minMatchs: string;
  situationSaisonId: string;
  situation: SituationVoulue;
}

/** Ce que l'API recoit. */
export interface CriteresApi {
  saisonId: string;
  categorie?: string;
  division?: string;
  clubId?: string;
  postes?: string[];
  minMatchs?: number;
  situationSaisonId?: string;
  situation?: SituationVoulue;
}

/** Choix de poste : une ligne entiere ou un poste precis (vocabulaire des fiches). */
export const CHOIX_POSTES: { valeur: string; libelle: string; groupe?: string; postes: string[] }[] = [
  { valeur: "", libelle: "Tous les postes", postes: [] },
  { valeur: "GB", libelle: "Gardiens", groupe: "Lignes", postes: ["GB"] },
  { valeur: "DEF", libelle: "Defenseurs", groupe: "Lignes", postes: ["DD", "DG", "DC"] },
  { valeur: "MIL", libelle: "Milieux", groupe: "Lignes", postes: ["MD", "MC", "MO", "MIL"] },
  { valeur: "ATT", libelle: "Attaquants", groupe: "Lignes", postes: ["AG", "AD", "AT"] },
  { valeur: "DC", libelle: "Defenseur central", groupe: "Postes", postes: ["DC"] },
  { valeur: "DD", libelle: "Lateral droit", groupe: "Postes", postes: ["DD"] },
  { valeur: "DG", libelle: "Lateral gauche", groupe: "Postes", postes: ["DG"] },
  { valeur: "MD", libelle: "Milieu defensif", groupe: "Postes", postes: ["MD"] },
  { valeur: "MC", libelle: "Milieu central", groupe: "Postes", postes: ["MC"] },
  { valeur: "MO", libelle: "Milieu offensif", groupe: "Postes", postes: ["MO"] },
  { valeur: "AG", libelle: "Ailier gauche", groupe: "Postes", postes: ["AG"] },
  { valeur: "AD", libelle: "Ailier droit", groupe: "Postes", postes: ["AD"] },
  { valeur: "AT", libelle: "Avant-centre", groupe: "Postes", postes: ["AT"] },
];

export const OPTIONS_POSTE: OptionSelect[] = CHOIX_POSTES.map(({ valeur, libelle, groupe }) => ({ valeur, libelle, groupe }));

export const OPTIONS_SITUATION: OptionSelect[] = [
  { valeur: "indifferent", libelle: "Indifferent" },
  { valeur: "sans_club", libelle: "Sans club connu" },
  { valeur: "meme_club", libelle: "Toujours dans le meme club" },
  { valeur: "autre_club", libelle: "Dans un autre club" },
];

export const OPTIONS_MATCHS_MIN: OptionSelect[] = ["1", "3", "5", "10", "15"].map((n) => ({
  valeur: n, libelle: n === "1" ? "Au moins 1 match" : `Au moins ${n} matchs`,
}));

const LIBELLE_STATUT: Record<StatutSituation, string> = {
  sans_club: "Sans club connu", meme_club: "Meme club", autre_club: "Autre club",
};
export const libelleStatut = (s: StatutSituation): string => LIBELLE_STATUT[s];

const egal = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").toLowerCase().replace(/\s+/g, "") === (b ?? "").toLowerCase().replace(/\s+/g, "");

/** Categories de la saison choisie (ordre alphabetique, sans doublon). */
export function categoriesDe(options: OptionsRecherche | null, saisonId: string): string[] {
  const vues = new Map<string, string>();
  for (const n of options?.niveaux ?? []) {
    if (n.saisonId === saisonId && !vues.has(n.categorie.toLowerCase())) vues.set(n.categorie.toLowerCase(), n.categorie);
  }
  return [...vues.values()].sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
}

/** Divisions de la saison choisie, pour la categorie choisie (toutes les categories si aucune). */
export function divisionsDe(options: OptionsRecherche | null, saisonId: string, categorie: string): string[] {
  const vues = new Map<string, string>();
  for (const n of options?.niveaux ?? []) {
    if (n.saisonId !== saisonId || !n.division || (categorie && !egal(n.categorie, categorie))) continue;
    if (!vues.has(n.division.toLowerCase())) vues.set(n.division.toLowerCase(), n.division);
  }
  return [...vues.values()].sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
}

/** Formulaire de depart : la saison precedente (a joue) et l'actuelle (situation), comme le propose l'API. */
export function formulaireInitial(options: OptionsRecherche | null): FormulaireRecherche {
  return {
    poste: "", categorie: "", division: "", clubId: "", minMatchs: "1", situation: "indifferent",
    saisonId: options?.defauts.saisonId ?? options?.saisons[0]?.id ?? "",
    situationSaisonId: options?.defauts.situationSaisonId ?? "",
  };
}

/**
 * Une saison changee : la categorie et la division restent si la nouvelle saison les connait, sinon elles sont
 * effacees (une categorie absente ne donnerait aucun resultat sans qu'on comprenne pourquoi).
 */
export function changerSaison(f: FormulaireRecherche, saisonId: string, options: OptionsRecherche | null): FormulaireRecherche {
  const categorie = categoriesDe(options, saisonId).find((c) => egal(c, f.categorie)) ?? "";
  const division = divisionsDe(options, saisonId, categorie).find((d) => egal(d, f.division)) ?? "";
  return { ...f, saisonId, categorie, division };
}

/** Le formulaire traduit pour l'API ; null tant qu'aucune saison n'est choisie. */
export function versCriteres(f: FormulaireRecherche): CriteresApi | null {
  if (!f.saisonId) return null;
  const postes = CHOIX_POSTES.find((p) => p.valeur === f.poste)?.postes ?? [];
  const minMatchs = Number.parseInt(f.minMatchs, 10);
  return {
    saisonId: f.saisonId,
    ...(f.categorie ? { categorie: f.categorie } : {}),
    ...(f.division ? { division: f.division } : {}),
    ...(f.clubId ? { clubId: f.clubId } : {}),
    ...(postes.length ? { postes } : {}),
    ...(Number.isFinite(minMatchs) && minMatchs > 1 ? { minMatchs } : {}),
    ...(f.situationSaisonId ? { situationSaisonId: f.situationSaisonId, situation: f.situation } : {}),
  };
}

/** « Attaquants · U16 R2 · 2025-2026 · Sans club connu en 2026-2027 ». */
export function resumeCriteres(
  f: FormulaireRecherche, options: OptionsRecherche | null, nomClub: (id: string) => string | null = () => null,
): string {
  const saison = (id: string) => options?.saisons.find((s) => s.id === id)?.nom ?? "";
  const morceaux: string[] = [];
  morceaux.push(CHOIX_POSTES.find((p) => p.valeur === f.poste)?.libelle ?? "Tous les postes");
  const niveau = [f.categorie, f.division].filter(Boolean).join(" ");
  if (niveau) morceaux.push(niveau);
  if (f.clubId) morceaux.push(nomClub(f.clubId) ?? "un club");
  morceaux.push(saison(f.saisonId));
  const min = Number.parseInt(f.minMatchs, 10);
  if (Number.isFinite(min) && min > 1) morceaux.push(`${min} matchs ou plus`);
  if (f.situationSaisonId && f.situation !== "indifferent") {
    morceaux.push(`${LIBELLE_STATUT[f.situation]} en ${saison(f.situationSaisonId)}`);
  }
  return morceaux.filter(Boolean).join(" · ");
}

/* ---------------------------- Etat dans l'URL ---------------------------- */

const CLES: [keyof FormulaireRecherche, string][] = [
  ["poste", "poste"], ["saisonId", "saison"], ["categorie", "cat"], ["division", "div"], ["clubId", "club"],
  ["minMatchs", "min"], ["situationSaisonId", "cible"], ["situation", "situation"],
];

/** Le formulaire en parametres d'URL (seules les valeurs renseignees). */
export function versUrl(f: FormulaireRecherche): string {
  const p = new URLSearchParams();
  for (const [champ, cle] of CLES) {
    const v = f[champ];
    if (v && !(champ === "minMatchs" && v === "1") && !(champ === "situation" && v === "indifferent")) p.set(cle, v);
  }
  return p.toString();
}

/** Le formulaire relu de l'URL ; null si l'URL ne porte pas de recherche (pas de saison). */
export function depuisUrl(params: URLSearchParams, options: OptionsRecherche | null): FormulaireRecherche | null {
  const saisonId = params.get("saison");
  if (!saisonId || (options && !options.saisons.some((s) => s.id === saisonId))) return null;
  const lu = (cle: string) => params.get(cle) ?? "";
  const poste = CHOIX_POSTES.some((p) => p.valeur === lu("poste")) ? lu("poste") : "";
  const situation = OPTIONS_SITUATION.some((o) => o.valeur === lu("situation")) ? lu("situation") as SituationVoulue : "indifferent";
  const cible = lu("cible");
  return {
    poste, saisonId, categorie: lu("cat"), division: lu("div"), clubId: lu("club"),
    minMatchs: OPTIONS_MATCHS_MIN.some((o) => o.valeur === lu("min")) ? lu("min") : "1",
    situationSaisonId: !cible || !options || options.saisons.some((s) => s.id === cible) ? cible : "",
    situation,
  };
}

/** Libelle court d'une equipe de la periode : « U16 R2 », a defaut son nom. */
export const libelleEquipe = (e: Pick<EquipeResultat, "nom" | "categorie" | "division">): string =>
  [e.categorie, e.division].filter(Boolean).join(" ") || e.nom;
