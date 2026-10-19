import { describe, expect, it } from "vitest";

import { COOKIES, doitAccepterCgu, VERSION_CGU } from "@/features/legal/lib/legal";

describe("conditions d'utilisation", () => {
  it("a accepter : jamais acceptees, ou une version anterieure ; pas hors connexion", () => {
    expect(doitAccepterCgu({ cguVersion: null })).toBe(true);
    expect(doitAccepterCgu({ cguVersion: "2020-01" })).toBe(true);
    expect(doitAccepterCgu({ cguVersion: VERSION_CGU })).toBe(false);
    expect(doitAccepterCgu(null)).toBe(false);
  });

  it("cookies : seulement des cookies necessaires, aucun traceur", () => {
    const noms = COOKIES.map((c) => c.nom).join(" ");
    expect(noms).toContain("fa_access");
    expect(noms).not.toMatch(/_ga|_gid|fbp|analytics|pixel/i);
  });
});
