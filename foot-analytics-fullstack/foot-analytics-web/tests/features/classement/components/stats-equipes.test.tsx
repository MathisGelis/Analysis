import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/clubs/components/ClubBadge", () => ({ ClubBadge: () => null }));

import { TeamStats } from "@/features/classement/components/ClassementTabs";

const clubs = [{ id: "a", nom: "Club A" }, { id: "b", nom: "Club B" }] as never[];
const matchs = [
  { id: "1", clubDom: "a", clubExt: "b", scoreDom: 4, scoreExt: 0, statut: "joue" },
  { id: "2", clubDom: "b", clubExt: "a", scoreDom: 1, scoreExt: 1, statut: "joue" },
] as never[];
const joueurs = [{ id: "j", clubId: "a", nom: "X", prenom: "Y", matchs: 2, cartonsJaunes: 3, cartonsRouges: 1 }] as never[];

describe("Stats équipes", () => {
  it("vue Général : colonnes, valeurs agrégées et sélecteur de vue", () => {
    const html = renderToStaticMarkup(<TeamStats clubs={clubs} matchs={matchs} joueurs={joueurs} ownClubId="a" />);
    expect(html).toContain("Larges V");
    expect(html).toContain("Vue · Général");
    expect(html).toContain("Club A");
    expect(html).toContain("2.50");           // Club A : 5 buts en 2 matchs
    expect(html).not.toContain("Dom BP");     // colonne d'une autre vue
  });
});
