// src/features/analyse-jeu/bilan-mi-temps.ts
//
// LE BILAN DE MI-TEMPS : ce que la premiere periode, saisie en direct, dit en 30 secondes. Tirs, xG, ou on concede, comment l'adversaire
// nous a fait mal, joueurs a surveiller (fautes, avertissements), et des pistes pour la seconde periode. Chaque piste s'appuie sur un chiffre
// et n'est donnee que si l'echantillon la justifie. Fonctions pures.

import { compteurs } from "../direct/stats-direct";
import { analyserHub, type MatchHub } from "./analyses-hub";
import type { EvenementJeu } from "./stats-jeu";
import { xgTotal } from "./xg";

type Cote = "dom" | "ext";
export type EvenementMiTemps = EvenementJeu & { periode: number; joueurNom?: string | null; joueurNumero?: number | null };

export interface LigneBilan { cle: string; libelle: string; nous: number; eux: number }
export interface JoueurABilan { nom: string; numero: number | null; buts: number; fautes: number; jaunes: number; rouges: number }
export interface PisteMiTemps { ton: "bon" | "alerte" | "neutre"; titre: string; detail: string; piste?: string }

export interface BilanMiTemps {
  /** Le bilan repose sur la premiere periode saisie ; faux s'il n'y a rien de saisi (pas de bilan a faire). */
  disponible: boolean;
  score: { nous: number; eux: number };
  lignes: LigneBilan[];
  /** Le couloir par lequel on a le plus concede (part du xG concede), si l'echantillon le permet. */
  couloirConcede: { nom: string; part: number } | null;
  joueurs: JoueurABilan[];
  pistes: PisteMiTemps[];
}

const NOMS_COULOIR = { gauche: "notre côté gauche", axe: "l'axe", droite: "notre côté droit" } as const;

