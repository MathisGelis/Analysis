// src/main.ts
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";

import { AuthService } from "@/features/auth/auth.service";
import { BootstrapService } from "@/features/saisons/bootstrap.service";
import { niveauxDeLog } from "@/common/log-level";
import { EquipesService } from "@/features/equipes/equipes.service";

import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: niveauxDeLog() });

  // Prefixe global : toutes les routes sous /api
  app.setGlobalPrefix("api");

  // CORS pour autoriser le front Next.js. On accepte les origines listees
  // dans CORS_ORIGIN, et par commodite tout localhost / 127.0.0.1 (quel que
  // soit le port, car Next bascule sur 3001, 3002… si 3000 est occupe).
  const allowList = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: (origin, cb) => {
      if (
        !origin ||
        allowList.includes(origin) ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
    credentials: true,
    // Le front lit le nom du fichier propose par l'export PowerPoint.
    exposedHeaders: ["Content-Disposition"],
  });

  // Validation automatique des DTO (class-validator)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // Cree le compte admin par defaut si la table utilisateurs est vide.
  // Log les credentials dans la console (a transmettre au coach).
  try { await app.get(AuthService).bootstrapAdmin(); }
  catch (e) { new Logger("Bootstrap").error(`bootstrap admin: ${(e as Error).message}`); }

  // Cree la saison 2026-2027 si absente. Permet de constituer un
  // effectif avant le debut des championnats (aucun match a importer
  // n'est requis : on peut deja basculer la saison active dessus).
  try { await app.get(BootstrapService).bootstrapSaisonsParDefaut(); }
  catch (e) { new Logger("Bootstrap").error(`bootstrap saisons: ${(e as Error).message}`); }

  // Rattrape les clones provisoires de la saison precedente devenus doublons
  // de la vraie equipe (autre poule) : fusion sure, joueurs et seances suivent.
  // Idempotent ; AUTO_RECONCILE=false pour desactiver.
  if (process.env.AUTO_RECONCILE !== "false") {
    try {
      const r = await app.get(EquipesService).reconcilier(true);
      if (r.fusions.length > 0) {
        new Logger("Bootstrap").log(
          `Equipes reconciliees : ${r.fusions.map((f) => `${f.club} ${f.saison} ${f.source.nom} -> ${f.cible.nom}`).join(" ; ")}`,
        );
      }
      if (r.ambigus.length > 0) {
        new Logger("Bootstrap").warn(`${r.ambigus.length} cas d'equipes ambigus non fusionnes (voir POST /equipes/maintenance/reconcilier)`);
      }
    } catch (e) { new Logger("Bootstrap").error(`reconciliation des equipes: ${(e as Error).message}`); }
  }

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  new Logger("Bootstrap").log(`API prete sur http://localhost:${port}/api`);
}
bootstrap();
