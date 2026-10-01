// test/support/app-test.ts
//
// Application COMPLETE (vrais modules, vrais gardes) sur une base de test neuve, ecoutant sur un port libre, pour les
// tests d'acces : on y appelle l'API avec les jetons de vrais comptes (admin, referent, educateur) et on verifie
// ce que chacun peut lire et ecrire. Aucune route n'est mockee.
//
//   const t = await creerAppTest();            // afterEach(() => t.fermer())
//   const monde = await t.monde();             // 2 clubs, 3 saisons, equipes, matchs...
//   const educ = await t.compte({ login: "LDURAND", role: "user", clubId: monde.ol.id, toutesSaisons: false });
//   const r = await t.appel(educ)("GET", "/matchs");     // { statut: 200, corps: [...] }

import "reflect-metadata";
import { INestApplication, Module, ValidationPipe } from "@nestjs/common";
import { NestFactory, APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataSource, DeepPartial } from "typeorm";

import { Utilisateur } from "@/features/utilisateurs/utilisateur.entity";
import { AccesGuard } from "@/features/acces/acces.guard";
import { AccesModule } from "@/features/acces/acces.module";
import { AuthModule } from "@/features/auth/auth.module";
import { AuthService } from "@/features/auth/auth.service";
import { JwtAuthGuard } from "@/features/auth/auth.guards";
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
import { UtilisateursModule } from "@/features/utilisateurs/utilisateurs.module";
import { TactiquesModule } from "@/features/tactiques/tactiques.module";
import { SeedModule } from "@/features/seed/seed.module";

import { fabriques, optionsBaseTest } from "./test-db";

export interface Reponse<T = any> { statut: number; corps: T }
export type Appeler = (methode: string, chemin: string, corps?: unknown) => Promise<Reponse>;

export interface AppTest {
  app: INestApplication;
  ds: DataSource;
  f: ReturnType<typeof fabriques>;
  /** Cree un compte (mot de passe fictif) et le renvoie avec son jeton. */
  compte(extra: DeepPartial<Utilisateur> & { login: string; role: string }): Promise<{ user: Utilisateur; jeton: string }>;
  /** Un client HTTP authentifie par ce jeton ; sans jeton, anonyme. */
  appel(compte?: { jeton: string }): Appeler;
  fermer(): Promise<void>;
}

export async function creerAppTest(): Promise<AppTest> {
  process.env.AUTO_SEED = "false";             // pas de donnees de demonstration : le test construit son propre monde
  const { options, supprimer } = await optionsBaseTest();

  @Module({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      TypeOrmModule.forRoot(options),
      AccesModule, SeedModule, ClubsModule, EquipesModule, JoueursModule, MatchsModule, EntrainementsModule,
      BlessuresModule, ScoutingModule, ClassementModule, StatsModule, FmiModule, DerivationModule, ArbitresModule,
      AnalyseModule, CoachsModule, SaisonsModule, AuthModule, UtilisateursModule, TactiquesModule,
    ],
    providers: [
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: APP_GUARD, useClass: AccesGuard },
    ],
  })
  class AppDeTest {}

  const app = await NestFactory.create(AppDeTest, { logger: false });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }));
  await app.listen(0);
  const base = `${await app.getUrl()}/api`.replace("[::1]", "localhost");
  const ds = app.get(DataSource);
  const auth = app.get(AuthService);

  return {
    app, ds, f: fabriques(ds),
    async compte(extra) {
      const repo = ds.getRepository(Utilisateur);
      const user = await repo.save(repo.create({
        prenom: extra.login.slice(0, 1), nom: extra.login.slice(1), passwordHash: "x", mustChangePassword: false,
        equipeIds: [], toutesSaisons: true, saisonIds: null, ...extra,
      } as DeepPartial<Utilisateur>));
      return { user, jeton: auth.sign(user) };
    },
    appel(compte) {
      return async (methode, chemin, corps) => {
        const res = await fetch(`${base}${chemin}`, {
          method: methode,
          headers: { "Content-Type": "application/json", ...(compte ? { Authorization: `Bearer ${compte.jeton}` } : {}) },
          body: corps === undefined ? undefined : JSON.stringify(corps),
        });
        const texte = await res.text();
        let json: any = null;
        try { json = texte ? JSON.parse(texte) : null; } catch { json = texte; }
        return { statut: res.status, corps: json };
      };
    },
    async fermer() {
      await app.close();
      await supprimer();
    },
  };
}
