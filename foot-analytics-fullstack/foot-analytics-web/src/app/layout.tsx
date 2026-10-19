// src/app/layout.tsx
//
// Layout racine : pose le theme dark/light avant le rendu (anti-flash),
// monte les Providers (theme, club, equipe) EN INJECTANT LES VALEURS
// LUES DEPUIS LES COOKIES cote serveur. Sans ca, les Client Components
// recoivent null au 1er rendu et retombent sur des fallbacks bugges.

import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/jetbrains-mono";

import "./globals.css";

import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";

import { AppShell } from "@/features/shell/components/AppShell";
import { EnregistrementPwa } from "@/features/shell/components/EnregistrementPwa";
import { NavProgress } from "@/features/shell/components/NavProgress";
import { FeedbackProvider } from "@/shared/lib/feedback-context";
import { ThemeProvider } from "@/features/shell/lib/theme-context";
import { getServerTheme, themeBootstrapScript } from "@/features/shell/lib/theme-server";
import { OwnEquipeProvider } from "@/features/equipes/lib/own-equipe-context";
import { OwnClubProvider } from "@/features/equipes/lib/own-club-context";
import { getOwnClubIdServer } from "@/features/equipes/lib/own-club";
import { getOwnEquipeIdServer, getOwnSaisonIdServer } from "@/features/equipes/lib/own-equipe";
import { getCurrentUserServer, type User } from "@/features/auth/lib/auth";
import { SessionProvider } from "@/features/auth/lib/session-context";
import { AccesProvider } from "@/features/shell/lib/acces-context";
import { ClubsProvider } from "@/features/clubs/lib/clubs-context";
import { api } from "@/shared/lib/api";

export const metadata: Metadata = {
  title: "Foot Analytics — Console d'entraineur",
  description:
    "Analyse et suivi de saison pour staff de football amateur.",
  // Application privee : aucune page indexee (voir aussi robots.txt et l'en-tete X-Robots-Tag).
  robots: { index: false, follow: false, nocache: true },
  // Application installable (PWA, voir app/manifest.ts) : ballon en favicon et sur l'ecran d'accueil ; sur iPhone,
  // ouverte depuis l'ecran d'accueil, elle s'affiche sans la barre de Safari.
  applicationName: "Foot Analytics",
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "32x32" },
    ],
    apple: { url: "/icons/apple-touch-icon.png", sizes: "180x180" },
  },
  appleWebApp: { capable: true, title: "Foot Analytics", statusBarStyle: "black" },
  formatDetection: { telephone: false },
};

// Couleur de la barre du navigateur mobile : celle du fond, nuit ou jour (valeurs litterales
// obligatoires ici : cette meta ne lit pas les variables CSS).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#070A12" },
    { media: "(prefers-color-scheme: light)", color: "#F4F6FB" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const initialTheme = await getServerTheme();
  // Utilisateur connecte (jeton present et non expire) : la coquille de l'app
  // (barre laterale, recherche, selecteur d'equipe) n'a de sens qu'apres
  // connexion. Sur /login elle affichait "Non connecte" et declenchait des
  // appels API refuses.
  // Un compte au mot de passe temporaire n'a encore acces a rien : pas de coquille, seulement /change-password.
  const utilisateur = await getCurrentUserServer();
  const connecte = utilisateur !== null && !utilisateur.doitChanger;
  // Clubs pour les ecussons (ClubBadge n'a que l'id du club) ; saisons pour la navigation (pages fermees sur une saison passee).
  const [clubs, saisons] = connecte ? await Promise.all([api.clubs(), api.saisons()]) : [[], []];
  // Profil pour les Client Components (nom, role...), lu avec le jeton du cookie HttpOnly.
  const profil: User | null = utilisateur ? await api.authMe().catch(() => null) : null;
  // Lecture cookies serveur -> injectee dans les providers.
  // Ces valeurs se rafraichissent a chaque router.refresh(), donc quand
  // le switcher persist un nouveau choix + refresh, tout le Client tree
  // reste synchro avec le serveur.
  const initialClubId = await getOwnClubIdServer();
  const initialEquipeId = await getOwnEquipeIdServer();
  const initialSaisonId = await getOwnSaisonIdServer();
  const sidebarRepliee = (await cookies()).get("fa_sidebar")?.value === "replie";
  // Nonce de la Content-Security-Policy (pose par le middleware) : seul ce script inline est autorise.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="fr" data-theme={initialTheme} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body>
        <ThemeProvider initialTheme={initialTheme}>
          <SessionProvider utilisateur={profil}>
          <OwnClubProvider value={initialClubId}>
            <OwnEquipeProvider
              initialEquipeId={initialEquipeId}
              initialSaisonId={initialSaisonId}
            >
              <ClubsProvider clubs={clubs}>
              <AccesProvider saisons={saisons} role={utilisateur?.role ?? null}>
              <FeedbackProvider>
              <NavProgress />
              <EnregistrementPwa />
              {connecte ? (
                <AppShell sidebarRepliee={sidebarRepliee}>
                  {children}
                </AppShell>
              ) : (
                <main className="relative z-10">{children}</main>
              )}
              </FeedbackProvider>
              </AccesProvider>
              </ClubsProvider>
            </OwnEquipeProvider>
          </OwnClubProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
