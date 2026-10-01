// src/seed/seed.module.ts
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Controller, Post } from "@nestjs/common";
import { ALL_ENTITIES } from "@/entities";
import { SeedService } from "./seed.service";
import { Acces, AccesModule, AccesService, ContexteAcces } from "@/modules/acces/acces.module";

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
