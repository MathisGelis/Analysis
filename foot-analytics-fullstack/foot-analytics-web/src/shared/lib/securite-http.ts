// src/shared/lib/securite-http.ts
//
// En-tetes de securite du front (fonctions pures) :
//   - Content-Security-Policy par nonce, posee par le middleware a chaque page : seuls les scripts du site portant le
//     nonce de la requete s'executent (une injection de <script> est inerte), aucune ressource externe (pas de CDN, pas
//     d'analytics, pas de pixel), pas d'iframe du site ailleurs (frame-ancestors) ;
//   - les en-tetes statiques (nosniff, referrer, permissions, HSTS, noindex) sont dans next.config.mjs.

/** Nonce aleatoire d'une requete (base64). */
export function nouveauNonce(): string {
  return btoa(crypto.randomUUID());
}

/**
 * Politique CSP. En developpement, React Refresh a besoin d'eval et du websocket du serveur de dev. Les styles
 * acceptent 'unsafe-inline' (attributs style={{...}} des composants) : sans risque d'execution de code.
 */
export function politiqueCsp(nonce: string, dev = false): string {
  const directives: string[] = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    // Application installable : son manifeste et son service worker (public/sw.js), servis par le site lui-meme.
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  return directives.join("; ");
}
