// src/entities/identifiants.ts
//
// Generation des identifiants. Les cles primaires sont des chaines (UUID v4) creees ici, a l'insertion, donc
// de la meme facon sur SQLite et sur Postgres. Ce subscriber doit etre declare dans CHAQUE DataSource
// (application, tests, migrations, scripts).

import { randomUUID } from "node:crypto";
import { EntitySubscriberInterface, EventSubscriber, InsertEvent } from "typeorm";

@EventSubscriber()
export class GenerateurIdentifiants implements EntitySubscriberInterface {
  beforeInsert(event: InsertEvent<{ id?: string }>) {
    if (event.entity && !event.entity.id) event.entity.id = randomUUID();
  }
}
