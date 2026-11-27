// src/features/analyse-jeu/analyse-jeu.controller.ts

import { BadRequestException, Controller, Get, Param, Query } from "@nestjs/common";

import { Acces } from "@/features/acces/acces.decorator";
import { ContexteAcces } from "@/features/acces/contexte-acces";

import { AnalyseJeuService, FiltresJeu } from "./analyse-jeu.service";

const LIEUX = ["tous", "domicile", "exterieur"] as const;
function filtres(q: { equipeId?: string; saisonId?: string; lieu?: string; derniers?: string }): FiltresJeu {
  const lieu = (q.lieu ?? "tous") as FiltresJeu["lieu"];
  if (!(LIEUX as readonly string[]).includes(lieu)) throw new BadRequestException("lieu : tous, domicile ou exterieur.");
  const derniers = q.derniers === undefined || q.derniers === "" ? null : Number(q.derniers);
  if (derniers !== null && (!Number.isInteger(derniers) || derniers < 1 || derniers > 50)) throw new BadRequestException("derniers : un entier de 1 a 50.");
  return { equipeId: q.equipeId, saisonId: q.saisonId, lieu, derniers };
}

@Controller("analyse-jeu")
export class AnalyseJeuController {
  constructor(private svc: AnalyseJeuService) {}

  /** Le jeu de l'equipe sur la saison : buts par tranche, tirs, zones, contextes, discipline. Filtres : lieu, derniers matchs. */
  @Get("club/:clubId/jeu")
  jeu(@Acces() ctx: ContexteAcces, @Param("clubId") clubId: string, @Query() q: { equipeId?: string; saisonId?: string; lieu?: string; derniers?: string }) {
    return this.svc.jeu(ctx, clubId, filtres(q));
  }

  /** Le Data Hub de mon equipe (resultats, attaque, defense, coups de pied arretes, discipline, joueurs, tendance). */
  @Get("club/:clubId/data-hub")
  dataHub(@Acces() ctx: ContexteAcces, @Param("clubId") clubId: string, @Query() q: { equipeId?: string; saisonId?: string; lieu?: string; derniers?: string }) {
    return this.svc.dataHub(ctx, clubId, filtres(q));
  }

  /** Les stats d'un joueur de mon club d'apres le jeu saisi en direct. */
  @Get("joueurs/:joueurId/stats")
  statsJoueur(@Acces() ctx: ContexteAcces, @Param("joueurId") joueurId: string, @Query("saisonId") saisonId?: string) {
    return this.svc.statsDuJoueur(ctx, joueurId, saisonId);
  }

  /** Le jeu saisi croise avec le danger, l'impact des joueurs, la rotation, la charge et le dispositif. */
  @Get("club/:clubId/croisements")
  croisements(@Acces() ctx: ContexteAcces, @Param("clubId") clubId: string, @Query() q: { equipeId?: string; saisonId?: string; lieu?: string; derniers?: string }) {
    return this.svc.croisements(ctx, clubId, filtres(q));
  }

  /** Le jeu d'un adversaire, d'apres nos matchs contre lui. */
  @Get("adversaire")
  adversaire(@Acces() ctx: ContexteAcces, @Query("equipeId") equipeId: string, @Query("adversaireId") adversaireId: string) {
    if (!equipeId || !adversaireId) throw new BadRequestException("equipeId et adversaireId sont requis.");
    return this.svc.adversaire(ctx, equipeId, adversaireId);
  }

  @Get("matchs/:matchId/resume") resume(@Acces() ctx: ContexteAcces, @Param("matchId") matchId: string) { return this.svc.resume(ctx, matchId); }
  @Get("matchs/:matchId/mi-temps") miTemps(@Acces() ctx: ContexteAcces, @Param("matchId") matchId: string) { return this.svc.miTemps(ctx, matchId); }
}
