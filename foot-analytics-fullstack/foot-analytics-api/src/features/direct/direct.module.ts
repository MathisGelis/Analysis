// src/features/direct/direct.module.ts

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AccesModule } from "@/features/acces/acces.module";
import { Club } from "@/features/clubs/club.entity";
import { Equipe } from "@/features/equipes/equipe.entity";
import { Joueur } from "@/features/joueurs/joueur.entity";
import { JoueursModule } from "@/features/joueurs/joueurs.module";
import { Tactique } from "@/features/tactiques/tactique.entity";

import { Utilisateur } from "@/features/utilisateurs/utilisateur.entity";

import { DirectController } from "./direct.controller";
import { Direct } from "./direct.entity";
import { DirectService } from "./direct.service";
import { EvenementDirect } from "./evenement-direct.entity";
import { InvitationDirect } from "./invitation-direct.entity";
import { InvitationGuard } from "./invitation.guard";
import { InvitationsService } from "./invitations.service";
import { SaisieController } from "./saisie.controller";

@Module({
  imports: [AccesModule, JoueursModule, TypeOrmModule.forFeature([Direct, EvenementDirect, Club, Tactique, Joueur, Equipe, InvitationDirect, Utilisateur])],
  controllers: [DirectController, SaisieController],
  providers: [DirectService, InvitationsService, InvitationGuard],
  exports: [DirectService],
})
export class DirectModule {}
