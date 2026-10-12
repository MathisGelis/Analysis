import { calculerClassement, jourDuMatch, MatchClassable } from "@/features/classement/calcul-classement";

const EQUIPES = ["A", "B", "C", "D"].map((id) => ({ id: `e${id}`, competitionLibelle: "Seniors D2 / Phase Unique", poule: "C" }));
let n = 0;
const match = (dom: string, ext: string, sd: number, se: number, extra: Partial<MatchClassable> = {}): MatchClassable => ({
  clubDom: dom, clubExt: ext, equipeDomId: `e${dom}`, equipeExtId: `e${ext}`, saisonId: "s1",
  journee: String(++n), date: null, scoreDom: sd, scoreExt: se, statut: "joue", ...extra,
});
const rang = (l: ReturnType<typeof calculerClassement>) => l.sort((a, b) => a.rang - b.rang).map((x) => x.clubId);

describe("calculerClassement : cumuls", () => {
  it("3 points la victoire, 1 le nul ; joues, buts pour et contre", () => {
    const l = calculerClassement([match("A", "B", 2, 0), match("B", "A", 1, 1), match("C", "A", 0, 3)], EQUIPES);
    const a = l.find((x) => x.clubId === "A")!;
    expect(a).toMatchObject({ joues: 3, v: 2, n: 1, d: 0, bp: 6, bc: 1, pts: 7, rang: 1 });
    expect(l.find((x) => x.clubId === "B")).toMatchObject({ joues: 2, v: 0, n: 1, d: 1, pts: 1 });
  });

  it("un match programme, annule, reporte ou sans score ne compte pas", () => {
    const l = calculerClassement([
      match("A", "B", 2, 0), match("A", "C", 0, 0, { statut: "prevu" }), match("A", "D", 0, 0, { statut: "annule" }),
      match("B", "C", 0, 0, { statut: "reporte" }), match("C", "D", null as any, null as any),
    ], EQUIPES);
    expect(l.map((x) => x.clubId).sort()).toEqual(["A", "B"]);
  });

  it("une coupe n'a pas de classement et ne gonfle pas celui du championnat", () => {
    const l = calculerClassement([match("A", "B", 1, 0), match("A", "B", 5, 0, { competition: "Coupe De France Credit Agricole" })], [
      ...EQUIPES, { id: "eCA", competitionLibelle: "Coupe De France Credit Agricole", poule: null },
    ]);
    expect(l).toHaveLength(2);
    expect(l.find((x) => x.clubId === "A")).toMatchObject({ joues: 1, bp: 1 });
  });

  it("un championnat par (saison, competition, poule) : les categories d'un meme club ne se melangent pas", () => {
    const eq = [...EQUIPES, { id: "eA20", competitionLibelle: "U20 Regional 2 / Unique", poule: "B" }, { id: "eB20", competitionLibelle: "U20 Regional 2 / Unique", poule: "B" }];
    const l = calculerClassement([match("A", "B", 1, 0), { ...match("A", "B", 0, 4), equipeDomId: "eA20", equipeExtId: "eB20" }], eq);
    expect(l).toHaveLength(4);
    expect(l.filter((x) => x.rang === 1)).toHaveLength(2);                // un premier par championnat
    expect(l.find((x) => x.equipeId === "eA20")).toMatchObject({ rang: 2, pts: 0 });
  });
});

describe("calculerClassement : egalite de points (departage FFF)", () => {
  it("les confrontations directes passent avant la difference de buts generale", () => {
    // A et B a egalite de points ; B a la meilleure difference generale, mais A a battu B.
    const l = calculerClassement([
      match("A", "B", 1, 0), match("B", "A", 0, 0), match("A", "C", 1, 0),
      match("B", "C", 9, 0), match("C", "B", 0, 1),
    ], EQUIPES);
    const a = l.find((x) => x.clubId === "A")!, b = l.find((x) => x.clubId === "B")!;
    expect(a.pts).toBe(b.pts);
    expect(b.bp - b.bc).toBeGreaterThan(a.bp - a.bc);
    expect(a.rang).toBeLessThan(b.rang);
  });

  it("confrontations egales : la difference de buts GENERALE departage, puis les buts marques", () => {
    const l = calculerClassement([
      match("A", "B", 1, 1), match("B", "A", 1, 1),              // confrontations : nulles
      match("A", "C", 1, 0), match("B", "C", 3, 0),              // B : meilleure difference
    ], EQUIPES);
    expect(rang(l).slice(0, 2)).toEqual(["B", "A"]);
    const l2 = calculerClassement([
      match("A", "B", 1, 1), match("B", "A", 1, 1),
      match("A", "C", 4, 3), match("B", "C", 2, 1),              // meme difference (+1), A marque plus
    ], EQUIPES);
    expect(rang(l2).slice(0, 2)).toEqual(["A", "B"]);
  });

  it("trois equipes a egalite : mini-championnat entre elles seules", () => {
    // A, B, C se battent en rond (1-0) ; D les bat toutes, puis perd chez chacune de maniere differente.
    const l = calculerClassement([
      match("A", "B", 1, 0), match("B", "C", 1, 0), match("C", "A", 1, 0),
      match("A", "D", 0, 0), match("B", "D", 0, 0), match("C", "D", 0, 0),
    ], EQUIPES);
    expect(l.filter((x) => x.pts === 4)).toHaveLength(3);
    expect(new Set(l.map((x) => x.rang)).size).toBe(4);               // rangs distincts, calcul deterministe
    expect(rang(calculerClassement([...[match("A", "B", 1, 0), match("B", "C", 1, 0), match("C", "A", 1, 0), match("A", "D", 0, 0), match("B", "D", 0, 0), match("C", "D", 0, 0)]], EQUIPES)))
      .toEqual(rang(l));
  });
});

describe("calculerClassement : forme", () => {
  it("les 5 derniers resultats, dans l'ordre des dates (un match en retard est le plus recent)", () => {
    const l = calculerClassement([
      match("A", "B", 1, 0, { journee: "1", date: "01/09/2025" }),         // V
      match("A", "C", 0, 1, { journee: "2", date: "08/09/2025" }),         // D
      match("A", "D", 2, 2, { journee: "3", date: "15/09/2025" }),         // N
      match("A", "B", 3, 0, { journee: "4", date: "22/09/2025" }),         // V
      match("A", "C", 1, 0, { journee: "5", date: "29/09/2025" }),         // V
      match("A", "D", 0, 2, { journee: "1", date: "15/11/2025" }),         // D : journee 1 rejouee en novembre
    ], EQUIPES);
    expect(l.find((x) => x.clubId === "A")!.forme).toEqual(["D", "N", "V", "V", "D"]);
  });
});

describe("jourDuMatch", () => {
  it("jj/mm/aaaa, ISO, et illisible", () => {
    expect(jourDuMatch("30/05/2026")).toBe(Date.UTC(2026, 4, 30));
    expect(jourDuMatch("2026-05-30T17:00:00")).toBe(Date.UTC(2026, 4, 30));
    expect(jourDuMatch("bientot")).toBeNull();
    expect(jourDuMatch(null)).toBeNull();
  });
});
