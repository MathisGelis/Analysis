import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NosDispositifs } from "@/features/analyse-jeu/components/AnalysesHub";

const ligne = (formation: string, extra: object = {}) => ({
  formation, matchs: 1.5, minutes: 135, v: 1, n: 0, d: 0.5, ptsParMatch: 2, bpParMatch: 1.5, bcParMatch: 0.5, minutesSaisies: 135,
  tirsPour90: 8, tirsContre90: 4, xgPour90: 1.2, xgContre90: 0.6, xgDiff90: 0.6, fiabilite: "moyenne" as const, ...extra,
});

describe("Nos dispositifs (Data Hub)", () => {
  it("le losange s'écrit « 4-4-2 losange », les matchs partagés sont au prorata, les changements sont listés", () => {
    const html = renderToStaticMarkup(<NosDispositifs n={{
      couverture: { avec: 2, total: 2 }, matchsAvecChangement: 1,
      lignes: [ligne("4-3-3"), ligne("4-1-2-1-2", { matchs: 0.5, fiabilite: "faible", xgDiff90: null, xgPour90: null, xgContre90: null })],
      changements: [{ de: "4-3-3", vers: "4-1-2-1-2", fois: 1 }],
    }} />);
    expect(html).toContain("4-4-2 losange");
    expect(html).not.toContain("4-1-2-1-2");
    expect(html).toContain("1.5");
    expect(html).toContain("échantillon faible");
    expect(html).toContain("4-3-3 → 4-4-2 losange (1)");
  });
});
