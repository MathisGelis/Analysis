// src/features/shell/components/GardePage.tsx
//
// Entoure une page fermee a certains comptes ou a certaines saisons (voir lib/acces-pages.ts) : si elle l'est, on affiche
// PageIndisponible a la place, et la page n'est meme pas rendue (aucune donnee lue pour rien).

import { verdictPage } from "../lib/garde-page";
import { PageIndisponible } from "./PageIndisponible";

export async function GardePage({ chemin, page, children }: { chemin: string; page: string; children: React.ReactNode }) {
  const verdict = await verdictPage(chemin);
  if (verdict.restriction) return <PageIndisponible page={page} verdict={{ ...verdict, restriction: verdict.restriction }} />;
  return <>{children}</>;
}
