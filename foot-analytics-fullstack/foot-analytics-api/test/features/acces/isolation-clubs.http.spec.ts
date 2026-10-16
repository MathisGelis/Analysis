// Isolation entre clubs, sur toutes les routes de lecture et pour chaque role : la matrice de visibilite
// (features/acces/visibilite.ts) ne se contente pas des routes qu'on a pense a filtrer. Pour chaque compte, on
// parcourt les reponses de toutes les routes GET (et de la recherche) et on y cherche les donnees privees de l'AUTRE
// club : licence, morphologie, fatigue, commentaire, et le contenu de ses blessures. Les donnees medicales ne doivent
// apparaitre, meme pour leur propre club, que sur les routes /blessures (jamais dans les stats, analyses, exports,
// recherches).

import { strFromU8, unzipSync } from "fflate";

import { Composition } from "@/features/matchs/composition.entity";
import { Joueur } from "@/features/joueurs/joueur.entity";
import { AppTest, creerAppTest } from "@test/support/app-test";
import { creerMonde, Monde } from "@test/support/monde";

/** Marqueurs des donnees privees de chaque club (posees dans le monde de test). */
const PRIVE = {
  ol: { textes: ["gaucher, rapide", "Cheville", "Genou", "LICOL0001"], medical: ["Cheville", "Genou"] },
  mions: { textes: ["note privee de Mions", "Epaule", "LICMI0002"], medical: ["Epaule"] },
};
const CHAMPS_PRIVES = ["licence", "dateNaissance", "tailleCm", "poidsKg", "piedFort", "commentaire", "scoreFatigue", "fatigueDetail", "blessuresAnt"];

/** Tous les objets d'une reponse (parcours en profondeur). */
function objets(v: unknown, sortie: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(v)) v.forEach((x) => objets(x, sortie));
  else if (v && typeof v === "object") {
    sortie.push(v as Record<string, unknown>);
    Object.values(v).forEach((x) => objets(x, sortie));
  }
  return sortie;
}

