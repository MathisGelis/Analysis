import {
  CriteresRecherche, DonneesRecherche, EquipeRef, EvenementFeuille, FicheRef, LigneFeuille, ligneDuPosteFiche, memeLibelle,
  rechercherJoueurs,
} from "@/features/joueurs/recherche-avancee";

// Saison 2025-2026 (« l'an dernier ») et 2026-2027 (l'actuelle), deux clubs.
const equipe = (id: string, clubId: string, categorie: string, division: string, saisonId: string): EquipeRef =>
  ({ id, clubId, nom: `${categorie} ${division}`, categorie, division, saisonId });
const EQUIPES = new Map([
  equipe("ol-u16", "OL", "U16", "R2", "s25"),
  equipe("mi-u16", "MIONS", "U16", "R2", "s25"),
  equipe("ol-sen", "OL", "Seniors", "D2", "s25"),
  equipe("ol-u17", "OL", "U17", "R1", "s26"),
  equipe("mi-u17", "MIONS", "U17", "R2", "s26"),
].map((e) => [e.id, e]));

const fiche = (id: string, nom: string, licence: string | null, poste: string | null, extra: Partial<FicheRef> = {}): FicheRef =>
  ({ id, nom, prenom: "Jean", licence, clubId: "OL", poste, equipesAttachees: null, ...extra });
const FICHES: FicheRef[] = [
  fiche("libre", "LIBRE", "L1", "AT"),
  fiche("reste", "RESTE", "L2", null, { clubId: "MIONS" }),
  fiche("parti", "PARTI", "L3", "MC"),
  fiche("banc", "BANC", "L4", "AT"),
  fiche("senior", "SENIOR", "L5", "AT"),
  fiche("sanslic", "SANSLICENCE", null, "AT", { equipesAttachees: ["ol-u17"] }),
];

let n = 0;
const ligne = (
  licence: string | null, nom: string, clubId: string, equipeId: string, saisonId: string, extra: Partial<LigneFeuille> = {},
): LigneFeuille => ({
  matchId: `m${++n}`, saisonId, date: `0${(n % 9) + 1}/10/${saisonId === "s25" ? 2025 : 2026}`, cote: "dom", clubId, equipeId,
  licence, nom, prenom: "Jean", numero: 9, titulaire: true, minutes: 0, ...extra,
});

function donnees(): DonneesRecherche {
  n = 0;
  const lignes: LigneFeuille[] = [
    // LIBRE : 3 matchs en U16 R2 avec OL l'an dernier, rien cette saison. 2 buts.
    ligne("L1", "LIBRE", "OL", "ol-u16", "s25", { matchId: "b1" }),
    ligne("L1", "LIBRE", "OL", "ol-u16", "s25"),
    ligne("L1", "LIBRE", "OL", "ol-u16", "s25"),
    // RESTE : pas de poste sur la fiche, le 9 ; un match comme remplacant entre en jeu ; toujours a Mions.
    ligne("L2", "RESTE", "MIONS", "mi-u16", "s25", { cote: "ext" }),
    ligne("L2", "RESTE", "MIONS", "mi-u16", "s25", { cote: "ext", matchId: "entre", titulaire: false, numero: 14 }),
    ligne("L2", "RESTE", "MIONS", "mi-u17", "s26", { cote: "ext" }),
    // PARTI : milieu, OL l'an dernier, Mions cette saison.
    ligne("L3", "PARTI", "OL", "ol-u16", "s25", { numero: 8 }),
    ligne("L3", "PARTI", "MIONS", "mi-u17", "s26", { numero: 8, titulaire: false }),
    // BANC : sur la feuille, jamais entre en jeu.
    ligne("L4", "BANC", "OL", "ol-u16", "s25", { titulaire: false, numero: 15 }),
    // SENIOR : pas la bonne categorie.
    ligne("L5", "SENIOR", "OL", "ol-sen", "s25"),
    // SANSLICENCE : reconnu par son nom et son club ; rattache a l'effectif U17 de cette saison.
    ligne(null, "SANSLICENCE", "OL", "ol-u16", "s25"),
    // Une licence sans fiche : ignoree.
    ligne("L9", "INCONNU", "OL", "ol-u16", "s25"),
  ];
  const evenements = new Map<string, EvenementFeuille[]>([
    ["b1", [
      { type: "but", sousType: "", equipe: "dom", joueur: "LIBRE Jean", joueur2: "", minute: 10 },
      { type: "but", sousType: "", equipe: "dom", joueur: "LIBRE Jean", joueur2: "", minute: 50 },
    ] satisfies EvenementFeuille[]],
    ["entre", [{ type: "remplacement", sousType: "", equipe: "ext", joueur: "AUTRE Paul", joueur2: "RESTE Jean", minute: 60 }] satisfies EvenementFeuille[]],
  ]);
  return { lignes, evenements, equipes: EQUIPES, fiches: FICHES };
}

