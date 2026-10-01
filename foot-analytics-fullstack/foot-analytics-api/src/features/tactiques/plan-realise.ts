// src/features/tactiques/plan-realise.ts
//
// Plan de jeu CONTRE REALISE : ce que le staff avait prepare (dispositif, onze, banc, capitaine) mis
// en regard de la feuille de match reellement jouee. Fonction pure : les joueurs du plan sont des
// identifiants d'effectif, la feuille ne porte que des noms (et parfois des licences), donc le
// rapprochement se fait par licence puis par nom normalise (ordre nom / prenom indifferent).
//
// Rien n'est devine : une feuille sans composition donne "feuille_vide", un dispositif reel inconnu
// (la FMI n'en contient pas) n'est ni compare ni reproche.

import { normaliser } from "@/common/fuzzy";

export interface JoueurRef { id: string; nom: string; prenom?: string | null; licence?: string | null }

export interface LigneFeuille {
  nom: string;
  prenom?: string | null;
  licence?: string | null;
  titulaire: boolean;
  capitaine?: boolean | null;
  minutes?: number | null;
  /** Remplacant entre en jeu, quand l'appelant le sait (evenements du match). Sinon : minutes > 0. */
  entre?: boolean | null;
}

export interface PlanComparable {
  formation: string;
  /** 11 cases dans l'ordre des postes ; "" = poste vide. */
  titulaires: string[];
  remplacants: string[];
  capitaineId?: string | null;
}

export type RolePrevu = "titulaire" | "remplacant" | null;
/** `entre` : remplacant entre en jeu ; `banc` : sur la feuille mais sans minute ; `absent` : pas sur la feuille. */
export type RoleReel = "titulaire" | "entre" | "banc" | "absent";
export type Ecart =
  | "conforme"     // titulaire prevu qui demarre, ou remplacant prevu (entre ou reste au banc)
  | "promu"        // prevu remplacant, demarre le match
  | "relegue"      // prevu titulaire, sur le banc (entre ou non)
  | "absent"       // prevu (titulaire ou remplacant), absent de la feuille
  | "surprise"     // non prevu, titulaire
  | "non_prevu";   // non prevu, entre en jeu

export interface LigneComparaison {
  joueurId: string | null;
  nom: string;
  prevu: RolePrevu;
  reel: RoleReel;
  minutes: number | null;
  ecart: Ecart;
}

export interface Observation {
  ton: "atout" | "vigilance" | "info";
  importance: 1 | 2 | 3;
  titre: string;
  detail: string;
}

export interface ComparaisonPlanRealise {
  /** `feuille_vide` : aucune composition sur la feuille, donc rien a comparer. */
  etat: "ok" | "feuille_vide";
  formation: { prevue: string; reelle: string | null; identique: boolean | null };
  capitaine: { prevu: string | null; reel: string | null; identique: boolean | null };
  titulairesPrevus: number;
  titulairesConformes: number;
  /** Part des titulaires prevus qui ont demarre, en % ; null sans titulaire prevu ou sans feuille. */
  adequation: number | null;
  lignes: LigneComparaison[];
  observations: Observation[];
}

const libelle = (nom: string, prenom?: string | null) => [prenom, nom].filter(Boolean).join(" ").trim();
/** Cle de rapprochement : mots du nom complet, sans accent ni casse, tries (ordre nom / prenom indifferent). */
const cleNom = (nom: string, prenom?: string | null) =>
  normaliser(`${nom} ${prenom ?? ""}`).split(" ").filter(Boolean).sort().join(" ");
const cleLicence = (l?: string | null) => (l ?? "").replace(/\s+/g, "");