export function bilanMiTemps(args: { nousCote: Cote; evenements: EvenementMiTemps[] }): BilanMiTemps {
  const { nousCote } = args;
  const eux: Cote = nousCote === "dom" ? "ext" : "dom";
  const evs = args.evenements.filter((e) => e.periode === 1);
  if (evs.length === 0) return { disponible: false, score: { nous: 0, eux: 0 }, lignes: [], couloirConcede: null, joueurs: [], pistes: [] };

  const c = compteurs(evs);
  const n = c[nousCote], e = c[eux];
  const xgN = xgTotal(evs.filter((x) => x.cote === nousCote)), xgE = xgTotal(evs.filter((x) => x.cote === eux));
  const lignes: LigneBilan[] = [
    { cle: "tirs", libelle: "Tirs", nous: n.tirs, eux: e.tirs }, { cle: "cadres", libelle: "Tirs cadrés", nous: n.tirsCadres, eux: e.tirsCadres },
    { cle: "xg", libelle: "xG estimé", nous: xgN, eux: xgE }, { cle: "corners", libelle: "Corners", nous: n.corners, eux: e.corners },
    { cle: "fautes", libelle: "Fautes", nous: n.fautes, eux: e.fautes }, { cle: "jaunes", libelle: "Cartons jaunes", nous: n.jaunes, eux: e.jaunes },
  ];

  // Ou et comment on concede : on reutilise les analyses du hub sur cette seule periode.
  const match: MatchHub = { matchId: "mi-temps", date: null, domicile: nousCote === "dom", adversaireId: null, formation: null, bp: n.buts, bc: e.buts, evenements: evs, fmi: [] };
  const a = analyserHub([match]);
  const concede = a.concession;
  const couloirs = [...concede.couloirs].sort((x, y) => y.xg - x.xg);
  const xgConcede = couloirs.reduce((s, x) => s + x.xg, 0);
  const couloirConcede = concede.tirs >= 3 && xgConcede > 0 && couloirs[0].xg / xgConcede >= 0.5
    ? { nom: couloirs[0].nom, part: Math.round((couloirs[0].xg / xgConcede) * 100) } : null;

  // Les joueurs de chez nous a suivre : buteurs, fautifs, avertis.
  const parJoueur = new Map<string, JoueurABilan>();
  for (const x of evs.filter((v) => v.cote === nousCote && (v.joueurNom || v.joueurNumero != null))) {
    const cle = String(x.joueurNumero ?? x.joueurNom);
    const j = parJoueur.get(cle) ?? parJoueur.set(cle, { nom: x.joueurNom ?? "", numero: x.joueurNumero ?? null, buts: 0, fautes: 0, jaunes: 0, rouges: 0 }).get(cle)!;
    if ((x.type === "tir" || x.type === "coup_franc" || x.type === "penalty") && x.resultat === "but") j.buts++;
    if (x.type === "faute") j.fautes++;
    if (x.type === "carton_jaune") j.jaunes++;
    if (x.type === "carton_rouge") j.rouges++;
  }
  const joueurs = [...parJoueur.values()].filter((j) => j.buts > 0 || j.fautes >= 2 || j.jaunes > 0 || j.rouges > 0).sort((p, q) => q.rouges - p.rouges || q.jaunes - p.jaunes || q.fautes - p.fautes || q.buts - p.buts);

  const pistes: PisteMiTemps[] = [];
  if (xgE - xgN >= 0.4 && e.tirs >= 3) pistes.push({ ton: "alerte", titre: "L'adversaire crée plus de danger que nous", detail: `xG ${xgE.toFixed(2)} contre ${xgN.toFixed(2)} en première période.`, piste: "Resserrer les lignes et gagner les duels au milieu ; réduire les ballons perdus dans notre moitié." });
  else if (xgN - xgE >= 0.4 && n.tirs >= 3) pistes.push({ ton: "bon", titre: "On domine les occasions", detail: `xG ${xgN.toFixed(2)} contre ${xgE.toFixed(2)}.`, piste: n.buts <= e.buts ? "Continuer à presser et à cadrer : le score doit finir par suivre." : "Garder le même plan et protéger l'avantage." });
  if (couloirConcede) pistes.push({ ton: "alerte", titre: `On concède surtout par ${NOMS_COULOIR[couloirConcede.nom as keyof typeof NOMS_COULOIR]}`, detail: `${couloirConcede.part} % du xG concédé (${concede.tirs} tirs adverses).`, piste: "Soutenir ce côté avec un milieu ou un latéral plus bas, ou orienter le jeu adverse de l'autre côté." });
  const fam = [...concede.familles].sort((x, y) => y.xg - x.xg)[0];
  const xgFam = concede.familles.reduce((s, x) => s + x.xg, 0);
  if (fam && concede.tirs >= 3 && xgFam > 0 && fam.xg / xgFam >= 0.5 && fam.famille !== "Non précisé") pistes.push({ ton: "neutre", titre: `Le danger vient de ses ${fam.famille.toLowerCase()}`, detail: `${Math.round((fam.xg / xgFam) * 100)} % du xG concédé.`, piste: fam.famille === "Coup de pied arrêté" ? "Revoir le marquage sur coups de pied arrêtés." : fam.famille === "Transition" ? "Garder une couverture derrière le ballon à la perte." : undefined });
  if (n.tirs >= 6 && n.buts === 0) pistes.push({ ton: "neutre", titre: "Beaucoup de tirs, pas de but", detail: `${n.tirs} tirs dont ${n.tirsCadres} cadrés (xG ${xgN.toFixed(2)}).`, piste: "Chercher des tirs de meilleure qualité (zone centrale, passe avant le tir) plutôt que d'en forcer." });
  if (n.fautes >= 8 || n.jaunes >= 2) pistes.push({ ton: "alerte", titre: "Trop de fautes", detail: `${n.fautes} fautes et ${n.jaunes} jaune${n.jaunes > 1 ? "s" : ""} déjà.`, piste: "Rappeler la discipline : un joueur averti ne doit plus aller au contact en retard." });
  if (n.rouges > 0) pistes.push({ ton: "alerte", titre: "On joue à 10", detail: "Un carton rouge est tombé en première période.", piste: "Passer en bloc plus compact (4-4-1 ou 4-4-2 à plat) et réorganiser les postes." });
  if (e.rouges > 0) pistes.push({ ton: "bon", titre: "L'adversaire joue à 10", detail: "Un carton rouge adverse en première période.", piste: "Étirer le jeu sur les côtés et multiplier les centres." });

  return { disponible: true, score: { nous: n.buts, eux: e.buts }, lignes, couloirConcede, joueurs, pistes };
}
