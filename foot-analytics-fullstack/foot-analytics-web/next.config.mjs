// Configuration Next. En-tetes de securite statiques poses sur toutes les reponses ; la Content-Security-Policy (par
// nonce, differente a chaque requete) est posee par le middleware (voir src/shared/lib/securite-http.ts).

/** En-tetes de securite communs a toutes les reponses. */
export function entetesSecurite(production) {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    // Application privee : jamais indexee par les moteurs de recherche (voir aussi robots.txt).
    { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
    ...(production ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
  ];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Dossier de build configurable : les tests e2e compilent dans .next-e2e
  // pour ne pas ecraser le .next d'un `npm run dev` en cours.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Anciennes adresses : redirigees ICI, avant tout rendu (une page qui ne fait que `redirect()` coute un premier rendu serveur,
  // puis un second : 75 requetes au lieu de 38 pour ouvrir /rapports). Voir aussi app/rapports/equipe/page.tsx (repli sans cookie).
  async redirects() {
    return [
      // /ia (avec ou sans ?adversaire=) est redirigee par le middleware : une redirection de la config recopie la requete d'origine
      // dans l'adresse de destination (/rapports/prematch/<id>?adversaire=<id>).
      { source: "/scouting", destination: "/rapports", permanent: false },
      // Le rapport de mon equipe : celui de mon club (cookie pose par le middleware).
      { source: "/rapports/equipe", has: [{ type: "cookie", key: "ownClubId", value: "(?<club>[\\w-]+)" }], destination: "/rapports/equipe/:club", permanent: false },
    ];
  },
  async headers() {
    return [
      { source: "/:path*", headers: entetesSecurite(process.env.NODE_ENV === "production") },
      // Service worker : toujours revalide, pour qu'une nouvelle version soit prise des la visite suivante.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};
export default nextConfig;
