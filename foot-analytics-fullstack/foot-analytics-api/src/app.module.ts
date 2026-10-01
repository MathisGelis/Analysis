// src/app.module.ts
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";

import { DatabaseModule } from "@/database/database.module";
import { SeedModule } from "@/features/seed/seed.module";
import { ClubsModule } from "@/features/clubs/clubs.module";
import { EquipesModule } from "@/features/equipes/equipes.module";
import { JoueursModule } from "@/features/joueurs/joueurs.module";
import { MatchsModule } from "@/features/matchs/matchs.module";
import { EntrainementsModule } from "@/features/entrainements/entrainements.module";
import { BlessuresModule } from "@/features/blessures/blessures.module";
import { ScoutingModule } from "@/features/scouting/scouting.module";
import { ClassementModule } from "@/features/classement/classement.module";
import { StatsModule } from "@/features/stats/stats.module";
import { FmiModule } from "@/features/fmi/fmi.module";
import { DerivationModule } from "@/features/derivation/derivation.module";
import { ArbitresModule } from "@/features/arbitres/arbitres.module";
import { AnalyseModule } from "@/features/analyse/analyse.module";
import { CoachsModule } from "@/features/coachs/coachs.module";
import { SaisonsModule } from "@/features/saisons/saisons.module";
import { AuthModule } from "@/features/auth/auth.module";
import { JwtAuthGuard } from "@/features/auth/auth.guards";
import { AccesGuard } from "@/features/acces/acces.guard";
import { AccesModule } from "@/features/acces/acces.module";
import { UtilisateursModule } from "@/features/utilisateurs/utilisateurs.module";
import { TactiquesModule } from "@/features/tactiques/tactiques.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AccesModule,
    SeedModule,
    ClubsModule,
    EquipesModule,
    JoueursModule,
    MatchsModule,
    EntrainementsModule,
    BlessuresModule,
    ScoutingModule,
    ClassementModule,
    StatsModule,
    FmiModule,
    DerivationModule,
    ArbitresModule,
    AnalyseModule,
    CoachsModule,
    SaisonsModule,
    AuthModule,
    UtilisateursModule,
    TactiquesModule,
  ],
  providers: [
    // Guard global : toute requete sous /api requiert un JWT valide.
    // Les routes marquees @Public() (ex: /auth/login) sont epargnees.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Puis le perimetre du compte (role, club, equipes, saisons), lu en base : voir features/acces.
    { provide: APP_GUARD, useClass: AccesGuard },
  ],
})
export class AppModule {}
