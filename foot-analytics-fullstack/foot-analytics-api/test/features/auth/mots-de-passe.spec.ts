import { defautsMotDePasse, LONGUEUR_MIN, motDePasseTemporaire } from "@/features/auth/mots-de-passe";
import { confianceProxy, ipClient } from "@/features/limites/ip-client";

describe("politique des mots de passe", () => {
  it("accepte une phrase de passe longue et personnelle", () => {
    expect(defautsMotDePasse("Le pressing haut du mardi soir", { login: "LDURAND", prenom: "Luc", nom: "Durand" })).toEqual([]);
    expect(defautsMotDePasse("E2e-Passw0rd!")).toEqual([]);
  });

  it(`refuse moins de ${LONGUEUR_MIN} caracteres, ou trop peu de caracteres differents`, () => {
    expect(defautsMotDePasse("Court1!")).toContain(`au moins ${LONGUEUR_MIN} caracteres`);
    expect(defautsMotDePasse("aaaaaaaaaaaabbbb")).toContain("au moins 5 caracteres differents");
    expect(defautsMotDePasse("x".repeat(129))).toContain("au plus 128 caracteres");
  });

  it("refuse les mots de passe courants, meme decores", () => {
    for (const mdp of ["azertyuiop12", "Motdepasse2026!", "Bienvenue1234", "Football2026!!"]) {
      expect(defautsMotDePasse(mdp)).toContain("pas un mot de passe courant");
    }
    expect(defautsMotDePasse("123456789012")).toContain("pas uniquement des chiffres");
  });

  it("refuse le login, le prenom ou le nom", () => {
    const compte = { login: "LDURAND", prenom: "Lucien", nom: "Durand" };
    expect(defautsMotDePasse("ldurand-2026-ok", compte)).toContain("ni ton login, ni ton prenom, ni ton nom");
    expect(defautsMotDePasse("Vive LUCIEN et le foot", compte)).toContain("ni ton login, ni ton prenom, ni ton nom");
  });

  it("mot de passe temporaire : aleatoire, lisible, assez long", () => {
    const tires = new Set(Array.from({ length: 200 }, () => motDePasseTemporaire()));
    expect(tires.size).toBe(200);
    for (const mdp of tires) {
      expect(mdp).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{4}(-[a-km-zA-HJ-NP-Z2-9]{4}){3}$/);
      expect(mdp.length).toBeGreaterThanOrEqual(LONGUEUR_MIN);
    }
  });
});

describe("adresse IP du client (limites de debit)", () => {
  const req = (headers: Record<string, string>) => ({ headers, ip: "10.0.0.1" });

  it("l'adresse transmise par le BFF n'est crue qu'avec le secret partage", () => {
    expect(ipClient(req({ "x-fa-bff": "s3cret", "x-fa-client-ip": "203.0.113.7" }), "s3cret")).toBe("203.0.113.7");
    expect(ipClient(req({ "x-fa-bff": "faux", "x-fa-client-ip": "203.0.113.7" }), "s3cret")).toBe("10.0.0.1");
    expect(ipClient(req({ "x-fa-client-ip": "203.0.113.7" }), "s3cret")).toBe("10.0.0.1");
    expect(ipClient(req({ "x-fa-bff": "", "x-fa-client-ip": "203.0.113.7" }), undefined)).toBe("10.0.0.1");
  });

  it("TRUST_PROXY : nombre de sauts, true, ou rien", () => {
    expect(confianceProxy(undefined)).toBe(false);
    expect(confianceProxy("1")).toBe(1);
    expect(confianceProxy("true")).toBe(true);
    expect(confianceProxy("n'importe quoi")).toBe(false);
  });
});
