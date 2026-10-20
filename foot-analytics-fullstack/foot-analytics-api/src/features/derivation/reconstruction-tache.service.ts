// src/features/derivation/reconstruction-tache.service.ts
//
// Reconstruction des donnees derivees (effectifs, classement, arbitres, entraineurs) en TACHE DE FOND. Sur la base
// hebergee, elle peut durer plus de 2 minutes : le relais Vercel -> Render coupe alors la requete (502) alors que le
// travail continue. La route lance donc la tache et repond tout de suite ; l'ecran suit son etat.
//
// Une seule reconstruction a la fois : une demande pendant qu'elle tourne la fait relancer une fois a la fin (pour
// tenir compte des feuilles importees entre-temps), sous le meme identifiant. Les taches ne survivent pas a un
// redemarrage de l'API (une tache inconnue est rapportee comme telle : on peut la relancer).

import { randomUUID } from "crypto";

import { Injectable, Logger } from "@nestjs/common";

import { DerivationService } from "./derivation.service";

export type StatutTache = "en_cours" | "terminee" | "echec";

export interface EtatTache {
  id: string;
  statut: StatutTache;
  debut: string;
  fin: string | null;
  resultat: Awaited<ReturnType<DerivationService["rebuildAll"]>> | null;
  erreur: string | null;
}

/** Taches terminees gardees pour etre relues (les plus recentes). */
const HISTORIQUE = 20;

@Injectable()
export class ReconstructionTacheService {
  private readonly log = new Logger(ReconstructionTacheService.name);
  private readonly taches = new Map<string, EtatTache>();
  private enCours: { id: string; aRelancer: boolean } | null = null;

  constructor(private derivation: DerivationService) {}

  /** Lance la reconstruction (ou rejoint celle qui tourne) et rend son etat initial. */
  lancer(): EtatTache {
    if (this.enCours) {
      this.enCours.aRelancer = true;
      return this.taches.get(this.enCours.id)!;
    }
    const etat: EtatTache = { id: randomUUID(), statut: "en_cours", debut: new Date().toISOString(), fin: null, resultat: null, erreur: null };
    this.taches.set(etat.id, etat);
    this.enCours = { id: etat.id, aRelancer: false };
    void this.executer(etat);
    this.oublierAnciennes();
    return etat;
  }

  etat(id: string): EtatTache | null {
    return this.taches.get(id) ?? null;
  }

  private async executer(etat: EtatTache): Promise<void> {
    try {
      do {
        this.enCours!.aRelancer = false;
        etat.resultat = await this.derivation.rebuildAll();
      } while (this.enCours!.aRelancer);
      etat.statut = "terminee";
    } catch (e) {
      etat.statut = "echec";
      etat.erreur = (e as Error).message;
      this.log.error(`Reconstruction en tache de fond echouee : ${etat.erreur}`);
    } finally {
      etat.fin = new Date().toISOString();
      this.enCours = null;
    }
  }

  private oublierAnciennes() {
    const finies = [...this.taches.values()].filter((t) => t.statut !== "en_cours");
    for (const t of finies.slice(0, Math.max(0, finies.length - HISTORIQUE))) this.taches.delete(t.id);
  }
}
