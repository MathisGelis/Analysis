// src/features/matchs/matchs.module.ts

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AccesModule } from "@/features/acces/acces.module";
import { ClassementModule } from "@/features/classement/classement.module";

import { Composition } from "./composition.entity";
import { EvenementMatch } from "./evenement-match.entity";
import { Match } from "./match.entity";
import { MatchsService } from "./matchs.service";
import { MatchsController } from "./matchs.controller";

@Module({
  imports: [AccesModule, ClassementModule, TypeOrmModule.forFeature([Match, Composition, EvenementMatch])],
  controllers: [MatchsController],
  providers: [MatchsService],
  exports: [MatchsService],
})
export class MatchsModule {}
