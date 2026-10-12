// src/features/arbitres/arbitres.module.ts

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "@/features/auth/auth.module";
import { AccesModule } from "@/features/acces/acces.module";

import { Arbitre } from "./arbitre.entity";
import { ArbitreMatch } from "./arbitre-match.entity";
import { ArbitresService } from "./arbitres.service";
import { ArbitresController } from "./arbitres.controller";

@Module({
  imports: [AccesModule, TypeOrmModule.forFeature([Arbitre, ArbitreMatch]), AuthModule],
  controllers: [ArbitresController],
  providers: [ArbitresService],
  exports: [ArbitresService],
})
export class ArbitresModule {}
