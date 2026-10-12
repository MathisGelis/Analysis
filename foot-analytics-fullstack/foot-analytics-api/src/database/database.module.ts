// src/database/database.module.ts
import { Module, Global } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { OPTIONS_ENTITES } from "./entities";
import { connexionPostgres } from "./postgres";

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const type = cfg.get<string>("DB_TYPE", "sqlite");

        if (type === "postgres") {
          // Production : Supabase / Postgres. Le schema evolue par migrations (src/database/migrations), appliquees au
          // demarrage ; jamais de synchronize ici. Voir database/postgres.ts pour la connexion et le SSL.
          return connexionPostgres({
            DATABASE_URL: cfg.get<string>("DATABASE_URL"), DB_SSL: cfg.get<string>("DB_SSL"),
            DB_SSL_CA: cfg.get<string>("DB_SSL_CA"), DB_POOL_MAX: cfg.get<string>("DB_POOL_MAX"),
            DB_MIGRATIONS_RUN: cfg.get<string>("DB_MIGRATIONS_RUN"),
          });
        }

        // Developpement : sql.js (SQLite compile en WASM).
        // Aucune compilation native requise -> s'installe partout.
        // La base est persistee dans un fichier via autoSave.
        const location = cfg.get<string>("SQLITE_PATH", "foot-analytics.sqlite");
        return {
          type: "sqljs" as const,
          location,
          autoSave: true,
          useLocalForage: false,
          ...OPTIONS_ENTITES,
          synchronize: true,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
