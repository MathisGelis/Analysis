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
import { cookies } from "next/headers";

import { AppShell } from "@/features/shell/components/AppShell";
import { NavProgress } from "@/features/shell/components/NavProgress";
import { FeedbackProvider } from "@/shared/lib/feedback-context";
import { ThemeProvider } from "@/features/shell/lib/theme-context";
import { getServerTheme, themeBootstrapScript } from "@/features/shell/lib/theme-server";
import { OwnEquipeProvider } from "@/features/equipes/lib/own-equipe-context";
import { OwnClubProvider } from "@/features/equipes/lib/own-club-context";
import { getOwnClubIdServer } from "@/features/equipes/lib/own-club";
import { getOwnEquipeIdServer, getOwnSaisonIdServer } from "@/features/equipes/lib/own-equipe";
import { getCurrentUserServer } from "@/features/auth/lib/auth";
import { ClubsProvider } from "@/features/clubs/lib/clubs-context";
import { api } from "@/shared/lib/api";

export const metadata: Metadata = {
  title: "Foot Analytics — Console d'entraineur",
  description:
    "Analyse et suivi de saison pour staff de football amateur.",
};

// Couleur de la barre du navigateur mobile : celle du fond, nuit ou jour (valeurs litterales
// obligatoires ici : cette meta ne lit pas les variables CSS).
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#070A12" },
    { media: "(prefers-color-scheme: light)", color: "#F4F6FB" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const initialTheme = getServerTheme();
  // Utilisateur connecte (jeton present et non expire) : la coquille de l'app
  // (barre laterale, recherche, selecteur d'equipe) n'a de sens qu'apres
  // connexion. Sur /login elle affichait "Non connecte" et declenchait des
  // appels API refuses.
  const connecte = (await getCurrentUserServer()) !== null;
  // Clubs pour les ecussons (ClubBadge n'a que l'id du club).
  const clubs = connecte ? await api.clubs() : [];
  // Lecture cookies serveur -> injectee dans les providers.
  // Ces valeurs se rafraichissent a chaque router.refresh(), donc quand
  // le switcher persist un nouveau choix + refresh, tout le Client tree
  // reste synchro avec le serveur.
  const initialClubId = getOwnClubIdServer();
  const initialEquipeId = getOwnEquipeIdServer();
  const initialSaisonId = getOwnSaisonIdServer();

  return (
    <html lang="fr" data-theme={initialTheme} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body>
        <ThemeProvider initialTheme={initialTheme}>
          <OwnClubProvider value={initialClubId}>
            <OwnEquipeProvider
              initialEquipeId={initialEquipeId}
              initialSaisonId={initialSaisonId}
            >
              <ClubsProvider clubs={clubs}>
              <FeedbackProvider>
              <NavProgress />
              {connecte ? (
                <AppShell sidebarRepliee={cookies().get("fa_sidebar")?.value === "replie"}>
                  {children}
                </AppShell>
              ) : (
                <main className="relative z-10">{children}</main>
              )}
              </FeedbackProvider>
              </ClubsProvider>
            </OwnEquipeProvider>
          </OwnClubProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
