// src/features/direct/lib/alertes-direct.ts
//
// LES ALERTES DU DIRECT : ce qu'un staff qui regarde le match, pas l'ecran, doit savoir tout de suite. Un joueur deja averti qui refait une
// faute, trois fautes sans carton, une fatigue elevee sur le terrain, une serie de tirs adverses, un carton rouge (jouer a 10). Chaque alerte
// a un identifiant qui change quand la situation s'aggrave : une alerte fermee ne revient que si elle empire. Fonctions pures.

import type { EtatCompo } from "./compo-direct";
import { joueurLibelle } from "./actions";
import type { Cote, EvenementDirect, JoueurDirect } from "./direct-types";

export interface AlerteDirect {
  id: string;
  niveau: "alerte" | "attention";
  titre: string;
  detail: string;
}

/** Fatigue a partir de laquelle on previent (la fiche joueur appelle « surcharge » a partir de 75). */
export const SEUIL_FATIGUE = 75;
/** Serie de tirs adverses : au moins ce nombre de tirs dans les dernieres minutes, dont deux cadres. */
export const SERIE_TIRS = 3;
export const FENETRE_SERIE_MIN = 10;

const estTir = (e: EvenementDirect) => e.type === "tir" || e.type === "coup_franc" || e.type === "penalty";
const cadre = (e: EvenementDirect) => e.resultat === "but" || e.resultat === "cadre" || e.resultat === "arrete";

/** Le joueur d'un evenement : par identifiant, sinon par numero. */
const cle = (e: Pick<EvenementDirect, "joueurId" | "joueurNumero">) => e.joueurId ?? (e.joueurNumero !== null ? `n${e.joueurNumero}` : null);

export function alertesDirect(args: {
  evenements: EvenementDirect[]; nousCote: Cote; minute: number; compo: EtatCompo | null; joueurs: JoueurDirect[];
}): AlerteDirect[] {
  const { evenements, nousCote, minute, compo, joueurs } = args;
  const eux: Cote = nousCote === "dom" ? "ext" : "dom";
  const nous = evenements.filter((e) => e.cote === nousCote);
  const alertes: AlerteDirect[] = [];
  const surLeTerrain = compo ? new Set(compo.slots.filter((s) => s.joueur && !s.expulse).map((s) => (s.joueur as JoueurDirect).id)) : null;
  const nomDe = (e: EvenementDirect) => joueurLibelle(e.joueurNumero, e.joueurNom) || "Un joueur";
  const enJeu = (e: EvenementDirect) => !surLeTerrain || !e.joueurId || surLeTerrain.has(e.joueurId);

  // Fautes et avertissements, par joueur de chez nous.
  const parJoueur = new Map<string, EvenementDirect[]>();
  for (const e of nous) { const k = cle(e); if (k && (e.type === "faute" || e.type === "carton_jaune" || e.type === "carton_rouge")) parJoueur.set(k, [...(parJoueur.get(k) ?? []), e]); }
  for (const [k, evs] of parJoueur) {
    const ordre = [...evs].sort((a, b) => a.periode - b.periode || a.minute - b.minute);
    const dernier = ordre[ordre.length - 1];
    if (ordre.some((e) => e.type === "carton_rouge") || !enJeu(dernier)) continue;
    const iJaune = ordre.findIndex((e) => e.type === "carton_jaune");
    const fautes = ordre.filter((e) => e.type === "faute").length;
    const fautesApres = iJaune >= 0 ? ordre.slice(iJaune + 1).filter((e) => e.type === "faute").length : 0;
    if (iJaune >= 0 && fautesApres > 0) {
      alertes.push({ id: `jaune-faute-${k}-${fautesApres}`, niveau: "alerte", titre: `${nomDe(dernier)} est averti et refait faute`,
        detail: `${fautesApres} faute${fautesApres > 1 ? "s" : ""} depuis son carton jaune : risque de second jaune, donc d'expulsion. Le prévenir ou le remplacer.` });
    } else if (iJaune < 0 && fautes >= 3) {
      alertes.push({ id: `fautes-${k}-${fautes}`, niveau: "attention", titre: `${nomDe(dernier)} : ${fautes} fautes sans carton`, detail: "L'arbitre va finir par l'avertir : à surveiller." });
    }
  }

  // Fatigue elevee d'un joueur sur le terrain (apres la demi-heure : avant, ce serait le bruit d'un match qui commence).
  if (compo && minute >= 30) {
    for (const s of compo.slots) {
      const j = s.joueur;
      if (!j || s.expulse || j.fatigue === null || j.fatigue === undefined || j.fatigue < SEUIL_FATIGUE) continue;
      const fiche = joueurs.find((x) => x.id === j.id) ?? j;
      alertes.push({ id: `fatigue-${j.id}`, niveau: "attention", titre: `${joueurLibelle(j.numero, j.nom)} : fatigue élevée`,
        detail: `Score de fatigue ${fiche.fatigue} sur 100 avant le match : à ${minute}', envisager un changement.` });
    }
  }

  // Serie de tirs adverses dans les dernieres minutes.
  const recents = evenements.filter((e) => e.cote === eux && estTir(e) && !!e.resultat && e.minute >= minute - FENETRE_SERIE_MIN && e.minute <= minute);
  if (recents.length >= SERIE_TIRS && recents.filter(cadre).length >= 2) {
    alertes.push({ id: `serie-${recents.length}-${recents.filter(cadre).length}`, niveau: "alerte", titre: `L'adversaire accélère : ${recents.length} tirs en ${FENETRE_SERIE_MIN} minutes`,
      detail: `${recents.filter(cadre).length} cadrés. Resserrer les lignes, reprendre le ballon ou casser le rythme (changement, temps mort).` });
  }

  // Un rouge de chez nous : on joue a 10.
  const rouges = nous.filter((e) => e.type === "carton_rouge");
  if (rouges.length > 0) {
    alertes.push({ id: `dix-${rouges.length}`, niveau: "alerte", titre: rouges.length === 1 ? "On joue à 10" : `On joue à ${11 - rouges.length}`,
      detail: `${rouges.map((e) => joueurLibelle(e.joueurNumero, e.joueurNom) || "Un joueur").join(", ")} expulsé. Penser à un changement de système (onglet Compo).` });
  }
  return alertes;
}
