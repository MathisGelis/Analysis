// src/features/seed/seed.module.ts
import { Module, Controller, Post } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { ALL_ENTITIES } from "@/database/entities";
import { Acces } from "@/features/acces/acces.decorator";
import { AccesModule } from "@/features/acces/acces.module";
import { AccesService } from "@/features/acces/acces.service";
import { ContexteAcces } from "@/features/acces/contexte-acces";

import { SeedService } from "./seed.service";

@Controller("seed")
class SeedController {
  constructor(private seed: SeedService, private acces: AccesService) {}
  // Reinitialise la base avec les donnees de demonstration : efface TOUT, donc reserve a l'administrateur.
  @Post("reset")
  reset(@Acces() ctx: ContexteAcces) {
    this.acces.exigerAdmin(ctx);
    return this.seed.reset();
  }
}

@Module({
  imports: [TypeOrmModule.forFeature(ALL_ENTITIES), AccesModule],
  controllers: [SeedController],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