export function comparerPlanRealise(e: {
  plan: PlanComparable;
  joueurs: JoueurRef[];
  feuille: LigneFeuille[];
  formationReelle?: string | null;
}): ComparaisonPlanRealise {
  const { plan, feuille } = e;
  const parId = new Map(e.joueurs.map((j) => [j.id, j]));
  const formationReelle = e.formationReelle?.trim() || null;
  const formation = {
    prevue: plan.formation,
    reelle: formationReelle,
    identique: formationReelle ? formationReelle === plan.formation.trim() : null,
  };

  const titulairesPrevus = plan.titulaires.filter(Boolean);
  if (feuille.length === 0) {
    return {
      etat: "feuille_vide", formation, capitaine: { prevu: null, reel: null, identique: null },
      titulairesPrevus: titulairesPrevus.length, titulairesConformes: 0, adequation: null, lignes: [], observations: [],
    };
  }

  // Chaque ligne de feuille n'est attribuee qu'a un joueur.
  const libres = new Set(feuille.map((_, i) => i));
  const trouver = (j: JoueurRef): LigneFeuille | null => {
    const lic = cleLicence(j.licence);
    let i = lic ? [...libres].find((k) => cleLicence(feuille[k].licence) === lic) : undefined;
    if (i === undefined) {
      const cle = cleNom(j.nom, j.prenom);
      i = [...libres].find((k) => cleNom(feuille[k].nom, feuille[k].prenom) === cle);
    }
    if (i === undefined) return null;
    libres.delete(i);
    return feuille[i];
  };
  const roleReel = (l: LigneFeuille | null): RoleReel =>
    !l ? "absent" : l.titulaire ? "titulaire" : (l.entre ?? (l.minutes ?? 0) > 0) ? "entre" : "banc";

  const lignes: LigneComparaison[] = [];
  const ajouterPrevu = (id: string, prevu: Exclude<RolePrevu, null>) => {
    const j = parId.get(id);
    if (!j) return; // joueur sorti de la base : rien a afficher
    const l = trouver(j);
    const reel = roleReel(l);
    const ecart: Ecart = reel === "absent" ? "absent"
      : prevu === "titulaire" ? (reel === "titulaire" ? "conforme" : "relegue")
      : (reel === "titulaire" ? "promu" : "conforme");
    lignes.push({ joueurId: id, nom: libelle(j.nom, j.prenom), prevu, reel, minutes: l ? (l.minutes ?? null) : null, ecart });
  };
  titulairesPrevus.forEach((id) => ajouterPrevu(id, "titulaire"));
  plan.remplacants.filter(Boolean).forEach((id) => ajouterPrevu(id, "remplacant"));

  // Les joueurs de la feuille que le plan ne prevoyait pas : titulaires et entres en jeu seulement
  // (un remplacant non prevu qui n'a pas joue n'apprend rien).
  const connus = new Map(e.joueurs.map((j) => [cleNom(j.nom, j.prenom), j]));
  for (const i of libres) {
    const l = feuille[i];
    const reel = roleReel(l);
    if (reel === "banc") continue;
    lignes.push({
      joueurId: connus.get(cleNom(l.nom, l.prenom))?.id ?? null, nom: libelle(l.nom, l.prenom),
      prevu: null, reel, minutes: l.minutes ?? null, ecart: reel === "titulaire" ? "surprise" : "non_prevu",
    });
  }

  const conformes = lignes.filter((l) => l.prevu === "titulaire" && l.ecart === "conforme").length;
  const adequation = titulairesPrevus.length > 0 ? Math.round((conformes / titulairesPrevus.length) * 100) : null;

  // Capitaine.
  const capPrevu = plan.capitaineId ? parId.get(plan.capitaineId) ?? null : null;
  const capLigne = feuille.find((l) => l.capitaine) ?? null;
  const capitaine = {
    prevu: capPrevu ? libelle(capPrevu.nom, capPrevu.prenom) : null,
    reel: capLigne ? libelle(capLigne.nom, capLigne.prenom) : null,
    identique: capPrevu && capLigne
      ? cleNom(capPrevu.nom, capPrevu.prenom) === cleNom(capLigne.nom, capLigne.prenom) || (!!capPrevu.licence && cleLicence(capPrevu.licence) === cleLicence(capLigne.licence))
      : null,
  };

  return {
    etat: "ok", formation, capitaine,
    titulairesPrevus: titulairesPrevus.length, titulairesConformes: conformes, adequation, lignes,
    observations: observer({ lignes, formation, capitaine, adequation, prevus: titulairesPrevus.length, conformes }),
  };
}

const liste = (l: LigneComparaison[]) => l.map((x) => x.nom).join(", ");

