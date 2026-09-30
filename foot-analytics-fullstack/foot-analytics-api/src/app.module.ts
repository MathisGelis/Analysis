// src/app.module.ts
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "@/common/database.module";
import { SeedModule } from "@/seed/seed.module";
import { ClubsModule } from "@/modules/clubs/clubs.module";
import { EquipesModule } from "@/modules/equipes/equipes.module";
import { JoueursModule } from "@/modules/joueurs/joueurs.module";
import { MatchsModule } from "@/modules/matchs/matchs.module";
import { EntrainementsModule } from "@/modules/entrainements/entrainements.module";
import { BlessuresModule } from "@/modules/blessures/blessures.module";
import { ScoutingModule } from "@/modules/scouting/scouting.module";
import { ClassementModule } from "@/modules/classement/classement.module";
import { StatsModule } from "@/modules/stats/stats.module";
import { FmiModule } from "@/modules/fmi/fmi.module";
import { DerivationModule } from "@/modules/derivation/derivation.module";
import { ArbitresModule } from "@/modules/arbitres/arbitres.module";
import { AnalyseModule } from "@/modules/analyse/analyse.module";
import { CoachsModule } from "@/modules/coachs/coachs.module";
import { SaisonsModule } from "@/modules/saisons/saisons.module";
import { AuthModule } from "@/modules/auth/auth.module";
import { JwtAuthGuard } from "@/modules/auth/auth.module";
import { UtilisateursModule } from "@/modules/utilisateurs/utilisateurs.module";
import { BootstrapModule } from "@/modules/bootstrap/bootstrap.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
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
    BootstrapModule,
  ],
  providers: [
    // Guard global : toute requete sous /api requiert un JWT valide.
    // Les routes marquees @Public() (ex: /auth/login) sont epargnees.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
