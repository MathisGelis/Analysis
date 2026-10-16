import { afterEach, describe, expect, it, vi } from "vitest";

import {
  accesARenouveler, COOKIE_ACCES, COOKIE_HERITE, COOKIE_RAFRAICHISSEMENT, effacerSession, entetesBff, ipNavigateur,
  optionsCookie, origineEtrangere, poserJetons,
} from "@/features/auth/lib/session-serveur";

function pot() {
  const poses = new Map<string, { valeur: string; options: any }>();
  const effaces: string[] = [];
  return {
    poses, effaces,
    set: (nom: string, valeur: string, options?: any) => { poses.set(nom, { valeur, options }); },
    delete: (nom: string) => { effaces.push(nom); },
  };
}

const requete = (methode: string, entetes: Record<string, string>, hote = "app.example") => ({
  method: methode, headers: new Headers(entetes), nextUrl: { host: hote } as any,
});

afterEach(() => { vi.unstubAllEnvs(); });

describe("cookies de session", () => {
  it("HttpOnly, SameSite=Lax, chemin racine ; Secure en production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(optionsCookie(900)).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 900 });
    vi.stubEnv("NODE_ENV", "development");
    expect(optionsCookie(900).secure).toBe(false);
  });

  it("pose le jeton d'acces et, s'il y en a un, le jeton de rafraichissement ; efface l'ancien cookie lisible", () => {
    const p = pot();
    poserJetons(p, { token: "acces", refreshToken: "rafraichissement", expiresIn: 900 });
    expect(p.poses.get(COOKIE_ACCES)).toMatchObject({ valeur: "acces", options: { httpOnly: true, maxAge: 900 } });
    expect(p.poses.get(COOKIE_RAFRAICHISSEMENT)).toMatchObject({ valeur: "rafraichissement", options: { httpOnly: true } });
    expect(p.effaces).toContain(COOKIE_HERITE);

    const simultane = pot();
    poserJetons(simultane, { token: "acces2", refreshToken: null, expiresIn: 900 });
    expect(simultane.poses.has(COOKIE_RAFRAICHISSEMENT)).toBe(false);       // le jeton deja pose reste valable
  });

  it("deconnexion : jetons effaces, et la selection si demande", () => {
    const p = pot();
    effacerSession(p, true);
    expect(p.effaces).toEqual(expect.arrayContaining([COOKIE_ACCES, COOKIE_RAFRAICHISSEMENT, COOKIE_HERITE, "ownEquipeId", "ownClubId"]));
  });
});

describe("jeton d'acces a renouveler", () => {
  it("absent, sans expiration, expire ou expirant dans moins de 30 s", () => {
    const maintenant = 1_000_000_000_000;
    expect(accesARenouveler(null, maintenant)).toBe(true);
    expect(accesARenouveler({}, maintenant)).toBe(true);
    expect(accesARenouveler({ exp: maintenant / 1000 + 10 }, maintenant)).toBe(true);
    expect(accesARenouveler({ exp: maintenant / 1000 + 600 }, maintenant)).toBe(false);
  });
});

describe("requetes d'un autre site", () => {
  it("une ecriture depuis une autre origine est refusee, pas une lecture", () => {
    expect(origineEtrangere(requete("POST", { origin: "https://evil.example" }))).toBe(true);
    expect(origineEtrangere(requete("POST", { origin: "https://app.example" }))).toBe(false);
    expect(origineEtrangere(requete("GET", { origin: "https://evil.example" }))).toBe(false);
    expect(origineEtrangere(requete("DELETE", { "sec-fetch-site": "cross-site" }))).toBe(true);
    expect(origineEtrangere(requete("PATCH", { "sec-fetch-site": "same-origin" }))).toBe(false);
  });
});

describe("adresse du navigateur transmise a l'API", () => {
  it("seulement avec le secret partage ; jamais les en-tetes fournis par le client", () => {
    const depuis = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
    expect(ipNavigateur(depuis)).toBe("203.0.113.7");

    const sans = new Headers({ "x-fa-bff": "invente", "x-fa-client-ip": "1.2.3.4" });
    entetesBff(sans, depuis);
    expect(sans.has("x-fa-bff")).toBe(false);
    expect(sans.has("x-fa-client-ip")).toBe(false);

    vi.stubEnv("BFF_SECRET", "s3cret");
    const avec = new Headers();
    entetesBff(avec, depuis);
    expect(avec.get("x-fa-bff")).toBe("s3cret");
    expect(avec.get("x-fa-client-ip")).toBe("203.0.113.7");
  });
});
