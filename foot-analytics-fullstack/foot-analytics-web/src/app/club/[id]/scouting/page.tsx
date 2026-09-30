// src/app/club/[id]/scouting/page.tsx
//
// Deep-link direct vers l'onglet "Rapport scouting" de la page club.
// Memes donnees / meme composant que /club/[id] avec initialTab="scouting".

import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { getOwnClubIdServer } from "@/lib/own-club";
import { ClubTabs } from "@/components/ClubTabs";

export default async function ScoutingPage({ params }: { params: { id: string } }) {
  const CLUB_PROPRE_ID = getOwnClubIdServer();
  const [clubs, classement, equipes, joueurs, matchs, rapport, bilanApi] =
    await Promise.all([
      api.clubs(),
      api.classement(),
      api.equipes(params.id),
      api.joueurs(params.id),
      api.matchs(params.id),
      api.rapportClub(params.id),
      api.bilan(params.id),
    ]);

  // On accepte le rapport demo de repli meme si le club n'est pas en base
  // (le panneau scouting construit alors un placeholder).
  const club = clubs.find((c) => c.id === params.id) ?? (rapport ? {
    id: rapport.clubId, nom: rapport.equipeNom,
    abbr: (rapport.equipeNom ?? "?").slice(0,3).toUpperCase(),
    couleur: "#5ab8ff",
  } as any : null);
  if (!club) notFound();

  const parseDate = (s?: string | null): number => {
    if (!s) return 0;
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
    m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
    return 0;
  };
  const resultats = matchs
    .map((m) => {
      const dom = m.clubDom === club.id;
      const advId = dom ? m.clubExt : m.clubDom;
      const adv = clubs.find((c) => c.id === advId);
      return {
        matchId: m.id, journee: m.journee ?? "—",
        date: m.date ?? "",
        lieu: dom ? "Domicile" : "Extérieur" as "Domicile" | "Extérieur",
        adversaire: adv?.nom ?? advId, adversaireId: advId,
        butsMarques: dom ? m.scoreDom : m.scoreExt,
        butsEncaisses: dom ? m.scoreExt : m.scoreDom,
      };
    })
    .sort((a, b) => parseDate(a.date) - parseDate(b.date));

  // Si le rapport est de demo (clubId = "neuv" mais pas en base), on utilise
  // ses resultats embarques comme fallback.
  const finalResultats = resultats.length ? resultats : (rapport?.resultats ?? []).map((r: any, i: number) => ({
    matchId: `demo-${i}`, journee: r.journee, lieu: r.lieu,
    adversaire: r.adversaire, adversaireId: r.advClub ?? "",
    butsMarques: r.butsMarques, butsEncaisses: r.butsEncaisses,
  }));

  const bilan = bilanApi ?? {
    joues: finalResultats.length,
    v: finalResultats.filter((r: any) => r.butsMarques > r.butsEncaisses).length,
    n: finalResultats.filter((r: any) => r.butsMarques === r.butsEncaisses).length,
    d: finalResultats.filter((r: any) => r.butsMarques < r.butsEncaisses).length,
    bp: finalResultats.reduce((s: number, r: any) => s + r.butsMarques, 0),
    bc: finalResultats.reduce((s: number, r: any) => s + r.butsEncaisses, 0),
    forme: finalResultats.slice(-5).map((r: any) =>
      r.butsMarques > r.butsEncaisses ? "V" : r.butsMarques === r.butsEncaisses ? "N" : "D",
    ),
  };

  return (
    <ClubTabs
      club={club}
      equipe={equipes[0]}
      ligne={classement.find((l) => l.clubId === club.id)}
      bilan={bilan as any}
      resultats={finalResultats}
      joueurs={joueurs}
      rapport={rapport}
      isMine={club.id === CLUB_PROPRE_ID}
      initialTab="scouting"
    />
  );
}
