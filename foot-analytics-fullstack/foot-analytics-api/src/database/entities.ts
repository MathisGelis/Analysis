// src/database/entities.ts
//
// Entites TypeORM. Compatibles SQLite (dev, zero config) et Postgres/Supabase (prod).
// Les cles primaires sont des chaines opaques (UUID v4 generes par GenerateurIdentifiants) et non le type
// `uuid` de Postgres : les cles etrangeres "sans relation" (equipeId, joueurId...) et les identifiants
// d'URL ou de cookie restent ainsi comparables partout, et un identifiant inconnu est un 404, jamais une erreur SQL.
// On evite les types PG-specifiques (text[], jsonb) : les tableaux sont
// stockes en "simple-array", les payloads en "simple-json" (portable).

import { Arbitre } from "@/features/arbitres/arbitre.entity";
import { ArbitreMatch } from "@/features/arbitres/arbitre-match.entity";
import { Blessure } from "@/features/blessures/blessure.entity";
import { Club } from "@/features/clubs/club.entity";
import { Coach } from "@/features/coachs/coach.entity";
import { Composition } from "@/features/matchs/composition.entity";
import { Entrainement } from "@/features/entrainements/entrainement.entity";
import { Equipe } from "@/features/equipes/equipe.entity";
import { EvenementMatch } from "@/features/matchs/evenement-match.entity";
import { Joueur } from "@/features/joueurs/joueur.entity";
import { LigneClassement } from "@/features/classement/ligne-classement.entity";
import { Match } from "@/features/matchs/match.entity";
import { RapportScouting } from "@/features/scouting/rapport-scouting.entity";
import { Saison } from "@/features/saisons/saison.entity";
import { StaffMatch } from "@/features/coachs/staff-match.entity";
import { StatJoueurEquipe } from "@/features/joueurs/stat-joueur-equipe.entity";
import { Tactique } from "@/features/tactiques/tactique.entity";
import { Utilisateur } from "@/features/utilisateurs/utilisateur.entity";

import { GenerateurIdentifiants } from "./identifiants";

export const ALL_ENTITIES = [
  Club, Equipe, Joueur, Match, Composition, EvenementMatch,
  Entrainement, Blessure, RapportScouting, LigneClassement,
  Arbitre, ArbitreMatch, Coach, StaffMatch, Saison, Utilisateur,
  StatJoueurEquipe, Tactique,
];

/** A etendre dans chaque DataSource : les entites et le generateur d'identifiants vont ensemble. */
export const OPTIONS_ENTITES = { entities: ALL_ENTITIES, subscribers: [GenerateurIdentifiants] };
