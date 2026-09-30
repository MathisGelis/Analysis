// src/app/layout.tsx
//
// Layout racine : pose le theme dark/light avant le rendu (anti-flash),
// monte les Providers (theme, club, equipe) EN INJECTANT LES VALEURS
// LUES DEPUIS LES COOKIES cote serveur. Sans ca, les Client Components
// recoivent null au 1er rendu et retombent sur des fallbacks bugges.

import "./globals.css";
import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { ThemeProvider } from "@/lib/theme-context";
import { getServerTheme, themeBootstrapScript } from "@/lib/theme-server";
import { OwnEquipeProvider } from "@/lib/own-equipe-context";
import { OwnClubProvider } from "@/lib/own-club-context";
import { getOwnClubIdServer } from "@/lib/own-club";
import { getOwnEquipeIdServer, getOwnSaisonIdServer } from "@/lib/own-equipe";

export const metadata: Metadata = {
  title: "Foot Analytics — Console d'entraineur",
  description:
    "Analyse et suivi de saison pour staff de football amateur.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const initialTheme = getServerTheme();
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
              <div className="flex min-h-screen">
                <Sidebar />
                <main className="flex-1 min-w-0 relative z-10">
                  <TopBar />
                  <div className="px-6 py-6">{children}</div>
                </main>
              </div>
            </OwnEquipeProvider>
          </OwnClubProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
