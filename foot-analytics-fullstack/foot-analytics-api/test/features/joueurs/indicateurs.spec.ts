import { noteIndicative } from "@/features/joueurs/indicateurs";

describe("noteIndicative", () => {
  it("part de 5,5 sans match", () => expect(noteIndicative(0, 0)).toBe(5.5));
  it("progresse avec les matchs et arrondit au dixieme", () => expect(noteIndicative(25, 0)).toBe(6.5));
  it("penalise les rouges", () => expect(noteIndicative(10, 1)).toBe(5.4));
});
