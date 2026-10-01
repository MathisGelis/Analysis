// src/features/seed/seed.cli.ts
// Permet de relancer le seed manuellement : `npm run seed`
import { NestFactory } from "@nestjs/core";

import { AppModule } from "@/app.module";

import { SeedService } from "./seed.service";

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const seed = app.get(SeedService);
  await seed.reset();
  // eslint-disable-next-line no-console
  console.log("Seed termine.");
  await app.close();
  process.exit(0);
}
run();
