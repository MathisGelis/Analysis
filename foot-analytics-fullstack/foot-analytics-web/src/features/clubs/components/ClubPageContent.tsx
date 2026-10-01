// src/features/clubs/components/ClubPageContent.tsx
//
// Contenu serveur partage par /club/[id] et /club/[id]/scouting (meme page,
// onglet initial different). Charge tout cote serveur, delegue le rendu au
// composant client ClubTabs.
//
// Filtrage par saison : les matchs, joueurs, classement et bilan sont
// restreints a la saison selectionnee dans le switcher global (= cookie
// ownSaisonId). Sans ca, on melangeait toutes les saisons.

import { notFound } from "next/navigation";

import { api } from "@/shared/lib/api";
import { getOwnClubIdServer } from "@/features/equipes/lib/own-club";
import { getOwnSaisonIdServer } from "@/features/equipes/lib/own-equipe";
import { resolveEquipePropre } from "@/features/equipes/lib/resolve-equipe-propre";
import { memeChampionnat } from "@/features/equipes/lib/empreinte-equipe";
import { equipeConsultee } from "@/features/equipes/lib/equipe-consultee";
import { ligneDuClub } from "@/features/classement/lib/classement";
import { parseDateMatch } from "@/features/matchs/lib/matchs-equipe";

import { ClubTabs } from "./ClubTabs";

export async function ClubPageContent({
  id, initialTab,
}: { id: string; initialTab: "overview" | "scouting" }) {
  const params = { id };
  const CLUB_PROPRE_ID = await getOwnClubIdServer();
  const ownSaisonId = await getOwnSaisonIdServer();

  // Saison effective : switcher > active > aucune. Elle cadre tout le reste.
  const saisons = await api.saisons();
  const saisonActive = saisons.find((s: any) => s.actif);
  const saisonChoisieId = ownSaisonId ?? saisonActive?.id ?? null;
  const saisonChoisie = saisons.find((s: any) => s.id === saisonChoisieId);

  const [clubs, classement, equipesAll, joueursAll, matchsAll, rapport] =
    await Promise.all([
      api.clubs(),
      api.classement(),
      api.equipes(),
      api.joueurs(params.id),
      api.matchs(),
      // Un rapport de scouting est date : on ne montre que celui de la saison.
      api.rapportClub(params.id, saisonChoisieId),
    ]);

  // Repli demo : un rapport de scouting peut exister pour un club absent de la
  // base (jeu d'exemple) ; le panneau construit alors un placeholder.
  const club = clubs.find((c) => c.id === params.id) ?? (rapport ? {
    id: rapport.clubId, nom: rapport.equipeNom,
    abbr: (rapport.equipeNom ?? "?").slice(0, 3).toUpperCase(),
    couleur: "#5ab8ff",
  } as any : null);
  if (!club) notFound();

  // Filtrage par saison selectionnee :
  //  - matchs : on garde uniquement ceux de la saison choisie
  //  - equipes : on garde uniquement celles de la saison choisie (utile
  //    a l'effectif consulte, qui est par equipe)
  //  - joueurs : effectif de l'equipe consultee (stats de SA saison, jamais les
  //    compteurs globaux) ; `joueursAll` ne sert qu'a relier un nom a sa fiche
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
  const equipeVue = equipeConsultee({
    equipes: equipesAll, clubId: club.id, saisonId: saisonChoisieId, maEquipe,
  });

  // Effectif, situation (dispositif joue, dernier onze) et, pour mon club, dernier plan enregistre (dispositif prevu).
  const estMonClub = club.id === CLUB_PROPRE_ID;
  const [effectif, situation, plan] = await Promise.all([
    equipeVue ? api.effectifEquipe(equipeVue.id) : Promise.resolve([]),
    api.situationClub(club.id, { equipeId: equipeVue?.id, saisonId: saisonChoisieId }),
    estMonClub && equipeVue ? api.tactique(equipeVue.id) : Promise.resolve(null),
  ]);

  const matchsSaison = saisonChoisieId
    ? matchsAll.filter((m: any) => (m.saisonId ?? null) === saisonChoisieId)
    : matchsAll;
  const matchs = equipeVue
    ? matchsSaison.filter((m: any) =>
        m.equipeDomId === equipeVue.id || m.equipeExtId === equipeVue.id)
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

  // Bilan : recalcule sur les matchs de l'equipe consultee et de la saison choisie.
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
  const bilan = bilanLocal;

  return (
    <ClubTabs
      club={club}
      equipe={equipeVue ?? undefined}
      ligne={ligneSaison}
      totalClasses={totalClasses}
      bilan={bilan as any}
      resultats={resultats}
      joueurs={effectif}
      annuaire={joueursAll}
      rapport={rapport}
      situation={situation}
      planFormation={plan?.formation ?? null}
      isMine={estMonClub}
      initialTab={initialTab}
      saisonNom={saisonChoisie?.nom ?? null}
      saisonActif={saisonChoisie?.actif ?? false}
    />
  );
}