function observer(c: {
  lignes: LigneComparaison[]; formation: ComparaisonPlanRealise["formation"];
  capitaine: ComparaisonPlanRealise["capitaine"]; adequation: number | null; prevus: number; conformes: number;
}): Observation[] {
  const obs: Observation[] = [];
  const de = (ecart: Ecart, prevu?: RolePrevu) => c.lignes.filter((l) => l.ecart === ecart && (prevu === undefined || l.prevu === prevu));

  if (c.adequation !== null && c.prevus >= 5) {
    const d = `${c.conformes} titulaire${c.conformes > 1 ? "s" : ""} sur ${c.prevus} ${c.conformes > 1 ? "ont" : "a"} demarre comme prevu (${c.adequation} %).`;
    if (c.adequation >= 80) obs.push({ ton: "atout", importance: 2, titre: "Onze conforme au plan", detail: d });
    else if (c.adequation >= 60) obs.push({ ton: "info", importance: 2, titre: "Plan en partie respecte", detail: d });
    else obs.push({ ton: "vigilance", importance: 3, titre: "Onze tres different du plan", detail: d });
  }

  const absents = de("absent").filter((l) => l.prevu === "titulaire");
  if (absents.length > 0) {
    obs.push({
      ton: "vigilance", importance: 3,
      titre: `${absents.length} titulaire${absents.length > 1 ? "s" : ""} prevu${absents.length > 1 ? "s" : ""} absent${absents.length > 1 ? "s" : ""} de la feuille`,
      detail: `${liste(absents)} ne figure${absents.length > 1 ? "nt" : ""} pas sur la feuille de match : indisponibilite de derniere minute, ou plan a mettre a jour plus tot.`,
    });
  }
  const releguesBanc = de("relegue");
  if (releguesBanc.length > 0) {
    obs.push({
      ton: "info", importance: 2,
      titre: `Prevu${releguesBanc.length > 1 ? "s" : ""} titulaire${releguesBanc.length > 1 ? "s" : ""}, finalement au banc`,
      detail: `${releguesBanc.map((l) => `${l.nom}${l.reel === "entre" ? ` (entre en jeu${l.minutes ? `, ${l.minutes} min` : ""})` : " (non utilise)"}`).join(", ")}.`,
    });
  }
  const surprises = de("surprise");
  if (surprises.length > 0) {
    obs.push({
      ton: "info", importance: 2,
      titre: `${surprises.length} titulaire${surprises.length > 1 ? "s" : ""} non prevu${surprises.length > 1 ? "s" : ""}`,
      detail: `${liste(surprises)} ${surprises.length > 1 ? "ont" : "a"} demarre sans figurer dans le onze prepare.`,
    });
  }
  const promus = de("promu");
  if (promus.length > 0) {
    obs.push({
      ton: "info", importance: 1, titre: "Remplacant prevu promu titulaire",
      detail: `${liste(promus)} ${promus.length > 1 ? "etaient" : "etait"} prevu${promus.length > 1 ? "s" : ""} sur le banc et ${promus.length > 1 ? "ont" : "a"} demarre.`,
    });
  }
  const entrees = c.lignes.filter((l) => l.reel === "entre");
  if (entrees.length > 0) {
    const prevus = entrees.filter((l) => l.prevu === "remplacant").length;
    obs.push({
      ton: "info", importance: 1, titre: "Remplacements",
      detail: `${entrees.length} joueur${entrees.length > 1 ? "s" : ""} entre${entrees.length > 1 ? "s" : ""} en jeu, dont ${prevus} prevu${prevus > 1 ? "s" : ""} sur le banc.`,
    });
  }
  if (c.capitaine.identique === false) {
    obs.push({ ton: "info", importance: 1, titre: "Capitaine different", detail: `Prevu : ${c.capitaine.prevu}. Sur la feuille : ${c.capitaine.reel}.` });
  }
  if (c.formation.identique === false) {
    obs.push({ ton: "info", importance: 2, titre: "Dispositif different", detail: `Prevu en ${c.formation.prevue}, joue en ${c.formation.reelle}.` });
  }
  return obs.sort((a, b) => b.importance - a.importance);
}
