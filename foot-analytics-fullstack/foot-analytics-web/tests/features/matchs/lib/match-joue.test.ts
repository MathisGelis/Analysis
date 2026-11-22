import { describe, expect, it } from "vitest";

import { estMatchJoue } from "@/features/matchs/lib/match-joue";

describe("estMatchJoue", () => {
  it("joué par défaut ; prévu, à venir, reporté et annulé ne comptent pas", () => {
    expect([undefined, null, "joue", "arrete", "JOUE"].map((statut) => estMatchJoue({ statut }))).toEqual([true, true, true, true, true]);
    expect(["prevu", "a_venir", "reporte", "annule", "Prevu"].map((statut) => estMatchJoue({ statut }))).toEqual([false, false, false, false, false]);
  });
});
