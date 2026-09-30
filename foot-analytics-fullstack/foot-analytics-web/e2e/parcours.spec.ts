// Parcours critiques, dans l'ordre : chaque test s'appuie sur l'etat laisse par
// le precedent (connexion -> saison vide -> effectif -> import -> archive).

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { MOT_DE_PASSE } from "./global-setup";

test.describe.configure({ mode: "serial" });

// UNE session partagee par tous les parcours : cookies (equipe, saison) et
// jeton de connexion doivent survivre d'un test au suivant, alors que
// Playwright ouvre sinon un contexte vierge par test.
let contexte: BrowserContext;
let page: Page;
test.beforeAll(async ({ browser }) => {
  contexte = await browser.newContext();
  page = await contexte.newPage();
});
test.afterAll(async () => { await contexte.close(); });

const FMI = path.resolve(__dirname, "../../foot-analytics-api/parser/FMI_Neuville1.pdf");

/** Le bouton du selecteur de saison / equipe, en bas a gauche de la barre laterale. */
const selecteur = (page: Page) => page.locator("aside button.panel-inset, nav button.panel-inset").first();

async function ouvrirSelecteur(page: Page) {
  await selecteur(page).click();
}

test("connexion : refus d'un mauvais mot de passe puis acces, equipe choisie d'office", async () => {
  await page.goto("/login");
  await page.getByPlaceholder("MLEMAIRE").fill("AADMIN");
  await page.locator("input[type=password]").fill("pas-le-bon");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText(/API 401|Erreur de connexion|incorrect/i)).toBeVisible();

  await page.locator("input[type=password]").fill(MOT_DE_PASSE);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/");

  // Le middleware a pose l'equipe : elle s'affiche des le premier ecran.
  await expect(selecteur(page)).toContainText("2025-2026");
  await expect(selecteur(page)).toContainText("Seniors D2 Poule C");
});

test("saison sans equipe : le bouton reimporte les equipes de la saison precedente", async () => {
  await page.goto("/");
  await ouvrirSelecteur(page);
  // Choisir une saison laisse le menu ouvert : la liste d'equipes s'y affiche directement.
  await page.getByRole("button", { name: /^2026-2027/ }).click();
  await expect(page.getByText("Aucune equipe sur cette saison.")).toBeVisible();

  await page.getByRole("button", { name: "Reimporter les equipes de la saison precedente" }).click();

  await expect(selecteur(page)).toContainText("2026-2027");
  await expect(selecteur(page)).toContainText("Seniors D2 Poule C");
});

test("effectif 2026-2027 : ajout d'un joueur existant (recherche floue) puis d'un nouveau", async () => {
  await page.goto("/effectif");
  await expect(page.getByText("DIAGOLA")).toHaveCount(0);

  // La modale recouvre la page : on cible ses boutons, pas celui de l'en-tete
  // (le tiroir des reglages, toujours monte, porte aussi "fixed inset-0").
  const modale = page.locator("div.fixed.inset-0.overflow-y-auto");
  const titreModale = page.getByRole("heading", { name: "Ajouter un joueur a l'effectif" });

  // Joueur existant, retrouve malgre la faute de frappe.
  await page.getByRole("button", { name: /Ajouter/ }).first().click();
  await modale.getByPlaceholder(/Tape le nom/).fill("diagolla");
  await modale.getByRole("button", { name: /Ajouter$/ }).last().click();
  await expect(titreModale).toBeHidden();
  await expect(page.getByRole("cell", { name: /DIAGOLA/ })).toBeVisible();

  // Nouveau joueur.
  await page.getByRole("button", { name: /Ajouter/ }).first().click();
  await modale.getByRole("button", { name: "Nouveau joueur" }).click();
  await modale.locator("input.inp").nth(0).fill("Alex");
  await modale.locator("input.inp").nth(1).fill("TESTEUR");
  await modale.getByRole("button", { name: "Creer et ajouter" }).click();
  await expect(titreModale).toBeHidden();
  await expect(page.getByRole("cell", { name: /TESTEUR/ })).toBeVisible();
});

test("import FMI : la feuille est importee puis consultable", async () => {
  test.skip(!pdfplumberDisponible(), "PYTHON_BIN avec pdfplumber requis pour parser les PDF");

  await page.goto("/import");
  await page.locator("input[type=file]").first().setInputFiles(FMI);

  await expect(page.getByText("Importe", { exact: true })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: "Voir" }).click();
  await expect(page.getByText("53415223")).toBeVisible();
  await expect(page.getByText("2–0")).toBeVisible();
});

test("saison archivee : /tactique s'affiche en consultation seule", async () => {
  await page.goto("/");
  await ouvrirSelecteur(page);
  await page.getByRole("button", { name: /^2024-2025/ }).click();

  await page.goto("/tactique");

  await expect(page.getByText(/archivee, en consultation seule/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Enregistrer/ })).toBeDisabled();
});

function pdfplumberDisponible(): boolean {
  try {
    execFileSync(process.env.PYTHON_BIN ?? "python3", ["-c", "import pdfplumber"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
