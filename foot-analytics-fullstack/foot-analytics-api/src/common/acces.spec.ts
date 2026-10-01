import {
  CHAMPS_PRIVES_JOUEUR, CompteAcces, ContexteAcces, EquipeAcces, SaisonAcces, saisonActuelle, saisonsOuvertes,
} from "./acces";

const S = (id: string, anneeDebut: number, actif = false): SaisonAcces => ({ id, anneeDebut, actif });
const s23 = S("s23", 2023), s24 = S("s24", 2024), s25 = S("s25", 2025), s26 = S("s26", 2026, true), s27 = S("s27", 2027);
const saisons = [s24, s26, s23, s27, s25];

const compte = (extra: Partial<CompteAcces> = {}): CompteAcces => ({
  id: "u1", role: "user", clubId: "ol", equipeIds: [], toutesSaisons: true, saisonIds: [], ...extra,
});
const eq = (id: string, extra: Partial<EquipeAcces> = {}): EquipeAcces => ({
  id, clubId: "ol", categorie: "Seniors", division: "D2", competitionLibelle: "Seniors D2", poule: "A", saisonId: "s26", ...extra,
});

describe("saisonActuelle / saisonsOuvertes", () => {
  it("la saison actuelle : la plus recente des actives, sinon la plus recente", () => {
    expect(saisonActuelle(saisons)?.id).toBe("s26");
    expect(saisonActuelle([s24, s25])?.id).toBe("s25");
    expect(saisonActuelle([])).toBeNull();
  });

  it("admin, referent et educateur sans restriction : toutes les saisons (null)", () => {
    expect(saisonsOuvertes(compte({ role: "admin", toutesSaisons: false }), saisons)).toBeNull();
    expect(saisonsOuvertes(compte({ role: "referent", toutesSaisons: false }), saisons)).toBeNull();
    expect(saisonsOuvertes(compte(), saisons)).toBeNull();
  });

  it("educateur restreint : saison actuelle, suivantes, et saisons passees cochees", () => {
    const ids = (c: Partial<CompteAcces>) => [...(saisonsOuvertes(compte({ toutesSaisons: false, ...c }), saisons) ?? [])].sort();
    expect(ids({})).toEqual(["s26", "s27"]);
    expect(ids({ saisonIds: ["s25", "s23"] })).toEqual(["s23", "s25", "s26", "s27"]);
    expect(ids({ saisonIds: ["fantome"] })).toEqual(["s26", "s27"]);
  });

  it("aucune saison connue : rien n'est cache", () => {
    expect(saisonsOuvertes(compte({ toutesSaisons: false }), [])).toBeNull();
  });
});

describe("ContexteAcces : saisons", () => {
  const restreint = new ContexteAcces(compte({ toutesSaisons: false, saisonIds: ["s25"] }), [], saisons);

  it("voitSaison : ouvertes vraies, fermees fausses, absence de saison vraie", () => {
    expect(restreint.voitSaison("s26")).toBe(true);
    expect(restreint.voitSaison("s25")).toBe(true);
    expect(restreint.voitSaison("s24")).toBe(false);
    expect(restreint.voitSaison(null)).toBe(true);
    expect(restreint.saisonsRestreintes).toBe(true);
  });

  it("voitDate : une date d'une saison fermee est refusee ; les formats ISO et JJ/MM/AAAA se valent ; l'illisible reste visible", () => {
    expect(restreint.voitDate("2026-10-05")).toBe(true);
    expect(restreint.voitDate("05/10/2025")).toBe(true);           // saison 2025-2026, cochee
    expect(restreint.voitDate("2024-09-01")).toBe(false);
    expect(restreint.voitDate("01/09/2024")).toBe(false);
    expect(restreint.voitDate("2026-03-01")).toBe(true);            // mars 2026 = saison 2025-2026
    expect(restreint.voitDate("n'importe quoi")).toBe(true);
    expect(restreint.voitDate(null)).toBe(true);
  });

  it("filtrerSaison garde les lignes des saisons ouvertes", () => {
    const l = [{ id: 1, s: "s26" }, { id: 2, s: "s24" }, { id: 3, s: null }, { id: 4, s: "s25" }];
    expect(restreint.filtrerSaison(l, (x) => x.s).map((x) => x.id)).toEqual([1, 3, 4]);
  });

  it("compte sans restriction : rien n'est filtre", () => {
    const libre = new ContexteAcces(compte(), [], saisons);
    expect(libre.saisonsRestreintes).toBe(false);
    expect(libre.voitSaison("s23")).toBe(true);
    expect(libre.voitDate("2020-01-01")).toBe(true);
    const l = [{ s: "s23" }, { s: "s26" }];
    expect(libre.filtrerSaison(l, (x) => x.s)).toBe(l);
  });
});

