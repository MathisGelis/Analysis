// src/features/auth/lib/jwt.ts
//
// Decodage (SANS verification de signature) du payload d'un JWT. Sert
// uniquement a pre-filtrer cote UX / middleware ; la verification
// cryptographique reste l'affaire du backend.
//
// N'utilise ni Buffer ni next/headers : compatible navigateur, Node et
// runtime edge (middleware Next).

export interface JwtPayload {
  sub?: string;
  login?: string;
  role?: "admin" | "referent" | "user" | string;
  clubId?: string | null;
  equipeIds?: string[] | null;
  exp?: number;
  /** Version de jeton du compte (revocation, verifiee par l'API). */
  v?: number;
  /** Mot de passe temporaire pas encore change : tout renvoie vers /change-password. */
  doitChanger?: boolean;
}

export function decoderPayloadJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const binaire = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const octets = Uint8Array.from(binaire, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(octets)) as JwtPayload;
  } catch {
    return null;
  }
}
