// src/database/data-source.ts
//
// DataSource de la ligne de commande TypeORM (voir les scripts migration:* de package.json). Lit DATABASE_URL
// dans l'environnement ou dans .env ; ne migre jamais tout seul.

import "reflect-metadata";
import { config } from "dotenv";
import { DataSource } from "typeorm";

import { connexionPostgres } from "./postgres";

config();

export default new DataSource({ ...connexionPostgres(), migrationsRun: false });
