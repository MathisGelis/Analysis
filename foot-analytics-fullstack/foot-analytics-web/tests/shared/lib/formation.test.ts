import { describe, expect, it } from "vitest";

import { FORMATIONS, parseFormation } from "@/features/tactique/lib/composition";
import { FORMATION_LOSANGE, libelleFormation } from "@/shared/lib/formation";

describe("4-4-2 losange", () => {
  it("s'écrit 4-1-2-1-2, se lit « 4-4-2 losange » et figure parmi les dispositifs proposés", () => {
    expect(libelleFormation(FORMATION_LOSANGE)).toBe("4-4-2 losange");
    expect(libelleFormation("4-3-3")).toBe("4-3-3");
    expect(libelleFormation(null)).toBeNull();
    expect((FORMATIONS as readonly string[]).includes(FORMATION_LOSANGE)).toBe(true);
    expect(parseFormation(FORMATION_LOSANGE)).toEqual([4, 1, 2, 1, 2]);
  });
});
