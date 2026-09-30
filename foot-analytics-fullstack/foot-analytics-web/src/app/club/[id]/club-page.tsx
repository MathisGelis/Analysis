// src/app/club/[id]/club-page.tsx
//
// Contenu serveur partage par /club/[id] et /club/[id]/scouting (meme page,
// onglet initial different). Charge tout cote serveur, delegue le rendu au
// composant client ClubTabs.
//
// Filtrage par saison : les matchs, joueurs, classement et bilan sont
// restreints a la saison selectionnee dans le switcher global (= cookie
// ownSaisonId). Sans ca, on melangeait toutes les saisons.

import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { getOwnClubIdServer } from "@/lib/own-club";
import { getOwnSaisonIdServer } from "@/lib/own-equipe";
import { ClubTabs } from "@/components/ClubTabs";
import { resolveEquipePropre } from "@/lib/resolve-equipe-propre";
import { memeChampionnat } from "@/lib/empreinte-equipe";
import { ligneDuClub } from "@/lib/classement";
import { parseDateMatch } from "@/lib/matchs-equipe";

export async function ClubPageContent({
  id, initialTab,
}: { id: string; initialTab: "overview" | "scouting" }) {
  const params = { id };
  const CLUB_PROPRE_ID = getOwnClubIdServer();
  const ownSaisonId = getOwnSaisonIdServer();

  const [clubs, classement, equipesAll, joueursAll, matchsAll, rapport, bilanApi, saisons] =
    await Promise.all([
      api.clubs(),
      api.classement(),
      api.equipes(),
      api.joueurs(params.id),
      api.matchs(),
      api.rapportClub(params.id),
      api.bilan(params.id),
      api.saisons(),
    ]);

  // Repli demo : un rapport de scouting peut exister pour un club absent de la
  // base (jeu d'exemple) ; le panneau construit alors un placeholder.
  const club = clubs.find((c) => c.id === params.id) ?? (rapport ? {
    id: rapport.clubId, nom: rapport.equipeNom,
    abbr: (rapport.equipeNom ?? "?").slice(0, 3).toUpperCase(),
    couleur: "#5ab8ff",
  } as any : null);
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
  // Equipe du club consultee : celle qui joue dans le MEME championnat que
  // mon equipe (comparer deux clubs d'une meme poule), sinon la premiere du
  // club sur la saison. Sans ca, la fiche additionnait les matchs de toutes
  // les equipes du club (Seniors + U20...) et affichait le rang de la
  // premiere ligne trouvee.
  const { equipe: maEquipe } = await resolveEquipePropre({
    equipes: equipesAll, saisons, matchs: matchsAll,
  });
  const equipes = equipesAll.filter((e: any) =>
    e.clubId === club.id && (!saisonChoisieId || (e.saisonId ?? null) === saisonChoisieId));
  const equipeConsultee =
    (maEquipe ? equipes.find((e: any) => memeChampionnat(e, maEquipe)) : null)
    ?? equipes[0] ?? null;

  const matchsSaison = saisonChoisieId
    ? matchsAll.filter((m: any) => (m.saisonId ?? null) === saisonChoisieId)
    : matchsAll;
  const matchs = equipeConsultee
    ? matchsSaison.filter((m: any) =>
        m.equipeDomId === equipeConsultee.id || m.equipeExtId === equipeConsultee.id)
    : matchsSaison.filter((m: any) => m.clubDom === club.id || m.clubExt === club.id);
  const ligneSaison = ligneDuClub(classement, equipesAll, club.id, saisonChoisieId, maEquipe)
    ?? undefined;

  // Nombre d'equipes classees dans le championnat de cette ligne (denominateur du rang).
  const equipeDeLaLigne = equipesAll.find((e: any) => e.id === ligneSaison?.equipeId);
  const totalClasses = equipeDeLaLigne
    ? classement.filter((l: any) => {
        const e = equipesAll.find((x: any) => x.id === l.equipeId);
        return !!e && memeChampionnat(e, equipeDeLaLigne);
      }).length
    : undefined;

  // Resultats normalises (du point de vue du club consulte).
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
    .sort((a, b) => parseDateMatch(a.date) - parseDateMatch(b.date));

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
      equipe={equipeConsultee ?? undefined}
      ligne={ligneSaison}
      totalClasses={totalClasses}
      bilan={bilan as any}
      resultats={resultats}
      joueurs={joueursAll}
      rapport={rapport}
      isMine={club.id === CLUB_PROPRE_ID}
      initialTab={initialTab}
      saisonNom={saisonChoisie?.nom ?? null}
      saisonActif={saisonChoisie?.actif ?? false}
    />
  );
}
