// src/features/apres-match/apres-match.service.ts
//
// L'apres-match de MON equipe : la note de chaque joueur (staff seulement), la note de l'arbitre, les blessures signalees en direct
// et le bilan de l'entraineur. Le temps de jeu et les faits de chaque joueur viennent du direct (voir temps-de-jeu.ts).

import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { AccesService } from "@/features/acces/acces.service";
import { ContexteAcces } from "@/features/acces/contexte-acces";
import { ArbitreMatch } from "@/features/arbitres/arbitre-match.entity";
import { Arbitre } from "@/features/arbitres/arbitre.entity";
import { JournalAuditService } from "@/features/audit/journal-audit.service";
import { minuteDe } from "@/features/direct/chrono";
import { Direct } from "@/features/direct/direct.entity";
import { DirectService, etatDe, monCote } from "@/features/direct/direct.service";
import { EvenementDirect } from "@/features/direct/evenement-direct.entity";
import { Match } from "@/features/matchs/match.entity";

import { BilanDto, NoteJoueurDto } from "./apres-match.dto";
import { BilanMatch } from "./bilan-match.entity";
import { NoteJoueurMatch } from "./note-joueur-match.entity";
import { fichesDuMatch } from "./temps-de-jeu";

const ROLES_ARBITRE: Record<string, string> = { principal: "Arbitre", assistant1: "Assistant 1", assistant2: "Assistant 2", "4e": "4e arbitre" };

@Injectable()
export class ApresMatchService {
  constructor(
    @InjectRepository(NoteJoueurMatch) private notes: Repository<NoteJoueurMatch>,
    @InjectRepository(BilanMatch) private bilans: Repository<BilanMatch>,
    @InjectRepository(Direct) private directs: Repository<Direct>,
    @InjectRepository(EvenementDirect) private evenements: Repository<EvenementDirect>,
    @InjectRepository(ArbitreMatch) private arbitresMatch: Repository<ArbitreMatch>,
    @InjectRepository(Arbitre) private arbitres: Repository<Arbitre>,
    private direct: DirectService,
    private acces: AccesService,
    private journal: JournalAuditService,
  ) {}

  /** Mon match, mon cote, mon club : l'apres-match n'existe que pour un match de mon equipe qui a eu lieu. */
  private async contexte(ctx: ContexteAcces, matchId: string) {
    const m = await this.acces.matchGere(ctx, matchId);
    const cote = monCote(ctx, m);
    const d = await this.directs.findOne({ where: { matchId } });
    if (m.statut !== "joue" && (!d || d.statut === "avant")) throw new ConflictException("Le match n'a pas encore eu lieu : l'apres-match s'ouvre apres le coup d'envoi.");
    return { m, cote, d, equipeId: (cote === "dom" ? m.equipeDomId : m.equipeExtId) ?? null, clubId: cote === "dom" ? m.clubDom : m.clubExt };
  }

