// src/features/apres-match/observations-adversaire.ts
//
// Ce que le staff observe de l'ADVERSAIRE pendant un match, rempli apres le match avec de petits selecteurs : dispositif, joueurs
// marquants, points forts et faibles, sorties de balle, gardien, transitions, structures, pressing, couloirs, coups de pied arretes.
// Le catalogue ci-dessous decrit les sections et leurs choix : le serveur le fournit a l'ecran (qui l'affiche tel quel) et valide
// chaque saisie contre lui. Fonctions pures.

import { BadRequestException } from "@nestjs/common";

export type TypeChamp = "choix" | "multi" | "note" | "texte" | "joueurs";

export interface ChampObservation { id: string; libelle: string; type: TypeChamp; options?: readonly string[] }
export interface SectionObservation { id: string; titre: string; aide?: string; champs: readonly ChampObservation[] }

export const MAX_JOUEURS = 3;
export const MAX_TEXTE = 300;

const FORMATIONS = ["4-4-2", "4-4-2 losange", "4-3-3", "4-2-3-1", "4-1-4-1", "4-4-1-1", "3-5-2", "3-4-3", "5-3-2", "5-4-1", "Autre"] as const;
const choix = (id: string, libelle: string, options: readonly string[]): ChampObservation => ({ id, libelle, type: "choix", options });
const multi = (id: string, libelle: string, options: readonly string[]): ChampObservation => ({ id, libelle, type: "multi", options });
const note = (id: string, libelle: string): ChampObservation => ({ id, libelle, type: "note" });
const texte = (id = "remarque", libelle = "Remarque"): ChampObservation => ({ id, libelle, type: "texte" });
const joueurs = (id: string, libelle: string): ChampObservation => ({ id, libelle, type: "joueurs" });

const COULOIRS = ["Gauche", "Axe gauche", "Centre", "Axe droit", "Droit"] as const;

export const CATALOGUE: readonly SectionObservation[] = [
  { id: "dispositif", titre: "Dispositif", champs: [
    choix("en_possession", "Avec le ballon", FORMATIONS), choix("sans_ballon", "Sans le ballon", FORMATIONS), texte(),
  ] },
  { id: "meilleurs_joueurs", titre: "Meilleurs joueurs", aide: "Par numéro de maillot", champs: [joueurs("joueurs", "Joueurs marquants")] },
  { id: "joueurs_faibles", titre: "Joueurs faibles", aide: "Par numéro de maillot", champs: [joueurs("joueurs", "Joueurs à cibler")] },
  { id: "points_forts", titre: "Points forts", champs: [
    multi("atouts", "Ce qu'ils font bien", ["Jeu aérien", "Vitesse", "Jeu long", "Jeu court", "Percussion", "Combinaisons", "Pressing", "Solidarité défensive", "Coups de pied arrêtés", "Combativité", "Profondeur", "Jeu dans les couloirs"]), texte(),
  ] },
  { id: "points_faibles", titre: "Points faibles", champs: [
    multi("faiblesses", "Ce qui leur pose problème", ["Jeu aérien", "Lenteur défensive", "Transition défensive", "Dos de la défense", "Pertes de balle", "Pressing contournable", "Coups de pied arrêtés", "Concentration", "Fin de match", "Jeu sans ballon", "Largeur défensive"]), texte(),
  ] },
  { id: "sorties_de_balle", titre: "Sorties de balle", champs: [
    multi("moyens", "Comment ils sortent le ballon", ["Passe courte au défenseur", "Relance courte du gardien", "Jeu long direct", "Par un côté", "Par l'axe", "Par le milieu relayeur", "Dégagement sous pression"]),
    note("efficacite", "Efficacité"), texte(),
  ] },
  { id: "gardien", titre: "Gardien", champs: [
    multi("relances", "Relances", ["À la main", "Au pied court", "Au pied long", "Jeu long côté", "Précipitées", "Précises"]),
    choix("sorties_aeriennes", "Sorties aériennes", ["Solides", "Correctes", "Hésitantes", "Reste sur sa ligne"]),
    choix("un_contre_un", "1 contre 1", ["Très bon", "Correct", "Faible", "Sort tôt", "Sort tard"]), texte(),
  ] },
  { id: "transitions", titre: "Transitions", champs: [
    multi("off_def", "Offensive vers défensive (perte du ballon)", ["Repli rapide", "Contre-pressing", "Repli lent", "Faute tactique", "Bloc qui se resserre", "Espaces dans le dos"]),
    multi("def_off", "Défensive vers offensive (récupération)", ["Contre rapide", "Première passe vers l'avant", "Jeu long", "Ballon dans l'axe", "Ballon sur le côté", "Ralentit le jeu"]), texte(),
  ] },
  { id: "structure_off", titre: "Structure offensive", champs: [
    multi("organisation", "Organisation avec le ballon", ["Largeur maximale", "Équipe compacte", "Attaquant de pivot", "Latéraux hauts", "Milieu en triangle", "Demi-espaces occupés", "Jeu en profondeur", "Beaucoup de permutations"]), note("fluidite", "Fluidité"), texte(),
  ] },
  { id: "structure_def", titre: "Structure défensive", champs: [
    multi("organisation", "Organisation sans le ballon", ["Bloc haut", "Bloc médian", "Bloc bas", "Marquage individuel", "Défense de zone", "Ligne à plat", "Ligne de 5 en bloc bas", "Écarts entre les lignes"]), note("solidite", "Solidité"), texte(),
  ] },
  { id: "pressing", titre: "Pressing", champs: [
    multi("declenchement", "Déclenchement", ["Passe en retrait", "Mauvais contrôle", "Passe latérale", "Touche", "Relance du gardien", "Ballon dos au jeu", "Passe vers le côté"]),
    note("efficacite", "Efficacité"),
    multi("zones", "Zones", ["Haut", "Médian", "Bas", "Côté droit", "Côté gauche", "Axe"]), texte(),
  ] },
  { id: "couloirs", titre: "Couloirs", champs: [
    multi("attaque", "Par où ils attaquent", COULOIRS), multi("dangereux", "Où ils sont dangereux", COULOIRS), multi("fragiles", "Où ils sont fragiles", COULOIRS), texte(),
  ] },
  { id: "cpa_def", titre: "Coups de pied arrêtés défensifs", champs: [
    multi("organisation", "Organisation défensive", ["Zone", "Individuel", "Mixte", "Un homme au poteau", "Ligne haute", "Ligne basse", "Le gardien sort"]), texte(),
  ] },
  { id: "cpa_off", titre: "Coups de pied arrêtés offensifs", champs: [
    multi("schemas", "Ce qu'ils font", ["Corner rentrant", "Corner sortant", "Corner court", "Coup franc direct", "Coup franc indirect", "Touche longue", "Schéma travaillé", "Premier poteau", "Second poteau", "Penalty"]), texte(),
  ] },
];

