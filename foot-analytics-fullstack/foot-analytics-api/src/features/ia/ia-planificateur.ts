// src/features/ia/ia-planificateur.ts
//
// Le reveil du reentrainement automatique : toutes les dix minutes, demande a IaService s'il y a quelque chose a lancer
// (voir ia-planning.ts pour le calendrier et la regle de rattrapage). Tourne en production, ou quand IA_PLANIFICATEUR=on ;
// jamais pendant les tests ni en developpement, sauf demande (IA_PLANIFICATEUR=on). IA_PLANIFICATEUR=off l'arrete partout.

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";

import { IaService } from "./ia.service";
import { planificateurActif } from "./ia-planning";

const INTERVALLE_MS = 10 * 60_000;
/** Premier controle un peu apres le demarrage, pour ne pas ralentir le lancement du serveur. */
const PREMIER_CONTROLE_MS = 60_000;

@Injectable()
export class IaPlanificateur implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("IA");
  private minuteur: NodeJS.Timeout | null = null;
  private premier: NodeJS.Timeout | null = null;

  constructor(private readonly ia: IaService) {}

  onModuleInit(): void {
    if (!planificateurActif()) return;
    this.premier = setTimeout(() => void this.controler(), PREMIER_CONTROLE_MS);
    this.minuteur = setInterval(() => void this.controler(), INTERVALLE_MS);
    // Les minuteurs ne retiennent pas le processus : un arret propre n'attend jamais le prochain controle.
    this.premier.unref();
    this.minuteur.unref();
    this.log.log("Reentrainement automatique : controle toutes les 10 minutes (chaque mercredi a 5 h, heure de Paris).");
  }

  onModuleDestroy(): void {
    if (this.premier) clearTimeout(this.premier);
    if (this.minuteur) clearInterval(this.minuteur);
    this.premier = this.minuteur = null;
  }

  private async controler(): Promise<void> {
    try {
      await this.ia.verifierPlanning();
    } catch (e) {
      this.log.error(`controle du planning : ${(e as Error).message}`);
    }
  }
}