describe("ContexteAcces : club et equipes", () => {
  const sen26 = eq("sen26"), sen25 = eq("sen25", { poule: "C", competitionLibelle: "Seniors D2 / Phase Unique", saisonId: "s25" });
  const u20 = eq("u20", { categorie: "U20", division: "R2", competitionLibelle: "U20 R2", poule: "B" });
  const voisin = eq("voisin", { clubId: "mions" });

  it("gereClub : mon club seulement ; l'admin gere tous les clubs", () => {
    const c = new ContexteAcces(compte(), [], saisons);
    expect(c.gereClub("ol")).toBe(true);
    expect(c.gereClub("mions")).toBe(false);
    expect(c.gereClub(null)).toBe(false);
    expect(new ContexteAcces(compte({ role: "admin", clubId: null }), [], saisons).gereClub("mions")).toBe(true);
  });

  it("educateur sans equipe attribuee : toutes les equipes de son club, aucune d'un autre", () => {
    const c = new ContexteAcces(compte(), [], saisons);
    expect(c.gereEquipe(sen26)).toBe(true);
    expect(c.gereEquipe(u20)).toBe(true);
    expect(c.gereEquipe(voisin)).toBe(false);
  });

  it("educateur avec une equipe attribuee : celle-ci, et son equivalent d'une autre saison (meme niveau, autre poule)", () => {
    const c = new ContexteAcces(compte({ equipeIds: ["sen26"] }), [sen26], saisons);
    expect(c.gereEquipe(sen26)).toBe(true);
    expect(c.gereEquipe(sen25)).toBe(true);               // niveau Seniors D2 identique
    expect(c.gereEquipe(u20)).toBe(false);
    expect(c.gereEquipe(voisin)).toBe(false);
  });

  it("la poule change d'une saison a l'autre (C puis A) : l'equipe reste geree grace a son niveau ; le niveau ne deborde pas", () => {
    // Cas reel : droits donnes sur "Seniors D2 poule C" 2025-2026 ; en 2026-2027 la vraie poule est A.
    const c25 = eq("c25", { poule: "C", saisonId: "s25", competitionLibelle: "Seniors D2 / Phase Unique" });
    const c = new ContexteAcces(compte({ equipeIds: ["c25"] }), [c25], saisons);
    expect(c.gereEquipe(eq("a26", { poule: "A", saisonId: "s26", competitionLibelle: "Seniors D2 / Phase Unique" }))).toBe(true);
    expect(c.gereEquipe(eq("d1", { division: "D1", competitionLibelle: "Seniors D1", poule: "A" }))).toBe(false);           // autre division
    expect(c.gereEquipe(eq("autre-club", { clubId: "mions", poule: "A" }))).toBe(false);                                    // autre club
    expect(c.gereEquipe(eq("sans-division", { division: null, competitionLibelle: "Coupe", poule: null }))).toBe(false);    // division inconnue
    expect(c.gereEquipe(eq("u20-26", { categorie: "U20", division: "R2", competitionLibelle: "U20 R2", poule: "B" }))).toBe(false);
  });

  it("referent : toutes les equipes de son club, jamais celles d'un autre", () => {
    const c = new ContexteAcces(compte({ role: "referent", equipeIds: [] }), [], saisons);
    expect(c.gereEquipe(u20)).toBe(true);
    expect(c.gereEquipe(voisin)).toBe(false);
  });

  it("une equipe d'une saison fermee n'est pas geree, meme dans mon club", () => {
    const c = new ContexteAcces(compte({ toutesSaisons: false }), [], saisons);
    expect(c.gereEquipe(sen25)).toBe(false);
    expect(c.gereEquipe(sen26)).toBe(true);
  });

  it("voitEquipe : une equipe adverse est consultable (saison ouverte), mon equipe non attribuee ne l'est pas", () => {
    const c = new ContexteAcces(compte({ equipeIds: ["sen26"], toutesSaisons: false }), [sen26], saisons);
    expect(c.voitEquipe(voisin)).toBe(true);
    expect(c.voitEquipe({ ...voisin, saisonId: "s24" })).toBe(false);
    expect(c.voitEquipe(u20)).toBe(false);
    expect(c.voitEquipe(sen26)).toBe(true);
  });

  it("un compte sans club ne gere rien", () => {
    const c = new ContexteAcces(compte({ clubId: null }), [], saisons);
    expect(c.gereEquipe(sen26)).toBe(false);
    expect(c.gereClub("ol")).toBe(false);
  });
});

describe("ContexteAcces.masquerPrive", () => {
  const joueur = { id: "j", nom: "A", clubId: "mions", commentaire: "rapide", scoreFatigue: 80, tailleCm: 180, buts: 4, fatigueDetail: "{}" };

  it("joueur d'un autre club : champs prives retires, le reste intact", () => {
    const c = new ContexteAcces(compte(), [], saisons);
    const vu = c.masquerPrive(joueur);
    expect(vu).toMatchObject({ id: "j", nom: "A", buts: 4, commentaire: null, scoreFatigue: null, tailleCm: null, fatigueDetail: null });
    expect(joueur.commentaire).toBe("rapide");                      // l'original n'est pas modifie
  });

  it("joueur de mon club, ou admin : complet", () => {
    expect(new ContexteAcces(compte({ clubId: "mions" }), [], saisons).masquerPrive(joueur)).toBe(joueur);
    expect(new ContexteAcces(compte({ role: "admin", clubId: null }), [], saisons).masquerPrive(joueur)).toBe(joueur);
  });

  it("la liste des champs prives couvre la fatigue et les donnees saisies par le staff", () => {
    for (const c of ["commentaire", "scoreFatigue", "fatigueEntree", "fatigueDetail", "tailleCm", "poidsKg", "piedFort"]) {
      expect(CHAMPS_PRIVES_JOUEUR).toContain(c);
    }
  });
});