export const SECTIONS = new Map(CATALOGUE.map((s) => [s.id, s]));

export type ValeurChamp = string | string[] | number | { numero: number; commentaire?: string }[];
export type ValeursSection = Record<string, ValeurChamp>;
export type Observations = Record<string, ValeursSection>;

const refus = (message: string): never => { throw new BadRequestException(message); };

/**
 * Valide et nettoie les valeurs d'UNE section contre le catalogue : champs connus, choix permis, note de 1 a 5, texte court, numeros de maillot
 * de 1 a 99 sans doublon. Un champ vide est retire ; une section vide renvoie un objet vide.
 */
export function validerSection(sectionId: string, brut: unknown): ValeursSection {
  const section = SECTIONS.get(sectionId);
  if (!section) return refus(`Section inconnue : ${sectionId}.`);
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return refus("Les valeurs de la section sont attendues sous forme d'objet.");
  const entree = brut as Record<string, unknown>;
  const champs = new Map(section.champs.map((c) => [c.id, c]));
  for (const cle of Object.keys(entree)) if (!champs.has(cle)) refus(`Champ inconnu dans « ${section.titre} » : ${cle}.`);

  const sortie: ValeursSection = {};
  for (const champ of section.champs) {
    const v = entree[champ.id];
    if (v === undefined || v === null || v === "") continue;
    switch (champ.type) {
      case "choix":
        if (typeof v !== "string" || !champ.options!.includes(v)) refus(`Choix invalide pour « ${champ.libelle} ».`);
        sortie[champ.id] = v as string;
        break;
      case "multi": {
        if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || !champ.options!.includes(x))) refus(`Choix invalide pour « ${champ.libelle} ».`);
        const liste = [...new Set(v as string[])];
        if (liste.length > 0) sortie[champ.id] = liste;
        break;
      }
      case "note":
        if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 5) refus(`« ${champ.libelle} » : une note de 1 à 5.`);
        sortie[champ.id] = v as number;
        break;
      case "texte": {
        if (typeof v !== "string") return refus(`« ${champ.libelle} » : du texte est attendu.`);
        const t = v.trim();
        if (t.length > MAX_TEXTE) refus(`« ${champ.libelle} » : ${MAX_TEXTE} caractères au plus.`);
        if (t) sortie[champ.id] = t;
        break;
      }
      case "joueurs": {
        if (!Array.isArray(v) || v.length > MAX_JOUEURS) return refus(`« ${champ.libelle} » : ${MAX_JOUEURS} joueurs au plus.`);
        const vus = new Set<number>();
        const liste = (v as unknown[]).map((j) => {
          const o = j as { numero?: unknown; commentaire?: unknown };
          if (!o || typeof o.numero !== "number" || !Number.isInteger(o.numero) || o.numero < 1 || o.numero > 99) return refus("Numéro de maillot : un entier de 1 à 99.");
          if (vus.has(o.numero as number)) refus(`Le numéro ${o.numero} est déjà dans la liste.`);
          vus.add(o.numero as number);
          const c = typeof o.commentaire === "string" ? o.commentaire.trim() : "";
          if (c.length > MAX_TEXTE) refus(`Commentaire : ${MAX_TEXTE} caractères au plus.`);
          return { numero: o.numero as number, ...(c ? { commentaire: c } : {}) };
        });
        if (liste.length > 0) sortie[champ.id] = liste;
        break;
      }
    }
  }
  return sortie;
}

