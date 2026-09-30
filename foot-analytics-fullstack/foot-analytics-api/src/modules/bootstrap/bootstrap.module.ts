// src/modules/bootstrap/bootstrap.module.ts
//
// Bootstrap automatique des donnees minimales au demarrage :
//  - Saison "2026-2027" creee si absente (devient active si aucune
//    saison n'est marquee active)
//
// Appele depuis main.ts apres l'init Nest. Idempotent : peut etre
// execute a chaque demarrage sans creer de doublon.

import { Injectable, Module } from "@nestjs/common";
import { InjectRepository, TypeOrmModule } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Saison } from "@/entities";

@Injectable()
export class BootstrapService {
  constructor(
    @InjectRepository(Saison) private saisons: Repository<Saison>,
  ) {}

  /**
   * Cree la saison 2026-2027 si elle n'existe pas. Si aucune saison
   * n'est encore marquee active, la nouvelle saison devient active
   * (cas frequent : 1er demarrage en juin 2026 avant le debut des
   * championnats 2026-2027).
   */
  async bootstrapSaisonsParDefaut(): Promise<void> {
    const NOM = "2026-2027";
    const existante = await this.saisons.findOne({ where: { nom: NOM } });
    if (existante) return;

    const aucuneActive = (await this.saisons.count({ where: { actif: true } })) === 0;
    const s = this.saisons.create({
      nom: NOM,
      anneeDebut: 2026,
      actif: aucuneActive,
      statut: "a_venir",
    });
    await this.saisons.save(s);
    // eslint-disable-next-line no-console
    console.log(
      `[bootstrap] Saison ${NOM} creee${aucuneActive ? " (active par defaut)" : ""}.`,
    );
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Saison])],
  providers: [BootstrapService],
  exports: [BootstrapService],
})
export class BootstrapModule {}
