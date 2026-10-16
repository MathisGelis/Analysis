import { describe, expect, it } from "vitest";

import { nouveauNonce, politiqueCsp } from "@/shared/lib/securite-http";
import { entetesSecurite } from "../../../next.config.mjs";

describe("Content-Security-Policy", () => {
  it("scripts du site seulement, avec le nonce de la requete ; aucune ressource externe ; pas d'iframe", () => {
    const csp = politiqueCsp("abc123");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toMatch(/https?:\/\//);       // ni CDN, ni analytics, ni pixel
  });

  it("developpement : eval et websocket du rechargement a chaud", () => {
    const csp = politiqueCsp("n", true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("ws:");
  });

  it("un nonce different a chaque requete", () => {
    expect(nouveauNonce()).not.toBe(nouveauNonce());
  });
});

describe("en-tetes de securite statiques", () => {
  it("nosniff, pas d'iframe, noindex ; HSTS en production seulement", () => {
    const prod = Object.fromEntries(entetesSecurite(true).map((h: { key: string; value: string }) => [h.key, h.value]));
    expect(prod["X-Content-Type-Options"]).toBe("nosniff");
    expect(prod["X-Frame-Options"]).toBe("DENY");
    expect(prod["X-Robots-Tag"]).toContain("noindex");
    expect(prod["Strict-Transport-Security"]).toContain("max-age=");
    expect(entetesSecurite(false).some((h: { key: string }) => h.key === "Strict-Transport-Security")).toBe(false);
  });
});