  async etat(ctx: ContexteAcces, matchId: string, maintenant = Date.now()) {
    const { m, cote, d, equipeId, clubId } = await this.contexte(ctx, matchId);
    const [evs, notes, bilan, liens, joueurs] = await Promise.all([
      this.evenements.find({ where: { matchId } }),
      this.notes.find({ where: { matchId, clubId } }),
      this.bilans.findOne({ where: { id: `${matchId}:${clubId}` } }),
      this.arbitresMatch.find({ where: { matchId } }),
      equipeId ? this.direct.joueursDe(equipeId, matchId) : Promise.resolve([]),
    ]);
    const vivants = evs.filter((e) => !e.supprimeLe);
    const duree = d ? d.dureePeriodeMin * 2 : 90;
    const fin = d && d.statut !== "avant" ? Math.min(minuteDe(etatDe(d), maintenant), 200) : duree;
    // La fin du match : la minute du chrono, la duree reglementaire une fois termine, et jamais avant le dernier evenement saisi.
    const derniere = vivants.reduce((max, e) => Math.max(max, e.minute), 0);
    const fiches = fichesDuMatch(joueurs, vivants as any, cote, Math.max(d?.statut === "termine" ? Math.max(fin, duree) : fin, derniere));
    const notesParJoueur = new Map(notes.map((n) => [n.joueurId, n]));

    const lignes = joueurs
      .map((j) => ({ ...j, ...fiches.get(j.id)!, note: notesParJoueur.get(j.id)?.note ?? null, commentaire: notesParJoueur.get(j.id)?.commentaire ?? null }))
      .filter((j) => j.aJoue || j.note !== null || j.commentaire)
      .sort((a, b) => Number(b.aJoue) - Number(a.aJoue) || (a.numero ?? 99) - (b.numero ?? 99));

    const noms = new Map((await this.arbitres.findByIds(liens.map((l) => l.arbitreId))).map((a) => [a.id, a]));
    const arbitres = liens.map((l) => ({
      lienId: l.id, arbitreId: l.arbitreId, nom: [noms.get(l.arbitreId)?.prenom, noms.get(l.arbitreId)?.nom].filter(Boolean).join(" ") || "Arbitre",
      role: l.role, libelleRole: ROLES_ARBITRE[l.role] ?? l.role, note: l.note ?? null,
    }));

    const blessures = vivants.filter((e) => e.cote === cote && e.type === "blessure").sort((a, b) => a.minute - b.minute)
      .map((e) => ({ id: e.id, minute: e.minute, periode: e.periode, joueurId: e.joueurId, joueurNom: e.joueurNom, joueurNumero: e.joueurNumero }));

    const aNote = lignes.filter((j) => j.aJoue);
    return {
      match: { id: m.id, clubDom: m.clubDom, clubExt: m.clubExt, scoreDom: m.scoreDom, scoreExt: m.scoreExt, statut: m.statut },
      nousCote: cote,
      statutDirect: d?.statut ?? null,
      clotureLe: d?.clotureLe ?? null,
      joueurs: lignes,
      arbitres,
      blessures,
      bilan: { positifs: bilan?.positifs ?? "", aTravailler: bilan?.aTravailler ?? "", bilan: bilan?.bilan ?? "" },
      avancement: {
        notes: aNote.filter((j) => j.note !== null).length, joueurs: aNote.length,
        arbitre: arbitres.length === 0 ? null : arbitres.some((a) => a.note !== null),
        bilan: !!(bilan?.positifs || bilan?.aTravailler || bilan?.bilan),
      },
    };
  }

  /** La note (et le commentaire) d'un joueur de mon equipe ; une note vide l'efface. */
  async noterJoueur(ctx: ContexteAcces, matchId: string, joueurId: string, dto: NoteJoueurDto) {
    const { m, clubId, equipeId } = await this.contexte(ctx, matchId);
    const effectif = equipeId ? await this.direct.joueursDe(equipeId, matchId) : [];
    if (!effectif.some((j) => j.id === joueurId)) throw new NotFoundException("Ce joueur n'est pas dans l'effectif de cette equipe pour ce match.");
    const id = `${matchId}:${joueurId}`;
    const existante = await this.notes.findOne({ where: { id } });
    const n = this.notes.create({ ...(existante ?? { id, matchId, joueurId, clubId }), auteurId: ctx.compte.id });
    if (dto.note !== undefined) n.note = dto.note;
    if (dto.commentaire !== undefined) n.commentaire = dto.commentaire?.trim() || null;
    const saved = await this.notes.save(n);
    // Une note n'est pas un secret de journal : on ne garde que le fait qu'elle ait changé (jamais sa valeur ni le commentaire).
    await this.journal.noter("apres_match.note_joueur", { acteur: ctx.compte, cible: `match:${m.id}`, cibleClubId: clubId, details: { joueur: joueurId } });
    return { joueurId, note: saved.note, commentaire: saved.commentaire };
  }

  async enregistrerBilan(ctx: ContexteAcces, matchId: string, dto: BilanDto) {
    const { m, clubId } = await this.contexte(ctx, matchId);
    const id = `${matchId}:${clubId}`;
    const existant = await this.bilans.findOne({ where: { id } });
    const b = this.bilans.create({ ...(existant ?? { id, matchId, clubId }), auteurId: ctx.compte.id });
    for (const k of ["positifs", "aTravailler", "bilan"] as const) if (dto[k] !== undefined) b[k] = dto[k]?.trim() || null;
    await this.bilans.save(b);
    await this.journal.noter("apres_match.bilan", { acteur: ctx.compte, cible: `match:${m.id}`, cibleClubId: clubId, details: {} });
    return { positifs: b.positifs ?? "", aTravailler: b.aTravailler ?? "", bilan: b.bilan ?? "" };
  }
}

