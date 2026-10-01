// src/features/blessures/blessures.module.ts

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { DerivationModule } from "@/features/derivation/derivation.module";
import { AccesModule } from "@/features/acces/acces.module";

import { Blessure } from "./blessure.entity";
import { BlessuresService } from "./blessures.service";
import { BlessuresController } from "./blessures.controller";

@Module({
  imports: [AccesModule, TypeOrmModule.forFeature([Blessure]), DerivationModule],
  controllers: [BlessuresController],
  providers: [BlessuresService],
})
export class BlessuresModule {}
