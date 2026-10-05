// test/features/ia/ligue.ts
//
// Une ligue synthetique deterministe pour les tests de l'IA : des clubs qui jouent chaque semaine, onze de base fixe
// avec des absences tirees au sort (generateur congruentiel, graine fixe), les remplacants (choisis au hasard) prenant le numero des partis.

import type { EntreesDonnees } from "@/features/ia/ia-donnees";

/** Generateur pseudo-aleatoire congruentiel (Park-Miller) : meme graine, memes tirages. */
export function alea(graine: number): () => number {
  let s = graine % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export interface OptionsLigue {
  clubs?: number;
  semaines?: number;
  /** Probabilite qu'un titulaire de base soit absent un match donne. */
  absence?: number;
  graine?: number;
  /** Annee du debut de saison (premier match le samedi 6 septembre, ou le samedi qui s'en approche). */
  annee?: number;
  /** Part des matchs dont le staff a saisi le dispositif (chaque club a son dispositif favori) ; sinon `formation` ou rien. */
  saisie?: number;
  saisonId?: string;
  /** Dispositif saisi par le staff (tous les matchs), sinon aucun. */
  formation?: string | null;
  /** Prefixe des identifiants de match (plusieurs saisons dans un meme jeu). */
  prefixe?: string;
}

const dateFr = (t: number) => new Date(t).toISOString().slice(0, 10).split("-").reverse().join("/");

export function ligue(o: OptionsLigue = {}): EntreesDonnees {
  const clubs = o.clubs ?? 8;
  const semaines = o.semaines ?? 20;
  const absence = o.absence ?? 0.15;
  const hasard = alea(o.graine ?? 42);
  const saisonId = o.saisonId ?? "s25";
  const prefixe = o.prefixe ?? "m";
  const debut = Date.UTC(o.annee ?? 2025, 8, 6);          // debut de saison : le 6 septembre

  // Dispositif saisi : `formation` partout, ou (option `saisie`) le favori de chaque club dans 80 % des cas, saisi une fois sur `saisie`.
  const FAVORIS = ["4-4-2", "4-3-3", "4-2-3-1", "3-5-2"];
  const formationDe = (club: number): string | null => {
    if (o.saisie === undefined) return o.formation ?? null;
    if (hasard() >= o.saisie) return null;
    return hasard() < 0.8 ? FAVORIS[club % FAVORIS.length] : FAVORIS[(club + 1) % FAVORIS.length];
  };

  const entrees: EntreesDonnees = {
    matchs: [], compos: [],
    clubs: Array.from({ length: clubs }, (_, i) => ({ id: `c${i}`, nom: `Club ${i}` })),
    equipes: Array.from({ length: clubs }, (_, i) => ({ id: `e${i}-${saisonId}`, clubId: `c${i}`, categorie: "Seniors", division: "D2", nom: "Seniors D2 Poule C", saisonId })),
  };

  for (let w = 0; w < semaines; w++) {
    // Tournoi toutes rondes (methode du cercle) : chaque semaine, chaque club joue exactement une fois (nombre de clubs pair).
    const cercle = Array.from({ length: clubs }, (_, k) => (k === 0 ? 0 : 1 + ((k - 1 + w) % (clubs - 1))));
    for (let k = 0; k < clubs / 2; k++) {
      const [i, j] = w % 2 === 0 ? [cercle[k], cercle[clubs - 1 - k]] : [cercle[clubs - 1 - k], cercle[k]];
      const id = `${prefixe}${w}-${i}-${j}`;
      entrees.matchs.push({
        id, date: dateFr(debut + w * 7 * 86_400_000), journee: String(w + 1), saisonId, competition: "Seniors D2",
        clubDom: `c${i}`, clubExt: `c${j}`, equipeDomId: `e${i}-${saisonId}`, equipeExtId: `e${j}-${saisonId}`,
        formationDom: formationDe(i), formationExt: formationDe(j), statut: "joue",
      });
      for (const [club, cote] of [[i, "dom"], [j, "ext"]] as const) {
        const parti = new Set<number>();
        for (let p = 1; p <= 11; p++) if (hasard() < absence) parti.add(p);
        const partis = [...parti];
        // Les remplacants entrent au hasard : le banc est battu, le k-ieme de la liste prend le numero du k-ieme absent.
        const banc = [12, 13, 14, 15, 16];
        for (let k = banc.length - 1; k > 0; k--) { const r = Math.floor(hasard() * (k + 1)); [banc[k], banc[r]] = [banc[r], banc[k]]; }
        const numeroDuRemplacant = new Map(partis.slice(0, banc.length).map((numero, k) => [banc[k], numero]));
        for (let p = 1; p <= 16; p++) {
          const base = p <= 11;
          const remplace = numeroDuRemplacant.has(p);
          const titulaire = base ? !parti.has(p) : remplace;
          entrees.compos.push({
            matchId: id, cote, nom: `JOUEUR${club}X${p}`, prenom: `P${p}`, licence: `L${club}-${p}`,
            numero: remplace ? numeroDuRemplacant.get(p)! : p, titulaire, minutes: titulaire ? 90 : 0,
          });
        }
      }
    }
  }
  return entrees;
}

/** Ecrit une ligue synthetique dans une vraie base (clubs, saison, equipes, matchs, feuilles). */
export async function insererLigue(ds: import("typeorm").DataSource, entrees: EntreesDonnees, saisonNom = "2025-2026", anneeDebut = 2025): Promise<void> {
  const { Club } = await import("@/features/clubs/club.entity");
  const { Saison } = await import("@/features/saisons/saison.entity");
  const { Equipe } = await import("@/features/equipes/equipe.entity");
  const { Match } = await import("@/features/matchs/match.entity");
  const { Composition } = await import("@/features/matchs/composition.entity");

  const saisonId = entrees.equipes[0].saisonId!;
  const existante = await ds.getRepository(Saison).findOne({ where: { id: saisonId } });
  if (!existante) await ds.getRepository(Saison).save({ id: saisonId, nom: saisonNom, anneeDebut, actif: true });
  const clubsExistants = new Set((await ds.getRepository(Club).find({ select: { id: true } })).map((c) => c.id));
  await ds.getRepository(Club).save(entrees.clubs.filter((c) => !clubsExistants.has(c.id)).map((c) => ({ id: c.id, nom: c.nom })));
  await ds.getRepository(Equipe).save(entrees.equipes.map((e) => ({ id: e.id, clubId: e.clubId, nom: e.nom, categorie: e.categorie ?? undefined, division: e.division ?? undefined, saisonId: e.saisonId ?? undefined })));
  await ds.getRepository(Match).save(entrees.matchs.map((m) => ({
    id: m.id, date: m.date ?? undefined, journee: m.journee ?? undefined, saisonId: m.saisonId ?? undefined, competition: m.competition ?? undefined,
    clubDom: m.clubDom, clubExt: m.clubExt, equipeDomId: m.equipeDomId ?? undefined, equipeExtId: m.equipeExtId ?? undefined,
    formationDom: m.formationDom ?? undefined, formationExt: m.formationExt ?? undefined, statut: m.statut ?? "joue", scoreDom: 1, scoreExt: 0,
  })));
  // Par lots : la base de test (sql.js) n'aime pas les milliers de parametres d'un seul INSERT.
  for (let i = 0; i < entrees.compos.length; i += 200) {
    await ds.getRepository(Composition).save(entrees.compos.slice(i, i + 200).map((c) => ({
      matchId: c.matchId, cote: c.cote, nom: c.nom, prenom: c.prenom ?? undefined, licence: c.licence ?? undefined,
      numero: c.numero, titulaire: c.titulaire, minutes: c.minutes ?? 0,
    })));
  }
}
