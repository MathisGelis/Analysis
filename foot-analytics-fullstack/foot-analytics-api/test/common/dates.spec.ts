import { parseDateFlexible, trierChronologiquement } from "@/common/dates";

describe("parseDateFlexible", () => {
  it("accepte ISO et JJ/MM/AAAA", () => {
    expect(parseDateFlexible("2026-03-15")).toBe(Date.UTC(2026, 2, 15));
    expect(parseDateFlexible("15/03/2026")).toBe(Date.UTC(2026, 2, 15));
    expect(parseDateFlexible("5/3/26")).toBe(Date.UTC(2026, 2, 5));
  });
  it("renvoie null pour une valeur inexploitable", () => {
    expect(parseDateFlexible("demain")).toBeNull();
    expect(parseDateFlexible("")).toBeNull();
    expect(parseDateFlexible(undefined)).toBeNull();
  });
});

/** Une ligne datee, identifiee par `bp` (ordre attendu dans les assertions). */
const ligne = (bp: number, o: { date?: string | null; journee?: string | null } = {}) => ({ bp, date: o.date ?? null, journee: o.journee ?? String(bp) });

describe("trierChronologiquement", () => {
  it("compare des dates, pas des chaines : 15/03/2026 vient apres 27/09/2025", () => {
    const ms = [ligne(1, { date: "15/03/2026" }), ligne(2, { date: "27/09/2025" }), ligne(3, { date: "2026-01-10" })];
    expect(trierChronologiquement(ms).map((m) => m.bp)).toEqual([2, 3, 1]);
  });
  it("sans date : par journee, puis ordre d'arrivee ; les matchs dates passent avant", () => {
    const ms = [ligne(9, { journee: "10" }), ligne(8, { journee: "2" }), ligne(7, { date: "01/01/2026", journee: "30" })];
    expect(trierChronologiquement(ms).map((m) => m.bp)).toEqual([7, 8, 9]);
  });
});
