// src/seed/seed.module.ts
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Controller, Post } from "@nestjs/common";
import { ALL_ENTITIES } from "@/entities";
import { SeedService } from "./seed.service";

@Controller("seed")
class SeedController {
  constructor(private seed: SeedService) {}
  // Reinitialise la base avec les donnees de demonstration.
  @Post("reset")
  reset() {
    return this.seed.reset();
  }
}

@Module({
  imports: [TypeOrmModule.forFeature(ALL_ENTITIES)],
  controllers: [SeedController],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
