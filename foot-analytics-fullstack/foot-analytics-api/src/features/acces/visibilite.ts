// src/features/acces/visibilite.ts
//
// Matrice de visibilite entre clubs : ce qu'un compte voit d'un joueur selon qu'il est de SON club ou d'un autre.
// C'est l'UNIQUE definition de la regle ; elle est appliquee :
//   - par les controleurs (ContexteAcces.masquerPrive, filtrage des blessures, des seances...) ;
//   - en filet de securite par VisibiliteInterceptor, sur toutes les reponses de l'API : tout objet porteur d'un
//     clubId qui n'est pas le club du compte perd les champs prives, quelle que soit la route qui l'a produit.
//
//   Donnee                                         | Mon club              | Autre club
//   -----------------------------------------------+-----------------------+-----------
//   Nom, prenom, poste                             | oui                   | oui
//   Stats de match, cartons, suspensions           | oui                   | oui
//   Scouting, tactique, historique de clubs        | oui                   | oui
//   Numero de licence                              | oui                   | non
//   Date de naissance, taille, poids, pied fort    | oui                   | jamais
//   Sante, fatigue, charge, presences, commentaire | oui (comptes du club) | jamais
//
// Les blessures (table blessures) et les seances (presences) sont rangees par club et ne sortent jamais d'un autre
// club : voir BlessuresController, EntrainementsController. Fonctions pures, sans dependance.

export type NiveauVisibilite = "partage" | "club";

export interface LigneMatrice {
  donnee: string;
  champs: readonly string[];
  /** "partage" : visible des autres clubs ; "club" : reserve au club du joueur. */
  autreClub: NiveauVisibilite;
}

export const MATRICE_VISIBILITE: readonly LigneMatrice[] = [
  { donnee: "Identite sportive", champs: ["nom", "prenom", "poste", "postes", "numeroFavori"], autreClub: "partage" },
  {
    donnee: "Stats de match", champs: ["matchs", "titularisations", "minutes", "buts", "passesDecisives", "noteMoyenne"],
    autreClub: "partage",
  },
  { donnee: "Cartons et suspensions", champs: ["cartonsJaunes", "cartonsRouges", "typeDiscipline"], autreClub: "partage" },
  { donnee: "Numero de licence", champs: ["licence"], autreClub: "club" },
  { donnee: "Date de naissance et morphologie", champs: ["dateNaissance", "tailleCm", "poidsKg", "piedFort"], autreClub: "club" },
  {
    donnee: "Sante, fatigue, charge, commentaires",
    champs: [
      "commentaire", "scoreFatigue", "fatigueEntree", "fatigueDetail", "acwr", "chargeAcute7j", "chargeChronic28j",
      "blessuresAnt", "finDerniereBlessure", "fatigueMoy",
    ],
    autreClub: "club",
  },
];

/** Champs reserves au club du joueur : jamais montres a un autre club. */
export const CHAMPS_PRIVES_JOUEUR: readonly string[] = MATRICE_VISIBILITE
  .filter((l) => l.autreClub === "club").flatMap((l) => l.champs);

const PRIVES = new Set(CHAMPS_PRIVES_JOUEUR);

/** Retire les champs prives d'un objet (copie). */
export function sansChampsPrives<T extends object>(objet: T): T {
  const copie: Record<string, unknown> = { ...(objet as Record<string, unknown>) };
  for (const champ of CHAMPS_PRIVES_JOUEUR) if (champ in copie && copie[champ] != null) copie[champ] = null;
  return copie as T;
}

const estObjetSimple = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date) && !Buffer.isBuffer(v)
  && Object.getPrototypeOf(v) !== null && typeof (v as { pipe?: unknown }).pipe !== "function";

/** Club "proprietaire" d'un objet : le sien (clubId), celui de son cote d'un match (cote dom/ext), sinon celui du parent. */
type Club = string | null | undefined;
interface Contexte { club?: Club; match?: { dom: Club; ext: Club } }

function clubDe(o: Record<string, unknown>, parent: Contexte): { connu: boolean; club: Club } {
  if ("clubId" in o) return { connu: true, club: o.clubId as Club };
  if (parent.match && (o.cote === "dom" || o.cote === "ext")) return { connu: true, club: parent.match[o.cote] };
  if ("club" in parent) return { connu: true, club: parent.club };
  return { connu: false, club: undefined };
}

/**
 * Parcourt une reponse et masque les champs prives de tout objet appartenant a un club que `gereClub` refuse. Un
 * objet appartient au club de son `clubId` ; sans clubId, a celui de son cote d'un match (lignes de feuille "dom" /
 * "ext" sous un match), sinon a celui de l'objet qui le contient (le onze d'un adversaire, ses entraineurs...).
 * Un objet dont le club est inconnu (ni clubId, ni parent porteur d'un club) n'est pas modifie.
 */
export function filtrerReponse<T>(
  valeur: T, gereClub: (clubId: string | null | undefined) => boolean, parent: Contexte = {}, profondeur = 0,
): T {
  if (profondeur > 12 || valeur === null || valeur === undefined) return valeur;
  if (Array.isArray(valeur)) return valeur.map((v) => filtrerReponse(v, gereClub, parent, profondeur + 1)) as T;
  if (!estObjetSimple(valeur)) return valeur;
  const { connu, club } = clubDe(valeur, parent);
  const prive = connu && !gereClub(club);
  const enfants: Contexte = connu ? { club } : { ...parent };
  if ("clubDom" in valeur && "clubExt" in valeur) {
    enfants.match = { dom: valeur.clubDom as Club, ext: valeur.clubExt as Club };
    if (!connu) delete enfants.club;
  }
  const sortie: Record<string, unknown> = {};
  for (const [cle, v] of Object.entries(valeur)) {
    sortie[cle] = prive && PRIVES.has(cle) ? null : filtrerReponse(v, gereClub, enfants, profondeur + 1);
  }
  return sortie as T;
}
