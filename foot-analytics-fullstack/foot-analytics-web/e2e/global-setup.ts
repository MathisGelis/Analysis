// Prepare la base de test par l'API (une seule fois, avant les parcours) :
//  - le compte admin cree au demarrage (AADMIN / Bienvenue1) change son mot de
//    passe, pour ne pas etre redirige vers /change-password a chaque connexion ;
//  - saisons 2024-2025 (archivee, avec equipe), 2025-2026 (active, avec equipe) et
//    2026-2027 (creee au demarrage par l'API, sans equipe pour le club) ;
//  - un club avec une equipe Seniors D2 Poule C sur 2025-2026 (Poule B en 2024-2025)
//    et un joueur existant a retrouver par la recherche floue.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { API_URL } from "../playwright.config";

export const MOT_DE_PASSE = "E2e-Passw0rd!";
export const FIXTURES = path.join(__dirname, ".tmp", "fixtures.json");

async function appel<T>(chemin: string, token: string | null, methode = "GET", corps?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${chemin}`, {
    method: methode,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  if (!res.ok) throw new Error(`${methode} ${chemin} -> ${res.status} ${await res.text()}`);
  const texte = await res.text();
  return (texte ? JSON.parse(texte) : null) as T;
}

export default async function globalSetup() {
  const premiere = await appel<{ token: string }>("/auth/login", null, "POST", {
    login: "AADMIN", password: "Bienvenue1",
  });
  await appel("/auth/change-password", premiere.token, "POST", {
    oldPassword: "Bienvenue1", newPassword: MOT_DE_PASSE,
  });
  const { token } = await appel<{ token: string }>("/auth/login", null, "POST", {
    login: "AADMIN", password: MOT_DE_PASSE,
  });

  const club = await appel<{ id: string }>("/clubs", token, "POST", {
    nom: "OL Sud E2E", abbr: "OLS", numeroFff: "999001",
  });
  const saisons = await appel<{ id: string; nom: string }[]>("/saisons", token);
  const s2627 = saisons.find((s) => s.nom === "2026-2027");
  if (!s2627) throw new Error("La saison 2026-2027 devrait etre creee au demarrage de l'API");
  const s2425 = await appel<{ id: string }>("/saisons", token, "POST", { nom: "2024-2025", anneeDebut: 2024 });
  const s2526 = await appel<{ id: string }>("/saisons", token, "POST", { nom: "2025-2026", anneeDebut: 2025 });
  await appel(`/saisons/${s2526.id}/activer`, token, "PATCH");

  const equipe = await appel<{ id: string }>("/equipes", token, "POST", {
    clubId: club.id, nom: "Seniors D2 Poule C", categorie: "Seniors", division: "D2",
    poule: "C", competitionLibelle: "Seniors D2 / Phase Unique", saisonId: s2526.id,
  });
  // Une saison archivee SANS equipe du club ne peut pas etre selectionnee (la
  // selection n'est jamais vide) : l'archive a donc la sienne.
  const equipe2425 = await appel<{ id: string }>("/equipes", token, "POST", {
    clubId: club.id, nom: "Seniors D2 Poule B", categorie: "Seniors", division: "D2",
    poule: "B", competitionLibelle: "Seniors D2 / Phase Unique", saisonId: s2425.id,
  });
  await appel("/joueurs", token, "POST", {
    nom: "DIAGOLA", prenom: "Seydou", licence: "9604756569", clubId: club.id,
  });

  mkdirSync(path.dirname(FIXTURES), { recursive: true });
  writeFileSync(FIXTURES, JSON.stringify({
    clubId: club.id, equipeId: equipe.id, equipe2425: equipe2425.id,
    saison2425: s2425.id, saison2526: s2526.id, saison2627: s2627.id,
  }, null, 2));
}
