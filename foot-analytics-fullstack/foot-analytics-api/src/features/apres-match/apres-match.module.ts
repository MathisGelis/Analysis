// src/features/apres-match/apres-match.module.ts

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AccesModule } from "@/features/acces/acces.module";
import { ArbitreMatch } from "@/features/arbitres/arbitre-match.entity";
import { Arbitre } from "@/features/arbitres/arbitre.entity";
import { Direct } from "@/features/direct/direct.entity";
import { DirectModule } from "@/features/direct/direct.module";
import { EvenementDirect } from "@/features/direct/evenement-direct.entity";

import { ApresMatchController } from "./apres-match.controller";
import { ApresMatchService } from "./apres-match.service";
import { BilanMatch } from "./bilan-match.entity";
import { NoteJoueurMatch } from "./note-joueur-match.entity";

@Module({
  imports: [AccesModule, DirectModule, TypeOrmModule.forFeature([NoteJoueurMatch, BilanMatch, Direct, EvenementDirect, ArbitreMatch, Arbitre])],
  controllers: [ApresMatchController],
  providers: [ApresMatchService],
})
export class ApresMatchModule {}
