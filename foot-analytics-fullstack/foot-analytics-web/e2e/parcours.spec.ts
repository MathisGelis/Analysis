// Parcours critiques, dans l'ordre : chaque test s'appuie sur l'etat laisse par
// le precedent (connexion -> saison vide -> effectif -> import -> archive).

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { API_URL, WEB_PORT } from "../playwright.config";
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

test("acces : un visiteur anonyme est renvoye vers /login, et une cible externe est ignoree", async ({ browser }) => {
  const base = `http://localhost:${WEB_PORT}`;
  const anonyme = await browser.newContext();
  const p = await anonyme.newPage();
  try {
    await p.goto(`${base}/matchs`);
    await expect(p).toHaveURL(`${base}/login?from=%2Fmatchs`);
    // Pas de coquille (barre laterale) ni de donnees de demo sur la page de connexion.
    await expect(p.getByText("Connexion au staff technique")).toBeVisible();
    await expect(p.getByRole("navigation", { name: "Navigation principale" })).toHaveCount(0);

    // Un `from` externe ne doit jamais etre suivi apres la connexion.
    await p.goto(`${base}/login?from=${encodeURIComponent("https://evil.example/piege")}`);
    await p.getByPlaceholder("MLEMAIRE").fill("AADMIN");
    await p.locator("input[type=password]").fill(MOT_DE_PASSE);
    await p.getByRole("button", { name: "Se connecter" }).click();
    await p.waitForURL(`${base}/`);
  } finally {
    await anonyme.close();
  }
});

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

test("saison sans equipe : choisir la saison reimporte les equipes, la selection n'est jamais vide", async () => {
  await page.goto("/");
  await ouvrirSelecteur(page);
  // 2026-2027 n'a encore aucune equipe pour le club : plutot que de laisser
  // "Aucune equipe", le choix de la saison reimporte celles de la precedente.
  await page.getByRole("button", { name: /^2026-2027/ }).click();

  await expect(selecteur(page)).toContainText("2026-2027");
  await expect(selecteur(page)).toContainText("Seniors D2 Poule C");
  await expect(selecteur(page)).not.toContainText("Aucune equipe");
});

test("cookie d'equipe perime (equipe fusionnee ou supprimee) : la selection est reparee, jamais vide", async () => {
  const base = `http://localhost:${WEB_PORT}`;
  const cookie = async (nom: string) => (await contexte.cookies()).find((c) => c.name === nom)?.value;
  const saisonId = await cookie("ownSaisonId");
  expect(saisonId).toBeTruthy();

  // 1. Le middleware detecte le cookie perime et le reecrit dans la MEME requete.
  await contexte.addCookies([{ name: "ownEquipeId", value: "equipe-disparue", url: base }]);
  await contexte.clearCookies({ name: "ownSelValide" });
  await page.goto("/effectif");
  await expect(selecteur(page)).toContainText("Seniors D2 Poule C");
  await expect(page.locator("header .h-section").first()).toContainText("Seniors D2 Poule C");
  expect(await cookie("ownEquipeId")).not.toBe("equipe-disparue");

  // 2. Verification memorisee (moins de 2 minutes) mais equipe disparue depuis : le selecteur
  //    se repare lui-meme, sans jamais afficher "Aucune equipe".
  await contexte.addCookies([
    { name: "ownEquipeId", value: "equipe-disparue", url: base },
    { name: "ownSelValide", value: `equipe-disparue|${saisonId}`, url: base },
  ]);
  await page.goto("/effectif");
  await expect(selecteur(page)).not.toContainText("Aucune equipe");
  await expect(selecteur(page)).toContainText("Seniors D2 Poule C");
  await expect.poll(() => cookie("ownEquipeId")).not.toBe("equipe-disparue");

  // 3. Un rafraichissement garde la selection.
  await page.reload();
  await expect(selecteur(page)).toContainText("Seniors D2 Poule C");
  await expect(selecteur(page)).not.toContainText("Aucune equipe");
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
  await expect(page.getByRole("link", { name: /DIAGOLA/ })).toBeVisible();

  // Nouveau joueur.
  await page.getByRole("button", { name: /Ajouter/ }).first().click();
  await modale.getByRole("button", { name: "Nouveau joueur" }).click();
  await modale.locator("input.inp").nth(0).fill("Alex");
  await modale.locator("input.inp").nth(1).fill("TESTEUR");
  await modale.getByRole("button", { name: "Creer et ajouter" }).click();
  await expect(titreModale).toBeHidden();
  await expect(page.getByRole("link", { name: /TESTEUR/ })).toBeVisible();
});

