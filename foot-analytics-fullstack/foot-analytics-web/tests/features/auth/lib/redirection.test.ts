import { describe, expect, it } from "vitest";

import { cheminInterne } from "@/features/auth/lib/redirection";

describe("cheminInterne", () => {
  it("accepte les chemins internes, avec requete et ancre", () => {
    expect(cheminInterne("/matchs")).toBe("/matchs");
    expect(cheminInterne("/arbitres/12?portee=carriere#haut")).toBe("/arbitres/12?portee=carriere#haut");
    expect(cheminInterne("/")).toBe("/");
  });
  it("refuse les URL absolues et protocole-relatives", () => {
    for (const v of ["https://evil.example", "http://evil.example/x", "//evil.example", "/\\evil.example", "javascript:alert(1)", "evil.example"]) {
      expect(cheminInterne(v)).toBe("/");
    }
  });
  it("refuse les caracteres de controle", () => {
    expect(cheminInterne("/ok\r\nSet-Cookie: a=b")).toBe("/");
  });
  it("valeur absente : defaut fourni", () => {
    expect(cheminInterne(null)).toBe("/");
    expect(cheminInterne("", "/accueil")).toBe("/accueil");
  });
});
