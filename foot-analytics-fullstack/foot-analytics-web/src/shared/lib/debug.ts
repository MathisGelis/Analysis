// src/shared/lib/debug.ts
//
// Journal de diagnostic du front. Silencieux par defaut : on l'active avec
// NEXT_PUBLIC_DEBUG=1 (variable lue au build cote client, au demarrage cote
// serveur). Les avertissements et erreurs reelles restent en console.warn /
// console.error directement, ils ne passent pas par ici.

const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "1";

export const debug = (...args: unknown[]): void => {
  if (DEBUG) console.debug(...args);
};
