// Parcours critiques, dans l'ordre : chaque test s'appuie sur l'etat laisse par
// le precedent (connexion -> saison vide -> effectif -> import -> archive).

import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
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
// Aucune boite de dialogue du navigateur (alert, confirm, prompt) ne doit jamais s'ouvrir : useFeedback les remplace.
const dialoguesNatifs: string[] = [];
test.beforeAll(async ({ browser }) => {
  contexte = await browser.newContext();
  page = await contexte.newPage();
  page.on("dialog", (d) => { dialoguesNatifs.push(`${d.type()} : ${d.message()}`); void d.dismiss(); });
});
test.afterEach(() => {
  expect(dialoguesNatifs, "une boite de dialogue du navigateur s'est ouverte").toEqual([]);
});
test.afterAll(async () => { await contexte.close(); });

const FMI = path.resolve(__dirname, "../../foot-analytics-api/parser/FMI_Neuville1.pdf");

/** Liste deroulante maison : on ouvre le declencheur puis on clique l'option par son libelle exact. */
async function choisir(declencheur: Locator, libelle: string | RegExp) {
  await declencheur.click();
  await declencheur.page().getByRole("option", { name: libelle, exact: typeof libelle === "string" }).click();
}

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

  // Le banc propose 3 remplacants par defaut ; le staff peut l'etendre jusqu'a 7.
  await expect(page.getByTestId("nb-remplacants")).toHaveText("3/7");

  // Quota atteint : un mute de plus est grise dans la liste des remplacants, avec sa raison. On complete le banc
  // avec des mutes jusqu'a ce que la regle en refuse (6 mutes au plus sur la feuille).
  const ajout = page.getByRole("combobox", { name: "Ajouter un remplacant" });
  const grisees = page.getByRole("option", { disabled: true });
  for (let i = 0; i < 4; i++) {
    await ajout.click();
    const mute = page.getByRole("option", { disabled: false }).filter({ hasText: /MUTE|HORSDELAI/ }).first();
    if ((await grisees.count()) > 0 || !(await mute.count())) { await page.keyboard.press("Escape"); break; }
    await mute.click();
  }
  await ajout.click();
  const grises = await grisees.allInnerTexts();
  await page.keyboard.press("Escape");
  expect(grises.length).toBeGreaterThan(0);
  expect(grises.every((t) => /regle des mutes|indisponible/.test(t))).toBe(true);

  // Enregistrement, puis le plan est relu apres rechargement.
  await choisir(page.getByRole("combobox", { name: "Dispositif" }), "3-5-2");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText(/Composition enregistree/).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Dispositif" })).toContainText("3-5-2");
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
  await page.getByRole("combobox", { name: "Trier l'effectif par" }).click();
  await expect(page.getByRole("option", { name: "Tri · Fatigue" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Tri · Forme" })).toHaveCount(0);
  await page.keyboard.press("Escape");
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

test("systeme de jeu : saisi sur la fiche du match, repris par la prediction et la page Predictions", async () => {
  test.skip(!pdfplumberDisponible(), "PYTHON_BIN avec pdfplumber requis : le match vient de la FMI importee");

  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
  const get = async (chemin: string) => (await fetch(`${API_URL}${chemin}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const [match] = await get("/matchs");

  await page.goto(`/matchs/${match.id}`);
  // Aucun systeme suppose : la feuille FMI n'en contient pas.
  const domicile = page.getByRole("combobox", { name: /^Systeme de jeu de / }).first();
  await expect(domicile).toContainText("Non renseigne");
  await choisir(domicile, "4-3-3");
  await expect(page.getByText(/Systeme de .* : 4-3-3\./)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("combobox", { name: /^Systeme de jeu de / }).first()).toContainText("4-3-3");

  // Un dispositif qui n'en est pas un est refuse par l'API (dix joueurs de champ).
  const refus = await fetch(`${API_URL}/matchs/${match.id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ formationDom: "4-4-3" }),
  });
  expect(refus.status).toBe(400);

  // Prediction : mon equipe de la saison du match contre le club recevant.
  const saisons: { id: string; nom: string }[] = await get("/saisons");
  const equipes: { id: string; clubId: string; saisonId: string }[] = await get("/equipes");
  const s2526 = saisons.find((x) => x.nom === "2025-2026")!;
  const clubs: { id: string; nom: string }[] = await get("/clubs");
  const moi = equipes.find((e) => e.saisonId === s2526.id && e.clubId === clubs.find((c) => c.nom === "OL Sud E2E")!.id)!;
  const rapport = await get(`/analyse/prematch?equipeId=${moi.id}&adversaireId=${match.clubDom}`);
  expect(rapport.systemeAdverse.prediction).toMatchObject({ systeme: "4-3-3", observations: 1, fiabilite: "faible" });
  expect(rapport.systemeAdverse.matchs).toBe(1);

  // Page Predictions : elle s'affiche, sans exemple fictif.
  await page.goto("/ia");
  await expect(page.getByRole("heading", { level: 1, name: "Predictions" })).toBeVisible();
  await expect(page.getByText("Chaponnay")).toHaveCount(0);
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
  const pages = ["/", "/rapports", "/matchs", "/effectif", "/tactique", "/arbitres", "/classement", "/calendrier", "/medical", "/ia",
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

test("effectif : trier par n'importe quelle colonne de stats, en cliquant son en-tete", async () => {
  // Le parcours precedent a laisse la saison archivee : on revient sur 2026-2027, dont l'effectif est rempli.
  await page.goto("/");
  await ouvrirSelecteur(page);
  await page.getByRole("button", { name: /^2026-2027/ }).click();
  await page.goto("/effectif");
  const ligne = page.locator("table.table-fm tbody tr");
  await expect(ligne.first()).toBeVisible();
  const entete = (nom: string) => page.locator("table.table-fm thead th").filter({ has: page.getByRole("button", { name: nom, exact: true }) });
  const trier = (nom: string) => entete(nom).getByRole("button", { name: nom, exact: true }).click();
  const noms = async () => (await ligne.locator("td:first-child a").allInnerTexts()).map((t) => t.trim());

  // Un clic sur "Joueur" : A-Z ; un second : Z-A (l'etat est annonce par aria-sort).
  await trier("Joueur");
  await expect(entete("Joueur")).toHaveAttribute("aria-sort", "ascending");
  const croissant = await noms();
  expect(croissant.length).toBeGreaterThan(3);
  await trier("Joueur");
  await expect(entete("Joueur")).toHaveAttribute("aria-sort", "descending");
  expect(await noms()).toEqual([...croissant].reverse());

  // Une colonne de stats : buts, du plus eleve au moins eleve (celui qui en a marque passe en tete).
  const premier = ligne.first();
  await premier.getByRole("button", { name: "augmenter" }).first().click();       // +1 but
  await trier("B");
  await expect(entete("B")).toHaveAttribute("aria-sort", "descending");
  await expect(ligne.first().locator("td").nth(7)).toContainText("1");
  // Le selecteur propose les memes tris, y compris les colonnes masquees sur petit ecran.
  await page.getByRole("combobox", { name: "Trier l'effectif par" }).click();
  await expect(page.getByRole("option", { name: "Tri · Passes decisives" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Tri · Minutes" })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("calendrier : un match ajoute (adversaire choisi dans une liste) apparait au calendrier, puis comme prochain match du dashboard", async () => {
  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
  // La saison choisie est 2026-2027 : le mois suivant est toujours a venir.
  await page.goto("/calendrier");
  await page.getByRole("button", { name: /^[A-Z][a-z]{2,3}\.$/ }).last().click();
  await page.getByTitle("Ajouter un match").first().click();

  const modale = page.locator("div.fixed.inset-0.overflow-y-auto");
  await expect(modale.getByRole("heading", { name: "Nouveau match" })).toBeVisible();
  // Adversaire absent de la liste : on le cree sur place, puis il est choisi.
  await modale.getByRole("combobox", { name: "Rechercher l'adversaire" }).fill("Olympique Test FC");
  await modale.getByRole("button", { name: /Club absent de la liste/ }).click();
  await expect(modale.getByTestId("adversaire-choisi")).toContainText("Olympique Test FC");
  // "Changer" rouvre la recherche ; le club cree est desormais dans la liste.
  await modale.getByRole("button", { name: "Changer" }).click();
  await modale.getByRole("combobox", { name: "Rechercher l'adversaire" }).fill("olympique");
  await modale.getByRole("option", { name: /Olympique Test FC/ }).click();
  await modale.getByRole("button", { name: "Creer le match" }).click();
  await expect(modale).toBeHidden();

  // Au calendrier, par son nom (le club vient d'etre cree : il ne doit pas apparaitre comme un identifiant).
  const lien = page.getByRole("link", { name: /Olympique Test FC/ });
  await expect(lien).toBeVisible();
  const idMatch = (await lien.getAttribute("href"))!.split("/").pop()!;

  // Rattache a l'equipe et a la saison (sans quoi il serait invisible ici et sur le dashboard).
  const match = await (await fetch(`${API_URL}/matchs/${idMatch}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  expect(match.equipeDomId ?? match.equipeExtId).toBeTruthy();
  expect(match.saisonId).toBeTruthy();
  expect(match.statut).toBe("prevu");

  // Dashboard : c'est le prochain match, avec sa date en toutes lettres.
  await page.goto("/");
  const echeance = page.locator("section").filter({ hasText: "Prochaine echeance" }).first();
  await expect(echeance).toContainText("Olympique Test FC");
  await expect(echeance).not.toContainText("Aucun match a venir");
  await expect(echeance).toContainText(/(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) \d{1,2} \w+ \d{4}/);

  // Page Matchs : aucun filtre n'est pre-applique.
  await page.goto("/matchs");
  await expect(page.getByRole("combobox", { name: "Equipe" })).toContainText("Toutes");
  await expect(page.getByRole("combobox", { name: "Journee" })).toContainText("Toutes");
  await expect(page.getByRole("link", { name: /Olympique Test FC/ }).first()).toBeVisible();

  // Menage : la suite des parcours repart sans match a venir.
  await fetch(`${API_URL}/matchs/${idMatch}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
});

test("calendrier : un match cree puis modifie reste unique, et un doublon est refuse avec son motif", async () => {
  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
  const modale = page.locator("div.fixed.inset-0.overflow-y-auto");
  const ouvrirAjout = async () => {
    await page.goto("/calendrier");
    await page.getByRole("button", { name: /^[A-Z][a-z]{2,3}\.$/ }).last().click();
    await page.getByTitle("Ajouter un match").first().click();
    await expect(modale.getByRole("heading", { name: "Nouveau match" })).toBeVisible();
  };

  // Creation : l'adversaire est cree sur place.
  await ouvrirAjout();
  await modale.getByRole("combobox", { name: "Rechercher l'adversaire" }).fill("Racing Doublon");
  await modale.getByRole("button", { name: /Club absent de la liste/ }).click();
  await modale.getByRole("button", { name: "Creer le match" }).click();
  await expect(modale).toBeHidden();
  const lien = page.getByRole("link", { name: /Racing Doublon/ });
  await expect(lien).toHaveCount(1);
  const idMatch = (await lien.getAttribute("href"))!.split("/").pop()!;

  // Le meme match, le meme jour : refuse, avec la raison, et rien n'est cree.
  await ouvrirAjout();
  await modale.getByRole("combobox", { name: "Rechercher l'adversaire" }).fill("racing");
  await modale.getByRole("option", { name: /Racing Doublon/ }).click();
  await modale.getByRole("button", { name: "Creer le match" }).click();
  await expect(modale.getByText(/deja programme a cette date/)).toBeVisible();
  await modale.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByRole("link", { name: /Racing Doublon/ })).toHaveCount(1);

  // Modification depuis la fiche du match : les listes et le calendrier sont ceux de l'application.
  const match = await (await fetch(`${API_URL}/matchs/${idMatch}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const [annee, mois, jour] = (match.date as string).split("-");
  const nouveauJour = jour === "15" ? "20" : "15";
  await page.goto(`/matchs/${idMatch}`);
  await page.getByRole("button", { name: "Modifier" }).click();
  await expect(modale.getByRole("heading", { name: "Modifier le match" })).toBeVisible();

  // Echap ferme la liste ouverte, pas la modale qui la contient.
  const statut = modale.getByRole("combobox", { name: "Statut" });
  await expect(statut).toContainText("Prevu");
  await statut.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(modale.getByRole("heading", { name: "Modifier le match" })).toBeVisible();

  // Calendrier de la date : un jour du mois, puis la saisie au clavier ; Echap referme le calendrier seul.
  const champDate = modale.getByRole("textbox", { name: "Date" });
  await expect(champDate).toHaveValue(`${jour}/${mois}/${annee}`);
  await modale.getByRole("button", { name: "Ouvrir le calendrier" }).click();
  const calendrier = page.getByRole("dialog", { name: "Choisir une date" });
  await expect(calendrier).toBeVisible();
  await calendrier.getByRole("button", { name: new RegExp(`^${nouveauJour} [a-z]+ ${annee}$`) }).click();
  await expect(calendrier).toHaveCount(0);
  await expect(champDate).toHaveValue(`${nouveauJour}/${mois}/${annee}`);
  await modale.getByRole("button", { name: "Ouvrir le calendrier" }).click();
  await page.keyboard.press("Escape");
  await expect(calendrier).toHaveCount(0);
  await expect(modale.getByRole("heading", { name: "Modifier le match" })).toBeVisible();

  await modale.getByRole("button", { name: "Enregistrer" }).click();
  await expect(modale).toBeHidden();

  // Une seule instance au calendrier, a la nouvelle date.
  await page.goto("/calendrier");
  await page.getByRole("button", { name: /^[A-Z][a-z]{2,3}\.$/ }).last().click();
  await expect(page.getByRole("link", { name: /Racing Doublon/ })).toHaveCount(1);
  const tous = await (await fetch(`${API_URL}/matchs`, { headers: { Authorization: `Bearer ${token}` } })).json();
  expect(tous.filter((m: any) => m.id === idMatch || (m.clubExt === match.clubExt && m.clubDom === match.clubDom))).toHaveLength(1);
  expect((await (await fetch(`${API_URL}/matchs/${idMatch}`, { headers: { Authorization: `Bearer ${token}` } })).json()).date).toBe(`${annee}-${mois}-${nouveauJour}`);

  await fetch(`${API_URL}/matchs/${idMatch}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
});

test("referent de club : cree les comptes de ses educateurs, sans rien voir ni pouvoir au-dela de son club", async ({ browser }) => {
  const appeler = async (chemin: string, jeton: string, init: RequestInit = {}) => fetch(`${API_URL}${chemin}`, {
    ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${jeton}`, ...(init.headers ?? {}) },
  });
  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
  const equipeId = (await contexte.cookies()).find((c) => c.name === "ownEquipeId")!.value;
  const equipes: { id: string; clubId: string }[] = await (await appeler("/equipes", token)).json();
  const clubId = equipes.find((e) => e.id === equipeId)!.clubId;
  const autreClub = await (await appeler("/clubs", token, { method: "POST", body: JSON.stringify({ nom: "Club Voisin" }) })).json();
  const educVoisin = await (await appeler("/utilisateurs", token, {
    method: "POST", body: JSON.stringify({ prenom: "Vic", nom: "Voisin", role: "user", clubId: autreClub.id }),
  })).json();

  // L'administrateur nomme un referent pour le club (mot de passe change tout de suite pour pouvoir se connecter).
  const referent = await (await appeler("/utilisateurs", token, {
    method: "POST", body: JSON.stringify({ prenom: "Rita", nom: "Referente", role: "referent", clubId }),
  })).json();
  expect(referent).toMatchObject({ role: "referent", clubId, login: "RREFERENTE" });
  const connexion = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "RREFERENTE", password: referent.initialPassword }),
  })).json();
  await appeler("/auth/change-password", connexion.token, {
    method: "POST", body: JSON.stringify({ oldPassword: referent.initialPassword, newPassword: "Referent123" }),
  });

  // Session du referent, dans son propre navigateur.
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  try {
    await p.goto("/login");
    await p.locator("input[placeholder=MLEMAIRE]").fill("RREFERENTE");
    await p.locator("input[type=password]").fill("Referent123");
    await p.locator("button[type=submit]").click();
    await p.waitForURL((u) => u.pathname === "/");

    // Entree dediee dans la navigation ; pas d'acces aux autres clubs (le club est impose par son jeton).
    await p.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Mes educateurs" }).click();
    await expect(p.getByRole("heading", { name: "Mes educateurs" })).toBeVisible();
    await expect(p.getByText("Aucun educateur pour l'instant")).toBeVisible();

    // Deux educateurs : le referent ne choisit ni role ni club, seulement les equipes (aucune coche = toutes).
    const creer = async (prenom: string, nom: string) => {
      await p.getByRole("button", { name: "Nouvel educateur" }).click();
      const modale = p.locator("div.fixed.inset-0.overflow-y-auto");
      await expect(modale.getByText("Administrateur")).toHaveCount(0);       // pas de choix de role
      await modale.getByPlaceholder("Mathis").fill(prenom);
      await modale.getByPlaceholder("Lemaire").fill(nom);
      await modale.getByRole("button", { name: "Creer le compte" }).click();
      await expect(modale.getByText("Mot de passe initial")).toBeVisible();
      await modale.getByRole("button", { name: "OK" }).click();
    };
    await creer("Luc", "Durand");
    await creer("Lea", "Moreau");
    await expect(p.getByRole("cell", { name: "LDURAND", exact: true })).toBeVisible();
    await expect(p.getByRole("cell", { name: "LMOREAU", exact: true })).toBeVisible();
    await expect(p.getByRole("cell", { name: "VVOISIN", exact: true })).toHaveCount(0);          // l'educateur de l'autre club est invisible

    // Cote API (jeton du referent) : seulement ses educateurs ; jamais d'admin, ni d'autre club, ni les comptes d'autrui.
    const liste: { login: string; role: string; clubId: string }[] = await (await appeler("/utilisateurs", connexion.token)).json();
    expect(liste.map((u) => u.login).sort()).toEqual(["LDURAND", "LMOREAU"]);
    expect(liste.every((u) => u.role === "user" && u.clubId === clubId)).toBe(true);
    const nouveau = (corps: object) => appeler("/utilisateurs", connexion.token, { method: "POST", body: JSON.stringify(corps) });
    expect((await nouveau({ prenom: "Al", nom: "Pwn", role: "admin" })).status).toBe(403);
    expect((await nouveau({ prenom: "Al", nom: "Voisin", clubId: autreClub.id })).status).toBe(403);
    expect((await appeler(`/utilisateurs/${educVoisin.id}`, connexion.token, { method: "DELETE" })).status).toBe(404);
    expect((await appeler(`/utilisateurs/${referent.id}`, connexion.token, { method: "PATCH", body: JSON.stringify({ role: "admin" }) })).status).toBe(404);

    // L'educateur cree se connecte, rattache au club du referent, avec un mot de passe a changer.
    const educ = await (await fetch(`${API_URL}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: "LDURAND", password: "Bienvenue1" }),
    })).json();
    expect(educ.user).toMatchObject({ role: "user", clubId, mustChangePassword: true });
    expect((await appeler("/utilisateurs", educ.token)).status).toBe(403);       // un educateur ne gere aucun compte
  } finally {
    await ctx.close();
    // Menage : la suite des parcours repart sans ces comptes ni ce club.
    for (const login of ["LDURAND", "LMOREAU", "RREFERENTE", "VVOISIN"]) {
      const tous: { id: string; login: string }[] = await (await appeler("/utilisateurs", token)).json();
      const u = tous.find((x) => x.login === login);
      if (u) await appeler(`/utilisateurs/${u.id}`, token, { method: "DELETE" });
    }
    await appeler(`/clubs/${autreClub.id}`, token, { method: "DELETE" });
  }
});

test("recherche : Ctrl+K et / placent le curseur, fiches seulement, Entree ouvre la fiche", async () => {
  await page.goto("/");
  const champ = page.getByRole("combobox", { name: /Rechercher/ });
  // Tape tout de suite apres le raccourci : aucune lettre ne doit se perdre.
  await page.keyboard.press("Control+k");
  await page.keyboard.type("diagolla");
  await expect(champ).toBeFocused();
  await expect(champ).toHaveValue("diagolla");

  // Les joueurs sont cherches cote serveur : une faute de frappe est toleree.
  await expect(page.getByRole("option", { name: /DIAGOLA/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/joueur\//);
  await expect(champ).toHaveValue("");
  await expect(page.getByRole("listbox")).toBeHidden();

  // "/" hors d'un champ rend le curseur ; la recherche ne propose jamais de page : c'est le role de la barre laterale.
  await page.keyboard.press("/");
  await expect(champ).toBeFocused();
  await page.keyboard.type("blessures");
  await expect(page.getByText(/Rien ne correspond/)).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Medical & charge" })).toBeVisible();

  // Echap efface d'abord la saisie, puis rend la main, sans jamais naviguer.
  const url = page.url();
  await page.keyboard.press("Escape");
  await expect(champ).toHaveValue("");
  await page.keyboard.press("Escape");
  await expect(champ).not.toBeFocused();
  expect(page.url()).toBe(url);
});

test("recherche : un club se trouve par son nom et ouvre sa fiche", async () => {
  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
  const clubs: { id: string; nom: string }[] = await (await fetch(`${API_URL}/clubs`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const club = clubs[0];
  const mot = club.nom.split(/\s+/).find((m) => m.length >= 3) ?? club.nom;

  await page.goto("/");
  const champ = page.getByRole("combobox", { name: /Rechercher/ });
  await champ.fill(mot);
  const option = page.getByRole("option", { name: new RegExp(club.nom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first();
  await expect(option).toBeVisible();
  await expect(page.getByText("Clubs", { exact: true })).toBeVisible();
  await option.click();
  await expect(page).toHaveURL(new RegExp(`/club/${club.id}`));
});

test("recherche : un entraineur se trouve par son nom et ouvre sa fiche", async () => {
  test.skip(!pdfplumberDisponible(), "PYTHON_BIN avec pdfplumber requis : les entraineurs viennent de la FMI importee");

  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
  const [coach] = await (await fetch(`${API_URL}/coachs`, { headers: { Authorization: `Bearer ${token}` } })).json();
  expect(coach, "la feuille importee compte au moins un entraineur").toBeTruthy();

  await page.goto("/");
  await page.getByRole("combobox", { name: /Rechercher/ }).fill(coach.nom);
  await expect(page.getByText("Entraineurs", { exact: true })).toBeVisible();
  await page.getByRole("option", { name: new RegExp(coach.nom) }).first().click();
  await expect(page).toHaveURL(/\/coachs\//);
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

    // La recherche est separee du menu : une icone ouvre un champ pleine largeur, qui cherche des fiches.
    await p.getByRole("button", { name: "Rechercher", exact: true }).click();
    const champ = p.getByRole("combobox", { name: /Rechercher/ });
    await expect(champ).toBeFocused();
    await champ.fill("diagolla");
    await expect(p.getByRole("option", { name: /DIAGOLA/ })).toBeVisible();
    await p.getByRole("button", { name: "Fermer", exact: true }).click();
    await expect(champ).toBeHidden();

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
