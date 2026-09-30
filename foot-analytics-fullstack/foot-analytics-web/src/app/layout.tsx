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
import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { NavProgress } from "@/components/NavProgress";
import { FeedbackProvider } from "@/lib/feedback-context";
import { cookies } from "next/headers";
import { ThemeProvider } from "@/lib/theme-context";
import { getServerTheme, themeBootstrapScript } from "@/lib/theme-server";
import { OwnEquipeProvider } from "@/lib/own-equipe-context";
import { OwnClubProvider } from "@/lib/own-club-context";
import { getOwnClubIdServer } from "@/lib/own-club";
import { getOwnEquipeIdServer, getOwnSaisonIdServer } from "@/lib/own-equipe";
import { getCurrentUserServer } from "@/lib/auth";
import { ClubsProvider } from "@/lib/clubs-context";
import { api } from "@/lib/api";

export const metadata: Metadata = {
  title: "Foot Analytics — Console d'entraineur",
  description:
    "Analyse et suivi de saison pour staff de football amateur.",
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
