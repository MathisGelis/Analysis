/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Dossier de build configurable : les tests e2e compilent dans .next-e2e
  // pour ne pas ecraser le .next d'un `npm run dev` en cours.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};
export default nextConfig;