/** Nombre de sections qui contiennent au moins une observation. */
export const sectionsRemplies = (obs: Observations): number => Object.values(obs).filter((v) => Object.keys(v).length > 0).length;

/* ---------------------------------- Plusieurs matchs contre le meme adversaire ---------------------------------- */

export interface ObservationDatee { matchId: string; date: string | null; valeurs: Observations }

export interface ChampAgrege {
  id: string; libelle: string; type: TypeChamp;
  /** choix et multi : chaque valeur avec le nombre de matchs ou elle a ete observee, de la plus frequente a la moins frequente. */
  valeurs?: { valeur: string; matchs: number }[];
  /** note : moyenne sur les matchs notes. */
  moyenne?: number;
  /** texte : les remarques, de la plus recente a la plus ancienne. */
  textes?: { texte: string; date: string | null }[];
  /** joueurs : chaque numero avec le nombre de matchs ou il est cite et son dernier commentaire. */
  joueurs?: { numero: number; matchs: number; commentaire?: string }[];
}
export interface SectionAgregee { id: string; titre: string; champs: ChampAgrege[] }
export interface SyntheseObservations { matchs: number; derniere: string | null; sections: SectionAgregee[] }

/** Les observations de tous les matchs contre un adversaire, du plus recent au plus ancien, reunies par section (que ce qui est renseigne). */
export function synthetiser(observations: ObservationDatee[]): SyntheseObservations {
  const triees = [...observations].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const sections: SectionAgregee[] = [];
  for (const section of CATALOGUE) {
    const champs: ChampAgrege[] = [];
    for (const champ of section.champs) {
      const base = { id: champ.id, libelle: champ.libelle, type: champ.type };
      const valeurs = triees.map((o) => ({ o, v: o.valeurs[section.id]?.[champ.id] })).filter((x) => x.v !== undefined);
      if (valeurs.length === 0) continue;
      if (champ.type === "choix" || champ.type === "multi") {
        const compte = new Map<string, number>();
        for (const { v } of valeurs) for (const x of Array.isArray(v) ? (v as string[]) : [v as string]) compte.set(x, (compte.get(x) ?? 0) + 1);
        champs.push({ ...base, valeurs: [...compte].map(([valeur, matchs]) => ({ valeur, matchs })).sort((a, b) => b.matchs - a.matchs || a.valeur.localeCompare(b.valeur)) });
      } else if (champ.type === "note") {
        const notes = valeurs.map((x) => x.v as number);
        champs.push({ ...base, moyenne: Math.round((notes.reduce((s, n) => s + n, 0) / notes.length) * 10) / 10 });
      } else if (champ.type === "texte") {
        champs.push({ ...base, textes: valeurs.map(({ o, v }) => ({ texte: v as string, date: o.date })) });
      } else {
        const par = new Map<number, { matchs: number; commentaire?: string }>();
        for (const { v } of valeurs) for (const j of v as { numero: number; commentaire?: string }[]) {
          const cur = par.get(j.numero) ?? { matchs: 0 };
          cur.matchs++;
          if (!cur.commentaire && j.commentaire) cur.commentaire = j.commentaire;       // le plus recent, car la liste est du plus recent au plus ancien
          par.set(j.numero, cur);
        }
        champs.push({ ...base, joueurs: [...par].map(([numero, x]) => ({ numero, ...x })).sort((a, b) => b.matchs - a.matchs || a.numero - b.numero) });
      }
    }
    if (champs.length > 0) sections.push({ id: section.id, titre: section.titre, champs });
  }
  return { matchs: triees.filter((o) => Object.values(o.valeurs).some((s) => Object.keys(s).length > 0)).length, derniere: triees[0]?.date ?? null, sections };
}