test("suppression d'un joueur : confirmation dans une modale, notification, jamais de boite du navigateur", async () => {
  // Une boite alert()/confirm() native figerait la page : elle ne doit plus apparaitre.
  let dialogueNatif = false;
  page.on("dialog", (d) => { dialogueNatif = true; void d.dismiss(); });

  await page.goto("/effectif");
  await page.getByRole("button", { name: "Supprimer Alex TESTEUR" }).click();
  const modale = page.getByRole("heading", { name: "Supprimer Alex TESTEUR ?" });
  await expect(modale).toBeVisible();

  // Annuler ne supprime rien.
  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(modale).toBeHidden();
  await expect(page.getByRole("link", { name: /TESTEUR/ })).toBeVisible();

  // Confirmer supprime et previent sans bloquer.
  await page.getByRole("button", { name: "Supprimer Alex TESTEUR" }).click();
  await page.getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Alex TESTEUR supprime" })).toBeVisible();
  await expect(page.getByRole("link", { name: /TESTEUR/ })).toHaveCount(0);
  expect(dialogueNatif).toBe(false);
  page.removeAllListeners("dialog");
});

test("tactique : composition sur l'effectif reel, regle des mutes imposee, plan enregistre puis relu", async () => {
  // Effectif de l'equipe choisie : 7 mutes, 3 mutes hors delai (donc 10 au total, plus que le maximum de 6),
  // et 9 joueurs sans mutation. Crees par l'API avec le jeton de la session.
  const equipeId = (await contexte.cookies()).find((c) => c.name === "ownEquipeId")!.value;
  const token = await page.evaluate(() => localStorage.getItem("fa.token"));
  const creer = async (prenom: string, nom: string, poste: string, statutMutation: string) => {
    const res = await fetch(`${API_URL}/joueurs/equipe/${equipeId}/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ prenom, nom, poste, statutMutation }),
    });
    expect(res.ok).toBe(true);
  };
  const postes = ["GB", "DC", "DC", "DD", "DG", "MD", "MO", "MO", "AG", "AT"];
  for (let i = 0; i < 7; i++) await creer("Mu", `MUTE${i + 1}`, postes[i], "Mutation");
  for (let i = 0; i < 3; i++) await creer("Hd", `HORSDELAI${i + 1}`, postes[i + 7], "Mutation hors delai");
  for (let i = 0; i < 9; i++) await creer("Lib", `LIBRE${i + 1}`, postes[i % 10], "Pas mutation");

  await page.goto("/tactique");
  // Plus de jeu d'exemple : les joueurs sont ceux de l'effectif.
  await expect(page.getByText(/jeu d'exemple/)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "11 de depart" })).toBeVisible();

  // Le onze suggere ne depasse jamais 6 mutes dont 2 hors delai (titulaires + remplacants).
  await page.getByRole("button", { name: /Onze suggere/ }).click();
  const nombre = async (id: string) => Number((await page.getByTestId(id).innerText()).split("/")[0].trim());
  expect(await nombre("mutes")).toBeLessThanOrEqual(6);
  expect(await nombre("hors-delai")).toBeLessThanOrEqual(2);
  await expect(page.getByText("Conforme", { exact: true })).toBeVisible();
  await expect(page.getByTestId("nb-titulaires")).toHaveText("11/11");

  // Quota atteint : un mute de plus est grise dans la liste des remplacants, avec sa raison.
  const ajout = page.getByLabel("Ajouter un remplacant");
  const grises = await ajout.locator("option[disabled]").allInnerTexts();
  expect(grises.length).toBeGreaterThan(0);
  expect(grises.every((t) => /regle des mutes|indisponible/.test(t))).toBe(true);

  // Enregistrement, puis le plan est relu apres rechargement.
  await page.getByLabel("Dispositif").selectOption("3-5-2");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText(/Composition enregistree/).first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Dispositif")).toHaveValue("3-5-2");
  await expect(page.getByRole("status")).toContainText("Enregistre le");
  expect(await nombre("mutes")).toBeLessThanOrEqual(6);
});

test("fatigue : jamais de score invente hors saison active ni sans donnee, et l'effectif se trie par fatigue", async () => {
  // Saison choisie : 2026-2027, a venir (non active). La fatigue est une mesure du moment, elle n'existe pas.
  await page.goto("/medical");
  await expect(page.getByText(/Charge et fatigue : indisponibles hors saison active/)).toBeVisible();
  await expect(page.getByRole("img", { name: /^Fatigue \d+ sur 100/ })).toHaveCount(0);

  // Saison active sans effectif : la page le dit.
  await page.goto("/");
  await ouvrirSelecteur(page);
  await page.getByRole("button", { name: /^2025-2026/ }).click();
  await page.goto("/medical");
  await expect(page.getByText("Aucune donnee sur cette equipe.")).toBeVisible();

  // L'effectif propose le tri par fatigue (et non plus par forme).
  await page.goto("/effectif");
  await expect(page.getByRole("option", { name: "Tri · Fatigue" })).toBeAttached();
  await expect(page.getByRole("option", { name: "Tri · Forme" })).toHaveCount(0);
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

test("rapport d'equipe : sans match analyse sur la saison, la page l'explique sans planter ni inventer de tendance", async () => {
  await page.goto("/rapports");
  await page.getByRole("link", { name: /Mon equipe/ }).click();

  await expect(page.getByRole("heading", { level: 1, name: /OL Sud E2E/ })).toBeVisible();
  await expect(page.getByText("Pas encore de match analyse")).toBeVisible();
  // Aucune section de tendance sans echantillon : ni constats, ni courbe, ni navigation par sections.
  await expect(page.getByText("Ce qu'il faut retenir")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Sections du rapport" })).toHaveCount(0);
  // La dynamique n'est pas chiffree : l'anneau est remplace par un tiret expliquant pourquoi.
  await expect(page.getByRole("img", { name: /au moins 6 matchs pour juger une dynamique/ })).toBeVisible();
});

test("rapport pre-match : un clic depuis /rapports, rapport lisible, imprimable sans la coquille", async () => {
  test.skip(!pdfplumberDisponible(), "PYTHON_BIN avec pdfplumber requis : l'adversaire vient de la FMI importee");

  // L'adversaire est un club cree par l'import de la FMI (il n'a pas d'equipe sur la saison choisie).
  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
  const clubs: { id: string; nom: string }[] = await (await fetch(`${API_URL}/clubs`, {
    headers: { Authorization: `Bearer ${token}` },
  })).json();
  const adversaire = clubs.find((c) => c.nom !== "OL Sud E2E");
  expect(adversaire, "l'import FMI cree au moins un club adverse").toBeTruthy();

  await page.goto(`/rapports/prematch/${adversaire!.id}`);
  await expect(page.getByRole("heading", { level: 1, name: /^Rapport pre-match : .+ contre .+/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pistes pour le match" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Les deux equipes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Face-a-face" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Arbitre" })).toBeVisible();
  // Aucun match programme : le rapport le dit au lieu d'inventer une rencontre.
  await expect(page.getByText(/Aucun match programme/)).toBeVisible();

  // Impression : la barre laterale, la barre du haut et le bouton disparaissent.
  const bouton = page.getByRole("button", { name: "Imprimer / PDF" });
  await expect(bouton).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(bouton).toBeHidden();
  await expect(page.locator("aside").first()).toBeHidden();
  await expect(page.locator("header.glass")).toBeHidden();
  await page.emulateMedia({ media: "screen" });

  // Un club inconnu : page d'erreur propre, pas d'exception.
  await page.goto("/rapports/prematch/club-inexistant");
  await expect(page.getByText(/introuvable|n'existe pas|404/i).first()).toBeVisible();
});

test("entraineur : cliquable depuis la feuille de match, fiche avec bilan par saison et parcours", async () => {
  test.skip(!pdfplumberDisponible(), "PYTHON_BIN avec pdfplumber requis : les entraineurs viennent de la FMI importee");

  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
  const get = async (chemin: string) => (await fetch(`${API_URL}${chemin}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const [match] = await get("/matchs");
  const staff: { coach: { id: string; nom: string; prenom: string } }[] = (await get(`/coachs/match/${match.id}`))
    .filter((l: any) => l.fonctions?.split("/").includes("E"));
  expect(staff.length, "la feuille importee compte au moins un entraineur").toBeGreaterThan(0);
  const { id, nom } = staff[0].coach;

  await page.goto(`/matchs/${match.id}`);
  await page.getByRole("link", { name: new RegExp(nom) }).first().click();

  await expect(page).toHaveURL(new RegExp(`/coachs/${id}`));
  await expect(page.getByRole("heading", { level: 1, name: new RegExp(nom) })).toBeVisible();
  // Portee : la saison choisie par defaut, la carriere complete au clic.
  await page.getByRole("navigation", { name: "Portee de la fiche" }).getByRole("link", { name: "Carriere complete" }).click();
  await expect(page).toHaveURL(/portee=carriere/);
  await expect(page.getByRole("heading", { name: "Saison par saison" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Parcours" })).toBeVisible();
  await expect(page.getByText("1 match", { exact: false }).first()).toBeVisible();
});

test("accessibilite : aucune violation axe sur les pages principales, en theme nuit et jour", async () => {
  test.setTimeout(180_000);
  const axe = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  // Une page de rapport pre-match vise un club cree par l'import FMI : on va le chercher par l'API.
  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
  const clubs: { id: string; nom: string }[] = await (await fetch(`${API_URL}/clubs`, {
    headers: { Authorization: `Bearer ${token}` },
  })).json();
  const adversaire = clubs.find((c) => c.nom !== "OL Sud E2E");
  const pages = ["/", "/rapports", "/matchs", "/effectif", "/tactique", "/arbitres", "/classement", "/calendrier", "/medical",
    ...(adversaire ? [`/rapports/prematch/${adversaire.id}`] : [])];

  const violations: string[] = [];
  for (const chemin of pages) {
    await page.goto(chemin);
    await page.waitForLoadState("networkidle");
    await page.evaluate(axe);
    for (const theme of ["dark", "light"]) {
      // Le theme ne change que les variables CSS : poser l'attribut suffit a auditer les contrastes.
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      // Les couleurs se fondent en ~250 ms : mesurees en cours de route, elles donneraient de faux contrastes.
      await page.waitForTimeout(600);
      const trouves: string[] = await page.evaluate(async () => {
        const r = await (window as any).axe.run(document, { resultTypes: ["violations"] });
        return r.violations.map((v: any) => `${v.impact} ${v.id} x${v.nodes.length} : ${v.nodes[0].target.join(" ")}`);
      });
      violations.push(...trouves.map((t) => `${chemin} (${theme}) ${t}`));
    }
  }
  expect(violations, "violations d'accessibilite (axe-core)").toEqual([]);
});

test("saison archivee : /tactique s'affiche en consultation seule", async () => {
  await page.goto("/");
  await ouvrirSelecteur(page);
  await page.getByRole("button", { name: /^2024-2025/ }).click();

  await page.goto("/tactique");

  await expect(page.getByText(/archivee, en consultation seule/)).toBeVisible();
  // Aucune ecriture possible : pas de bouton Enregistrer actif (ici l'effectif archive est vide, la page le dit).
  await expect(page.getByText("Aucun joueur dans l'effectif")).toBeVisible();
  await expect(page.locator("button:enabled", { hasText: "Enregistrer" })).toHaveCount(0);
});

test("palette de commandes : Ctrl+K, recherche tolerante, Entree ouvre la page", async () => {
  await page.goto("/");
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Palette de commandes" });
  await expect(palette).toBeVisible();

  // Les joueurs sont cherches cote serveur : une faute de frappe est toleree.
  await page.keyboard.type("diagolla");
  await expect(palette.getByRole("option", { name: /DIAGOLA/ })).toBeVisible();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Backspace");

  // Sans accent ni majuscule, un mot-cle suffit ; la fleche et Entree ouvrent le resultat.
  await page.keyboard.type("blessures");
  await expect(palette.getByRole("option", { name: /Medical & charge/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/medical$/);
  await expect(palette).toBeHidden();

  // Echap ferme sans naviguer.
  await page.keyboard.press("Control+k");
  await expect(palette).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
});

test("barre laterale : repliee en rail, l'etat survit au rechargement", async () => {
  await page.goto("/effectif");
  await page.getByRole("button", { name: "Replier la barre laterale" }).click();
  await expect(page.getByRole("button", { name: "Deplier la barre laterale" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Deplier la barre laterale" })).toBeVisible();

  await page.getByRole("button", { name: "Deplier la barre laterale" }).click();
  await expect(page.getByRole("button", { name: "Replier la barre laterale" })).toBeVisible();
});

test("mobile : menu en tiroir, ferme apres navigation, sans debordement horizontal", async ({ browser }) => {
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await contexte.storageState() });
  const p = await mobile.newPage();
  try {
    await p.goto("/");
    await expect(p.getByRole("button", { name: "Ouvrir le menu" })).toBeVisible();
    await expect(p.getByRole("navigation", { name: "Navigation principale" })).toBeHidden();

    await p.getByRole("button", { name: "Ouvrir le menu" }).click();
    await expect(p.getByRole("navigation", { name: "Navigation principale" })).toBeVisible();
    await p.getByRole("link", { name: "Classement" }).click();
    await expect(p).toHaveURL(/\/classement$/);
    await expect(p.getByRole("button", { name: "Fermer le menu" })).toBeHidden();

    // La page ne deborde pas de l'ecran (les tableaux defilent dans leur panneau).
    const debordement = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(debordement).toBeLessThanOrEqual(1);
  } finally {
    await mobile.close();
  }
});

function pdfplumberDisponible(): boolean {
  try {
    execFileSync(process.env.PYTHON_BIN ?? "python3", ["-c", "import pdfplumber"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
