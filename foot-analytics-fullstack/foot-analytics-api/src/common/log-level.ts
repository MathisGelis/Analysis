// src/common/log-level.ts
//
// Niveaux de journalisation Nest pilotes par LOG_LEVEL (fatal, error, warn,
// log, debug, verbose). Par defaut "log" : les traces de diagnostic
// (Logger.debug) restent silencieuses en usage normal, LOG_LEVEL=debug les
// active.

import type { LogLevel } from "@nestjs/common";

const ORDRE: LogLevel[] = ["fatal", "error", "warn", "log", "debug", "verbose"];

export function niveauxDeLog(valeur: string | undefined = process.env.LOG_LEVEL): LogLevel[] {
  const cible = (valeur ?? "log").trim().toLowerCase() as LogLevel;
  const i = ORDRE.indexOf(cible);
  // Valeur inconnue : on retombe sur le niveau par defaut plutot que de tout couper.
  return ORDRE.slice(0, (i === -1 ? ORDRE.indexOf("log") : i) + 1);
}