describe("isolation entre clubs : toutes les routes, tous les roles", () => {
  let t: AppTest;
  let m: Monde;

  beforeAll(async () => {
    t = await creerAppTest();
    m = await creerMonde(t);
    const joueurs = t.ds.getRepository(Joueur);
    await joueurs.update(m.joueurOl.id, { licence: "LICOL0001", dateNaissance: "2001-02-03", poidsKg: 75, piedFort: "gauche", blessuresAnt: 2 });
    await joueurs.update(m.joueurMions.id, { licence: "LICMI0002", dateNaissance: "1999-09-09", poidsKg: 80, scoreFatigue: 64, blessuresAnt: 1 });
    // La feuille du match de la saison actuelle, avec les licences des deux cotes.
    const compos = t.ds.getRepository(Composition);
    await compos.save([
      compos.create({ matchId: m.m26.id, cote: "dom", numero: 9, nom: "DURAND", prenom: "Luc", licence: "LICOL0001", titulaire: true, minutes: 90 }),
      compos.create({ matchId: m.m26.id, cote: "ext", numero: 4, nom: "MARTIN", prenom: "Paul", licence: "LICMI0002", titulaire: true, minutes: 90 }),
    ]);
  });
  afterAll(() => t.fermer());

  /** Les routes de lecture, vues d'un compte de `club` (son equipe de la saison actuelle) face a l'autre club. */
  function routes(moi: "ol" | "mions") {
    const autre = moi === "ol" ? m.mions : m.ol;
    const autreJoueur = moi === "ol" ? m.joueurMions : m.joueurOl;
    const monEquipe = moi === "ol" ? m.sen26 : m.mionsSen26;
    const sonEquipe = moi === "ol" ? m.mionsSen26 : m.sen26;
    const chemins = [
      `/joueurs?clubId=${autre.id}`, `/joueurs?clubId=${moi === "ol" ? m.ol.id : m.mions.id}`,
      `/joueurs/${autreJoueur.id}`, `/joueurs/${autreJoueur.id}/historique`, `/joueurs/${autreJoueur.id}/matchs`,
      `/joueurs/${autreJoueur.id}/numeros`,
      `/joueurs/effectif?equipeId=${sonEquipe.id}`, `/joueurs/championnat?equipeId=${sonEquipe.id}`,
      `/joueurs/effectif?equipeId=${monEquipe.id}`, `/joueurs/championnat?equipeId=${monEquipe.id}`,
      "/matchs", `/matchs/${m.m26.id}`, `/matchs/${m.mU20.id}`,
      `/analyse/club/${autre.id}`, `/analyse/club/${autre.id}/situation`, `/analyse/poule?equipeId=${monEquipe.id}`,
      `/analyse/prematch?equipeId=${monEquipe.id}&adversaireId=${autre.id}`,
      `/stats/bilan/${autre.id}`, `/stats/bilan/${moi === "ol" ? m.ol.id : m.mions.id}`,
      "/classement", "/clubs", `/clubs/${autre.id}`, "/equipes", `/equipes/${sonEquipe.id}`,
      "/scouting", `/scouting/club/${autre.id}`, "/coachs", "/arbitres", `/arbitres/match/${m.m26.id}`, `/coachs/match/${m.m26.id}`,
      "/saisons", "/entrainements", `/entrainements?equipeId=${sonEquipe.id}`, `/tactiques?equipeId=${monEquipe.id}`,
      "/auth/me",
    ];
    return { chemins, autreJoueur, autre };
  }

  const comptes = async (club: "ol" | "mions") => {
    const clubId = club === "ol" ? m.ol.id : m.mions.id;
    const equipe = club === "ol" ? m.sen26 : m.mionsSen26;
    return {
      referent: await t.compte({ login: `R${club.toUpperCase()}${Math.random().toString(36).slice(2, 6)}`, role: "referent", clubId }),
      educateur: await t.compte({ login: `E${club.toUpperCase()}${Math.random().toString(36).slice(2, 6)}`, role: "user", clubId, equipeIds: [equipe.id] }),
    };
  };

  for (const club of ["ol", "mions"] as const) {
    it(`compte de ${club} : rien de prive de l'autre club, sur aucune route ; ses propres blessures seulement sur /blessures`, async () => {
      const autreClub = club === "ol" ? "mions" : "ol";
      const { chemins, autreJoueur, autre } = routes(club);
      const tous = await comptes(club);
      for (const [role, compte] of Object.entries(tous)) {
        const appeler = t.appel(compte);
        const reponses: { chemin: string; corps: unknown }[] = [];
        for (const chemin of chemins) {
          const r = await appeler("GET", chemin);
          expect({ chemin, role, statut: r.statut >= 500 ? r.statut : "ok" }).toEqual({ chemin, role, statut: "ok" });
          if (r.statut === 200) reponses.push({ chemin, corps: r.corps });
        }
        for (const q of ["durand", "martin", "LICOL", "LICMI"]) {
          const r = await appeler("POST", "/joueurs/recherche", { q });
          reponses.push({ chemin: `recherche ${q}`, corps: r.corps });
        }

        for (const { chemin, corps } of reponses) {
          const texte = JSON.stringify(corps);
          // Aucune donnee privee de l'autre club, sous aucune forme.
          for (const marqueur of PRIVE[autreClub].textes) {
            expect({ role, chemin, fuite: texte.includes(marqueur) ? marqueur : null }).toEqual({ role, chemin, fuite: null });
          }
          // Mes propres donnees medicales : jamais hors des routes /blessures.
          for (const marqueur of PRIVE[club].medical) {
            expect({ role, chemin, medical: texte.includes(marqueur) ? marqueur : null }).toEqual({ role, chemin, medical: null });
          }
          // Le joueur de l'autre club : partout ou il apparait, ses champs prives sont vides.
          for (const o of objets(corps).filter((o) => o.id === autreJoueur.id)) {
            for (const champ of CHAMPS_PRIVES) {
              expect({ role, chemin, champ, valeur: o[champ] ?? null }).toEqual({ role, chemin, champ, valeur: null });
            }
          }
          // Fatigue moyenne d'un adversaire : jamais calculee sur ses donnees privees.
          for (const o of objets(corps).filter((o) => "fatigueMoy" in o && (o.clubId === autre.id || chemin.includes("prematch")))) {
            expect({ chemin, fatigueMoy: o.fatigueMoy }).toEqual({ chemin, fatigueMoy: null });
          }
        }

        // Les blessures de l'autre club : ni en liste, ni a l'unite.
        const miennes = (await appeler("GET", "/blessures")).corps as any[];
        expect(JSON.stringify(miennes)).not.toMatch(new RegExp(PRIVE[autreClub].medical.join("|")));
        const autreBlessure = club === "ol" ? m.blessureMions : m.blessure26;
        expect((await appeler("GET", `/blessures/${autreBlessure.id}`)).statut).toBe(404);
      }
    });
  }

  it("export PowerPoint du rapport d'avant-match : ni donnee privee de l'adversaire, ni donnee medicale", async () => {
    const { referent } = await comptes("ol");
    const res = await fetch(`${await t.app.getUrl()}/api/analyse/prematch/export?equipeId=${m.sen26.id}&adversaireId=${m.mions.id}`.replace("[::1]", "localhost"), {
      headers: { Authorization: `Bearer ${referent.jeton}` },
    });
    expect(res.status).toBe(200);
    const fichiers = unzipSync(new Uint8Array(await res.arrayBuffer()));
    const texte = Object.entries(fichiers).filter(([nom]) => nom.endsWith(".xml")).map(([, d]) => strFromU8(d)).join("\n");
    for (const marqueur of [...PRIVE.mions.textes, ...PRIVE.ol.medical]) expect({ marqueur, present: texte.includes(marqueur) }).toEqual({ marqueur, present: false });
  });
});