const ATTAQUANTS = ["AT", "AG", "AD"];
const base: CriteresRecherche = { saisonId: "s25", categorie: "U16", division: "R2" };
const noms = (r: ReturnType<typeof rechercherJoueurs>) => r.resultats.map((x) => x.nom);

describe("rechercherJoueurs", () => {
  it("un attaquant qui a joue en U16 R2 l'an dernier et qui n'a pas de club cette saison", () => {
    const r = rechercherJoueurs({ ...base, postes: ATTAQUANTS, situation: { saisonId: "s26", statut: "sans_club" } }, donnees());
    expect(noms(r)).toEqual(["LIBRE"]);
    expect(r.resultats[0]).toMatchObject({
      poste: "AT", posteDeduit: false,
      periode: { clubId: "OL", matchs: 3, titularisations: 3, buts: 2, equipes: [{ id: "ol-u16", categorie: "U16", division: "R2" }] },
      situation: { statut: "sans_club", clubId: null, equipe: null },
    });
  });

  it("situation indifferente : tous les attaquants, avec leur situation ; le banc et les autres categories n'en sont pas", () => {
    const r = rechercherJoueurs({ ...base, postes: ATTAQUANTS, situation: { saisonId: "s26", statut: "indifferent" } }, donnees());
    expect(noms(r)).toEqual(["LIBRE", "RESTE", "SANSLICENCE"]);
    const parNom = new Map(r.resultats.map((x) => [x.nom, x]));
    // Poste deduit du numero le plus porte (le 9) ; le remplacant entre en jeu a joue (30 minutes).
    expect(parNom.get("RESTE")).toMatchObject({
      poste: "AT", posteDeduit: true, periode: { matchs: 2, titularisations: 1, minutes: 120 },
      situation: { statut: "meme_club", clubId: "MIONS", equipe: { id: "mi-u17" } },
    });
    // Sans licence : reconnu par son nom et son club, present cette saison par son effectif.
    expect(parNom.get("SANSLICENCE")?.situation).toMatchObject({ statut: "meme_club", clubId: "OL", equipe: { id: "ol-u17" } });
  });

  it("parti dans un autre club, meme sur le banc d'une feuille de cette saison", () => {
    const r = rechercherJoueurs({ ...base, situation: { saisonId: "s26", statut: "autre_club" } }, donnees());
    expect(noms(r)).toEqual(["PARTI"]);
    expect(r.resultats[0].situation).toMatchObject({ statut: "autre_club", clubId: "MIONS" });
  });

  it("matchs minimum, club de la periode, libelles sans casse", () => {
    expect(noms(rechercherJoueurs({ ...base, minMatchs: 3 }, donnees()))).toEqual(["LIBRE"]);
    expect(noms(rechercherJoueurs({ ...base, categorie: "u16", division: "r 2", clubId: "MIONS" }, donnees()))).toEqual(["RESTE"]);
  });

  it("sans saison cible : pas de situation ; sans categorie ni division : toute la saison", () => {
    const r = rechercherJoueurs({ saisonId: "s25" }, donnees());
    expect(noms(r)).toEqual(["LIBRE", "RESTE", "PARTI", "SANSLICENCE", "SENIOR"]);
    expect(r.resultats.every((x) => x.situation === null)).toBe(true);
  });

  it("tri par matchs puis buts, total et limite", () => {
    const r = rechercherJoueurs({ saisonId: "s25" }, donnees(), 2);
    expect(r.total).toBe(5);
    expect(noms(r)).toEqual(["LIBRE", "RESTE"]);
  });

  it("un poste demande exclut les joueurs sans poste connu", () => {
    const d = donnees();
    d.lignes = d.lignes.map((l) => (l.licence === "L2" ? { ...l, numero: 20 } : l));
    expect(noms(rechercherJoueurs({ ...base, postes: ATTAQUANTS }, d))).toEqual(["LIBRE", "SANSLICENCE"]);
  });
});

describe("outils", () => {
  it("memeLibelle ignore casse, accents et espaces", () => {
    expect(memeLibelle("U16", "u 16")).toBe(true);
    expect(memeLibelle("Seniors", "SÉNIORS")).toBe(true);
    expect(memeLibelle("U16", "U17")).toBe(false);
  });

  it("ligneDuPosteFiche", () => {
    expect(["GB", "DC", "MO", "MIL", "AG", "AT", "?"].map(ligneDuPosteFiche)).toEqual(["GB", "DEF", "MIL", "MIL", "ATT", "ATT", null]);
  });
});
