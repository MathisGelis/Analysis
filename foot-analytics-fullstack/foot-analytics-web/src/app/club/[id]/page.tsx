// src/app/club/[id]/page.tsx
//
// Page club a onglets : Vue d'ensemble, Effectif, Matchs, Rapport scouting.
// Charge tout cote serveur, delegue le rendu au composant client ClubTabs.
//
// Filtrage par saison : les matchs, joueurs, classement et bilan sont
// restreints a la saison selectionnee dans le switcher global (= cookie
// ownSaisonId). Sans ca, on melangeait toutes les saisons.

import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { getOwnClubIdServer } from "@/lib/own-club";
import { getOwnSaisonIdServer } from "@/lib/own-equipe";
import { ClubTabs } from "@/components/ClubTabs";

export default async function ClubPage({ params }: { params: { id: string } }) {
  const CLUB_PROPRE_ID = getOwnClubIdServer();
  const ownSaisonId = getOwnSaisonIdServer();

  const [clubs, classement, equipesAll, joueursAll, matchsAll, rapport, bilanApi, saisons] =
    await Promise.all([
      api.clubs(),
      api.classement(),
      api.equipes(params.id),
      api.joueurs(params.id),
      api.matchs(params.id),
      api.rapportClub(params.id),
      api.bilan(params.id),
      api.saisons(),
    ]);

  const club = clubs.find((c) => c.id === params.id);
  if (!club) notFound();

  // Saison effective : switcher > active > aucune. Si aucune saison
  // resolue, pas de filtrage (degenere).
  const saisonActive = saisons.find((s: any) => s.actif);
  const saisonChoisieId = ownSaisonId ?? saisonActive?.id ?? null;
  const saisonChoisie = saisons.find((s: any) => s.id === saisonChoisieId);

  // Filtrage par saison selectionnee :
  //  - matchs : on garde uniquement ceux de la saison choisie
  //  - equipes : on garde uniquement celles de la saison choisie (utile
  //    a l'effectif consulte, qui est par equipe)
  //  - joueurs : on les filtre indirectement via les matchs (joueurs
  //    ayant compose au moins une fois cette saison). Pour rester
  //    pragmatique, on garde joueursAll : la fiche joueur filtrera via
  //    son historique. C'est l'effectif vu d'ici qui est filtré.
  //  - classement : on prend la ligne du club POUR la saison choisie
  //  - bilan : recalcul local sur les matchs filtres si saison choisie
  const matchs = saisonChoisieId
    ? matchsAll.filter((m: any) => (m.saisonId ?? null) === saisonChoisieId)
    : matchsAll;
  const equipes = saisonChoisieId
    ? equipesAll.filter((e: any) => (e.saisonId ?? null) === saisonChoisieId)
    : equipesAll;
  const ligneSaison = saisonChoisieId
    ? classement.find((l: any) => l.clubId === club.id && (l.saisonId ?? null) === saisonChoisieId)
    : classement.find((l: any) => l.clubId === club.id);

  // Resultats normalises (du point de vue du club consulte).
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
        matchId: m.id,
        journee: m.journee ?? "—",
        date: m.date ?? "",
        lieu: dom ? "Domicile" : "Extérieur" as "Domicile" | "Extérieur",
        adversaire: adv?.nom ?? advId,
        adversaireId: advId,
        butsMarques: dom ? m.scoreDom : m.scoreExt,
        butsEncaisses: dom ? m.scoreExt : m.scoreDom,
      };
    })
    .sort((a, b) => parseDate(a.date) - parseDate(b.date));

  // Bilan : si saison choisie, recalcul local sur les matchs filtres.
  // Sinon, garder bilanApi (global toutes saisons) si dispo.
  const bilanLocal = {
    joues: resultats.length,
    v: resultats.filter((r) => r.butsMarques > r.butsEncaisses).length,
    n: resultats.filter((r) => r.butsMarques === r.butsEncaisses).length,
    d: resultats.filter((r) => r.butsMarques < r.butsEncaisses).length,
    bp: resultats.reduce((s, r) => s + r.butsMarques, 0),
    bc: resultats.reduce((s, r) => s + r.butsEncaisses, 0),
    forme: resultats.slice(-5).map((r) =>
      r.butsMarques > r.butsEncaisses ? "V" : r.butsMarques === r.butsEncaisses ? "N" : "D",
    ),
  };
  const bilan = saisonChoisieId ? bilanLocal : (bilanApi ?? bilanLocal);

  return (
    <ClubTabs
      club={club}
      equipe={equipes[0]}
      ligne={ligneSaison}
      bilan={bilan as any}
      resultats={resultats}
      joueurs={joueursAll}
      rapport={rapport}
      isMine={club.id === CLUB_PROPRE_ID}
      initialTab="overview"
      saisonNom={saisonChoisie?.nom ?? null}
      saisonActif={saisonChoisie?.actif ?? false}
    />
  );
}
