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

  it("sans raison dans le corps : message technique, puis valeur par defaut", () => {
    expect(messageApi(new ApiError(500, "/matchs", null))).toBe("API 500 sur /matchs");
    expect(messageApi(new Error("reseau coupe"))).toBe("reseau coupe");
    expect(messageApi(undefined, "Erreur inconnue")).toBe("Erreur inconnue");
  });
});
