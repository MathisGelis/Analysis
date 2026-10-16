// src/features/seed/seed.module.ts
import { Module, Controller, Post } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { ALL_ENTITIES } from "@/database/entities";
import { Acces } from "@/features/acces/acces.decorator";
import { AccesModule } from "@/features/acces/acces.module";
import { AccesService } from "@/features/acces/acces.service";
import { ContexteAcces } from "@/features/acces/contexte-acces";
import { JournalAuditService } from "@/features/audit/journal-audit.service";

import { SeedService } from "./seed.service";

@Controller("seed")
class SeedController {
  constructor(private seed: SeedService, private acces: AccesService, private journal: JournalAuditService) {}
  // Reinitialise la base avec les donnees de demonstration : efface les donnees sportives (pas les comptes ni le journal
  // d'audit), donc reserve a l'administrateur, et trace.
  @Post("reset")
  async reset(@Acces() ctx: ContexteAcces) {
    this.acces.exigerAdmin(ctx);
    const r = await this.seed.reset();
    await this.journal.noter("donnees.reinitialisation", { acteur: ctx.compte });
    return r;
  }
}

@Module({
  imports: [TypeOrmModule.forFeature(ALL_ENTITIES), AccesModule],
  controllers: [SeedController],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
