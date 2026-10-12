// src/features/fmi/fmi.module.ts

import { Module } from "@nestjs/common";

import { MatchsModule } from "@/features/matchs/matchs.module";
import { ClubsModule } from "@/features/clubs/clubs.module";
import { DerivationModule } from "@/features/derivation/derivation.module";
import { ArbitresModule } from "@/features/arbitres/arbitres.module";
import { CoachsModule } from "@/features/coachs/coachs.module";
import { EquipesModule } from "@/features/equipes/equipes.module";
import { SaisonsModule } from "@/features/saisons/saisons.module";

import { FmiService } from "./fmi.service";
import { FmiController } from "./fmi.controller";

@Module({
  imports: [MatchsModule, ClubsModule, DerivationModule, ArbitresModule, CoachsModule, EquipesModule, SaisonsModule],
  controllers: [FmiController],
  providers: [FmiService],
})
export class FmiModule {}
