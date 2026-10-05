import { describe, expect, it } from "vitest";

import { ApiError, messageApi } from "@/shared/lib/api";

describe("messageApi", () => {
  it("renvoie la raison donnee par l'API", () => {
    const e = new ApiError(409, "/matchs", { message: "Ce match est deja programme a cette date", statusCode: 409 });
    expect(messageApi(e)).toBe("Ce match est deja programme a cette date");
  });

  it("assemble les messages de validation", () => {
    const e = new ApiError(400, "/matchs", { message: ["clubDom doit etre une chaine", "clubExt doit etre une chaine"] });
    expect(messageApi(e)).toBe("clubDom doit etre une chaine ; clubExt doit etre une chaine");
  });

  it("l'erreur porte elle-meme la raison : un refus 403 s'explique partout ou on affiche e.message", () => {
    const e = new ApiError(403, "/matchs/abc", { message: "Ce match ne concerne pas ton club.", statusCode: 403 });
    expect(e.message).toBe("Ce match ne concerne pas ton club.");
    expect([e.statut, e.chemin]).toEqual([403, "/matchs/abc"]);
    expect(new ApiError(400, "/matchs", { message: ["a", "b"] }).message).toBe("a ; b");
  });

  it("sans raison dans le corps : message technique, puis valeur par defaut", () => {
    expect(messageApi(new ApiError(500, "/matchs", null))).toBe("API 500 sur /matchs");
    expect(new ApiError(403, "/matchs/abc", { statusCode: 403 }).message).toBe("API 403 sur /matchs/abc");
    expect(messageApi(new Error("reseau coupe"))).toBe("reseau coupe");
    expect(messageApi(undefined, "Erreur inconnue")).toBe("Erreur inconnue");
  });
});
