// src/features/analyse/situation.service.ts
//
// Situation d'une equipe d'apres ses derniers matchs : le dispositif qu'elle joue (d'apres ceux que le staff a
// renseignes) et son dernier onze (celui de la feuille du dernier match joue). Alimente la fiche club et son
// rapport de scouting, a la place des valeurs figees d'un ancien rapport.

import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { Club } from "@/features/clubs/club.entity";
import { Composition } from "@/features/matchs/composition.entity";
import { Joueur } from "@/features/joueurs/joueur.entity";
import { Match } from "@/features/matchs/match.entity";
import { estMatchJoue } from "@/features/matchs/match-joue";
import { normaliser } from "@/common/fuzzy";

import {
  coteDe, DernierMatch, plusRecentsDAbord, SituationSysteme, systemeDe, versDernierMatch,
} from "./situation-equipe";

export interface JoueurOnze {
  numero: number; nom: string; prenom: string | null; licence: string | null;
  /** Fiche du joueur dans la base, quand on la retrouve (licence, sinon nom dans le club). */
  joueurId: string | null; poste: string | null;
  capitaine: boolean; minutes: number;
}

export interface SituationClub {
  clubId: string; equipeId: string | null; saisonId: string | null;
  systeme: SituationSysteme;
  /** Le dernier match joue (dispositif renseigne ou non). */
  dernierMatch: DernierMatch | null;
  /** Le dernier match dont la feuille donne les titulaires, avec le onze et le banc. */
  dernierOnze: { match: DernierMatch; titulaires: JoueurOnze[]; remplacants: JoueurOnze[] } | null;
}

@Injectable()
export class SituationService {
  constructor(
    @InjectRepository(Club) private clubs: Repository<Club>,
    @InjectRepository(Match) private matchs: Repository<Match>,
    @InjectRepository(Composition) private compos: Repository<Composition>,
    @InjectRepository(Joueur) private joueurs: Repository<Joueur>,
  ) {}

  async situation(clubId: string, portee: { equipeId?: string | null; saisonId?: string | null } = {}): Promise<SituationClub> {
    if (!(await this.clubs.findOne({ where: { id: clubId } }))) throw new NotFoundException(`Club ${clubId} introuvable`);
    const cible = { clubId, equipeId: portee.equipeId || null };
    const saisonId = portee.saisonId || null;
    const filtreSaison = saisonId ? { saisonId } : {};
    const tous = await this.matchs.find({ where: [{ ...filtreSaison, clubDom: clubId }, { ...filtreSaison, clubExt: clubId }] });
    const joues = tous.filter(estMatchJoue).filter((m) =>
      !cible.equipeId || m.equipeDomId === cible.equipeId || m.equipeExtId === cible.equipeId);

    const recents = plusRecentsDAbord(joues);
    let dernierOnze: SituationClub["dernierOnze"] = null;
    for (const m of recents) {
      const cote = coteDe(m, cible);
      const lignes = await this.compos.find({ where: { matchId: m.id, cote } });
      if (!lignes.some((c) => c.titulaire)) continue;      // feuille sans onze : on remonte au match precedent
      const fiches = await this.fichesDe(clubId, lignes);
      const vers = (c: Composition): JoueurOnze => {
        const fiche = fiches.get(c.id) ?? null;
        return {
          numero: c.numero, nom: c.nom, prenom: c.prenom ?? null, licence: c.licence ?? null,
          joueurId: fiche?.id ?? null, poste: fiche?.poste ?? null, capitaine: !!c.capitaine, minutes: c.minutes ?? 0,
        };
      };
      const parNumero = (a: JoueurOnze, b: JoueurOnze) => a.numero - b.numero || a.nom.localeCompare(b.nom);
      dernierOnze = {
        match: versDernierMatch(m, cible),
        titulaires: lignes.filter((c) => c.titulaire).map(vers).sort(parNumero),
        // Le banc : ceux qui sont entres en jeu d'abord (un remplacant qui n'a pas joue n'apporte rien au scouting).
        remplacants: lignes.filter((c) => !c.titulaire).map(vers).sort((a, b) => (b.minutes > 0 ? 1 : 0) - (a.minutes > 0 ? 1 : 0) || parNumero(a, b)),
      };
      break;
    }

    return {
      clubId, equipeId: cible.equipeId, saisonId,
      systeme: systemeDe(joues, cible),
      dernierMatch: recents[0] ? versDernierMatch(recents[0], cible) : null,
      dernierOnze,
    };
  }

  /** Fiche de chaque ligne de feuille : par licence, sinon par nom (et initiale du prenom) dans le club. */
  private async fichesDe(clubId: string, lignes: Composition[]): Promise<Map<string, Joueur>> {
    const licences = [...new Set(lignes.map((c) => c.licence).filter((l): l is string => !!l))];
    const [parLicence, duClub] = await Promise.all([
      licences.length ? this.joueurs.find({ where: { licence: In(licences) } }) : Promise.resolve([] as Joueur[]),
      this.joueurs.find({ where: { clubId } }),
    ]);
    const idxLicence = new Map(parLicence.map((j) => [j.licence, j]));
    const resultat = new Map<string, Joueur>();
    for (const c of lignes) {
      const trouve = (c.licence && idxLicence.get(c.licence))
        || duClub.find((j) => normaliser(j.nom) === normaliser(c.nom)
          && (!c.prenom || !j.prenom || normaliser(j.prenom).startsWith(normaliser(c.prenom).charAt(0))));
      if (trouve) resultat.set(c.id, trouve);
    }
    return resultat;
  }
}
