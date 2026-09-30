// src/common/database.module.ts
import { Module, Global } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ALL_ENTITIES } from "@/entities";

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const type = cfg.get<string>("DB_TYPE", "sqlite");

        if (type === "postgres") {
          // Production : Supabase / Postgres. Utiliser des migrations en vrai prod.
          return {
            type: "postgres" as const,
            url: cfg.get<string>("DATABASE_URL"),
            entities: ALL_ENTITIES,
            synchronize: true,
            ssl: { rejectUnauthorized: false },
          };
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
          entities: ALL_ENTITIES,
          synchronize: true,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
