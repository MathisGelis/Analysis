// Parcours critiques, dans l'ordre : chaque test s'appuie sur l'etat laisse par
// le precedent (connexion -> saison vide -> effectif -> import -> archive).

import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { API_URL, WEB_PORT } from "../playwright.config";
import { FIXTURES, MOT_DE_PASSE } from "./global-setup";
import { VERSION_CGU } from "../src/features/legal/lib/legal";

/** Mot de passe choisi par les comptes crees pendant les parcours (respecte la politique : 12 caracteres, pas courant). */
const MDP_COMPTE = "Ma phrase de passe 1";

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

const FMI = path.resolve(__dirname, "../../foot-analytics-api/parser/tests/fixtures/FMI_reference_anonyme.pdf");

/** Liste deroulante maison : on ouvre le declencheur puis on clique l'option par son libelle exact. */
async function choisir(declencheur: Locator, libelle: string | RegExp) {
  await declencheur.click();
  await declencheur.page().getByRole("option", { name: libelle, exact: typeof libelle === "string" }).click();
}

/**
 * Clique un lien jusqu'a ce que la page change d'URL. Juste apres un chargement, un clic sur un lien Next est parfois perdu
 * (la page se rafraichit pour reparer la selection d'equipe / de saison pendant l'hydratation) : on reclique, sans pour
 * autant masquer un vrai lien casse (l'echec survient apres 20 s).
 */
async function cliquerJusquaNavigation(lien: Locator, url: RegExp) {
  await expect(async () => {
    await lien.click();
    await expect(lien.page()).toHaveURL(url, { timeout: 2_500 });
  }).toPass({ timeout: 20_000 });
}

/** Le bouton du selecteur de saison / equipe, en bas a gauche de la barre laterale. */
const selecteur = (page: Page) => page.locator("aside button.panel-inset, nav button.panel-inset").first();

async function ouvrirSelecteur(page: Page) {
  await selecteur(page).click();
}

test("accès : un visiteur anonyme est renvoye vers /login, et une cible externe est ignoree", async ({ browser }) => {
  const base = `http://localhost:${WEB_PORT}`;
  const anonyme = await browser.newContext();
  const p = await anonyme.newPage();
  try {
    await p.goto(`${base}/matchs`);
    await expect(p).toHaveURL(`${base}/login?from=%2Fmatchs`);

    // Pages legales publiques, liees depuis l'ecran de connexion ; CSP par nonce et noindex sur toutes les pages.
    for (const [lien, titre] of [["Confidentialité", "Politique de confidentialité"], ["Mentions légales", "Mentions légales"], ["Conditions d'utilisation", "Conditions d'utilisation"]]) {
      await p.goto(`${base}/login`);
      await p.getByRole("navigation", { name: "Informations légales" }).getByRole("link", { name: lien }).click();
      await expect(p.getByRole("heading", { level: 1, name: titre })).toBeVisible();
    }
    const reponse = await p.goto(`${base}/confidentialite`);
    expect(reponse!.headers()["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(reponse!.headers()["x-robots-tag"]).toContain("noindex");
    expect(reponse!.headers()["x-frame-options"]).toBe("DENY");
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

test("application installable : manifeste standalone, icones ballon, service worker et page hors ligne, sans session", async ({ browser }) => {
  const base = `http://localhost:${WEB_PORT}`;
  const anonyme = await browser.newContext();
  const p = await anonyme.newPage();
  try {
    await p.goto(`${base}/login`);
    // Liens poses dans <head> : manifeste, favicon ballon, icone de l'ecran d'accueil iPhone.
    const manifeste = await p.locator('link[rel="manifest"]').getAttribute("href");
    expect(manifeste).toBe("/manifest.webmanifest");
    await expect(p.locator('link[rel="icon"][href="/icons/icon.svg"]')).toHaveCount(1);
    await expect(p.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/icons/apple-touch-icon.png");

    // Lus sans session (le navigateur ne les demande pas toujours avec les cookies) : jamais redirige vers /login.
    const m = await p.request.get(`${base}/manifest.webmanifest`, { maxRedirects: 0 });
    expect(m.status()).toBe(200);
    const json = await m.json();
    expect(json).toMatchObject({ name: "Foot Analytics", display: "standalone", start_url: "/" });
    expect(json.icons.map((i: { purpose: string }) => i.purpose)).toContain("maskable");
    for (const chemin of ["/favicon.ico", "/icons/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png",
      "/icons/apple-touch-icon.png", "/sw.js", "/offline.html"]) {
      const r = await p.request.get(`${base}${chemin}`, { maxRedirects: 0 });
      expect({ chemin, statut: r.status() }).toEqual({ chemin, statut: 200 });
    }

    // Le service worker s'installe et prend la main ; il n'a mis en cache que la page hors ligne et son icone (son
    // comportement sans reseau est teste dans tests/pwa/sw.test.ts : Playwright ne coupe pas le reseau d'un service worker).
    await p.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await p.reload();
    expect(await p.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const enCache = await p.evaluate(async () => {
      const cles = await caches.keys();
      const urls = (await Promise.all(cles.map(async (c) => (await (await caches.open(c)).keys()).map((r) => new URL(r.url).pathname)))).flat();
      return urls.sort();
    });
    expect(enCache).toEqual(["/icons/icon.svg", "/offline.html"]);
  } finally {
    await anonyme.close();
  }
});

test("connexion : refus d'un mauvais mot de passe puis accès, équipe choisie d'office", async () => {
  await page.goto("/login");
  await page.getByPlaceholder("MLEMAIRE").fill("AADMIN");
  await page.locator("input[type=password]").fill("pas-le-bon");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("Login ou mot de passe invalide")).toBeVisible();

  await page.locator("input[type=password]").fill(MOT_DE_PASSE);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/");

  // Le middleware a pose l'equipe : elle s'affiche des le premier ecran.
  await expect(selecteur(page)).toContainText("2025-2026");
  await expect(selecteur(page)).toContainText("Seniors D2 Poule C");
});

test("saison sans équipe : choisir la saison reimporte les équipes, la selection n'est jamais vide", async () => {
  await page.goto("/");
  await ouvrirSelecteur(page);
  // 2026-2027 n'a encore aucune equipe pour le club : plutot que de laisser
  // "Aucune equipe", le choix de la saison reimporte celles de la precedente.
  await page.getByRole("button", { name: /^2026-2027/ }).click();

  await expect(selecteur(page)).toContainText("2026-2027");
  await expect(selecteur(page)).toContainText("Seniors D2 Poule C");
  await expect(selecteur(page)).not.toContainText("Aucune équipe");
});

test("cookie d'équipe perime (équipe fusionnee ou supprimée) : la selection est reparee, jamais vide", async () => {
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
  await expect(selecteur(page)).not.toContainText("Aucune équipe");
  await expect(selecteur(page)).toContainText("Seniors D2 Poule C");
  await expect.poll(() => cookie("ownEquipeId")).not.toBe("equipe-disparue");

  // 3. Un rafraichissement garde la selection.
  await page.reload();
  await expect(selecteur(page)).toContainText("Seniors D2 Poule C");
  await expect(selecteur(page)).not.toContainText("Aucune équipe");
});

test("effectif 2026-2027 : ajout d'un joueur existant (recherche floue) puis d'un nouveau", async () => {
  await page.goto("/effectif");
  await expect(page.getByText("KABIFUP")).toHaveCount(0);
  // Effectif vide : un message et un bouton, pas un tableau réduit à ses en-têtes.
  const vide = page.getByTestId("effectif-vide");
  await expect(vide).toContainText("Aucun joueur dans l'effectif");
  await expect(page.locator("table.table-fm")).toHaveCount(0);

  // La modale recouvre la page : on cible ses boutons, pas celui de l'en-tete
  // (le tiroir des reglages, toujours monte, porte aussi "fixed inset-0").
  const modale = page.locator("div.fixed.inset-0.overflow-y-auto");
  const titreModale = page.getByRole("heading", { name: "Ajouter un joueur à l'effectif" });

  // Joueur existant, retrouve malgre la faute de frappe : on ouvre la modale depuis le bouton de l'état vide.
  await vide.getByRole("button", { name: "Ajouter un joueur" }).click();
  await modale.getByPlaceholder(/Tape le nom/).fill("kabifupp");
  await modale.getByRole("button", { name: /Ajouter$/ }).last().click();
  await expect(titreModale).toBeHidden();
  await expect(page.getByRole("link", { name: /KABIFUP/ })).toBeVisible();
  // Avec des joueurs : plus d'état vide, et la légende explique les abréviations des colonnes.
  await expect(vide).toHaveCount(0);
  await expect(page.getByTestId("legende-colonnes")).toContainText("CJ cartons jaunes");
  await expect(page.getByTestId("legende-colonnes")).toContainText("PD passes décisives");

  // Nouveau joueur.
  await page.getByRole("button", { name: /Ajouter/ }).first().click();
  await modale.getByRole("button", { name: "Nouveau joueur" }).click();
  await modale.locator("input.inp").nth(0).fill("Alex");
  await modale.locator("input.inp").nth(1).fill("TESTEUR");
  await modale.getByRole("button", { name: "Créer et ajouter" }).click();
  await expect(titreModale).toBeHidden();
  await expect(page.getByRole("link", { name: /TESTEUR/ })).toBeVisible();
});

test("effectif : la vue change les colonnes (Stats, Médical, Discipline, Profil) et se mémorise", async () => {
  await page.goto("/effectif");
  const entetes = page.locator("table.table-fm thead");
  await expect(entetes).toContainText("Fatigue");

  const choisir = async (vue: string) => {
    await page.getByRole("combobox", { name: "Vue de l'effectif" }).click();
    await page.getByRole("option", { name: new RegExp(vue) }).click();
  };
  await choisir("Stats");
  await expect(entetes).toContainText("B+PD");
  await expect(entetes).not.toContainText("Fatigue");
  await choisir("Médical");
  await expect(entetes).toContainText("ACWR");
  await choisir("Discipline");
  await expect(entetes).toContainText("Disc.");
  await choisir("Profil");
  await expect(entetes).toContainText("Taille");

  await page.reload();                                                         // la vue choisie est retrouvée
  await expect(page.locator("table.table-fm thead")).toContainText("Taille");
  await choisir("Général");
  await expect(page.locator("table.table-fm thead")).toContainText("Fatigue");
  await page.evaluate(() => localStorage.removeItem("fa.vue.effectif"));      // le stockage local est partage avec les tests suivants
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
  await expect(page.getByRole("status").filter({ hasText: "Alex TESTEUR supprimé" })).toBeVisible();
  await expect(page.getByRole("link", { name: /TESTEUR/ })).toHaveCount(0);
  expect(dialogueNatif).toBe(false);
  page.removeAllListeners("dialog");
});

test("tactique : composition sur l'effectif reel, règle des mutés imposee, plan enregistre puis relu", async () => {
  // Effectif de l'equipe choisie : 7 mutes, 3 mutes hors delai (donc 10 au total, plus que le maximum de 6),
  // et 9 joueurs sans mutation. Crees par l'API avec le jeton de la session.
  const equipeId = (await contexte.cookies()).find((c) => c.name === "ownEquipeId")!.value;
  // Le jeton de la session du navigateur est dans un cookie HttpOnly (illisible par la page) : on en ouvre une par l'API.
  expect(await page.evaluate(() => localStorage.getItem("fa.token"))).toBeNull();
  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
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
  await expect(page.getByRole("heading", { name: "11 de départ" })).toBeVisible();
  // Aucun dispositif identifie pour cette equipe (aucun match joue) : le dispositif par defaut, sans pretendre le contraire.
  await expect(page.getByRole("combobox", { name: "Dispositif" })).toContainText("4-2-3-1");
  await expect(page.getByTestId("dispositif-identifie")).toHaveCount(0);

  // Le onze suggere ne depasse jamais 6 mutes dont 2 hors delai (titulaires + remplacants).
  await page.getByRole("button", { name: /Onze suggéré/ }).click();
  const nombre = async (id: string) => Number((await page.getByTestId(id).innerText()).split("/")[0].trim());
  expect(await nombre("mutes")).toBeLessThanOrEqual(6);
  expect(await nombre("hors-delai")).toBeLessThanOrEqual(2);
  await expect(page.getByText("Conforme", { exact: true })).toBeVisible();
  await expect(page.getByTestId("nb-titulaires")).toHaveText("11/11");

  // Le banc propose 3 remplacants par defaut ; le staff peut l'etendre jusqu'a 7.
  await expect(page.getByTestId("nb-remplacants")).toHaveText("3/7");

  // Quota atteint : un mute de plus est grise dans la liste des remplacants, avec sa raison. On complete le banc
  // avec des mutes jusqu'a ce que la regle en refuse (6 mutes au plus sur la feuille).
  const ajout = page.getByRole("combobox", { name: "Ajouter un remplaçant" });
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
  expect(grises.every((t) => /règle des mutés|indisponible/.test(t))).toBe(true);

  // Enregistrement, puis le plan est relu apres rechargement.
  await choisir(page.getByRole("combobox", { name: "Dispositif" }), "3-5-2");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText(/Composition enregistrée/).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Dispositif" })).toContainText("3-5-2");
  await expect(page.getByRole("status")).toContainText("Enregistré le");
  expect(await nombre("mutes")).toBeLessThanOrEqual(6);
});

test("médical : blessures puis fatigue sur la saison en cours, résumé des blessures sur une saison précédente", async () => {
  // Saison choisie : 2026-2027, a venir. Aucune blessure : l'editeur le dit ; la fatigue n'existe pas encore, la section l'explique.
  await page.goto("/medical");
  await expect(page.getByRole("heading", { level: 1, name: /Seniors D2 Poule C/ })).toBeVisible();
  await expect(page.getByTestId("medical-saison")).toContainText("saison à venir");
  await expect(page.getByTestId("suivi-chiffres")).toBeVisible();
  await expect(page.getByTestId("fatigue-effectif")).toContainText("elle apparaît des que la saison est en cours");
  await expect(page.getByTestId("kpi-blessures")).toHaveCount(0);                     // le resume est reserve aux saisons precedentes

  // Deux blessures d'un joueur de l'effectif, dans la saison : une terminee, une sans retour.
  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
  const appeler = (chemin: string, init: RequestInit = {}) => fetch(`${API_URL}${chemin}`, {
    ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const equipeId = (await contexte.cookies()).find((c) => c.name === "ownEquipeId")!.value;
  const effectif: { id: string; nom: string; prenom?: string }[] = await (await appeler(`/joueurs/effectif?equipeId=${equipeId}`)).json();
  const joueur = effectif.find((j) => j.nom.startsWith("MUTE1")) ?? effectif[0];
  const nomJoueur = `${joueur.prenom ?? ""} ${joueur.nom}`.trim();
  const blessure = (joueurId: string, nom: string, extra: Record<string, unknown>) => appeler("/blessures", {
    method: "POST", body: JSON.stringify({ joueurId, joueurNom: nom, ...extra }),
  });
  expect((await blessure(joueur.id, nomJoueur, { localisation: "Cheville", gravite: "Legere", dateDebut: "2026-09-10", retourEstime: "2026-09-24", statut: "Retabli" })).ok).toBe(true);
  expect((await blessure(joueur.id, nomJoueur, { localisation: "Cheville", gravite: "Moyenne", dateDebut: "2026-11-02", statut: "Indisponible" })).ok).toBe(true);
  // Une blessure d'une autre saison ne compte pas dans celle-ci.
  expect((await blessure(joueur.id, nomJoueur, { localisation: "Epaule", dateDebut: "2025-10-01", retourEstime: "2025-10-15", statut: "Retabli" })).ok).toBe(true);

  await page.goto("/medical");
  await expect(page.getByTestId("suivi-chiffres")).toContainText("Blessés");
  await expect(page.getByTestId("suivi-chiffres").locator(".panel", { hasText: "Blessés" })).toContainText("1");   // la seule sans retour
  await expect(page.getByText("Blessures (2)")).toBeVisible();                        // les deux de la saison, pas celle de 2025

  // Saisie par la modale, sur telephone puis tablette : le formulaire tient dans l'ecran (boutons atteignables) et l'enregistrement aboutit.
  // Meme joueur, periode ouverte comme celle du 2 novembre : le chevauchement est signale, puis confirme.
  await page.setViewportSize({ width: 360, height: 740 });
  await page.getByRole("button", { name: /Ajouter/ }).first().click();
  const modaleBlessure = page.locator(".panel-pop");
  await expect(modaleBlessure.getByRole("heading", { name: "Ajouter une blessure" })).toBeVisible();
  await choisir(modaleBlessure.getByRole("combobox", { name: "Joueur" }), nomJoueur);
  await choisir(modaleBlessure.getByRole("combobox", { name: "Région" }), "Genou gauche");
  const largeurModale = await modaleBlessure.evaluate((m) => ({ debordement: m.scrollWidth - m.clientWidth, droite: m.getBoundingClientRect().right, ecran: innerWidth }));
  expect(largeurModale.debordement).toBeLessThanOrEqual(1);
  expect(largeurModale.droite).toBeLessThanOrEqual(largeurModale.ecran);
  await modaleBlessure.getByRole("button", { name: "Enregistrer" }).click();
  await expect(modaleBlessure).toContainText("chevauche");
  await modaleBlessure.getByRole("button", { name: "Enregistrer quand même" }).click();
  await expect(modaleBlessure).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByText("Blessures (3)")).toBeVisible();
  await expect(page.getByText("Genou gauche")).toBeVisible();

  // Saison precedente (2024-2025) : le resume. Un joueur de l'equipe de l'archive, deux blessures dans la saison.
  const fixtures = JSON.parse(readFileSync(FIXTURES, "utf8")) as { equipe2425: string };
  const cree = await (await appeler(`/joueurs/equipe/${fixtures.equipe2425}/create`, {
    method: "POST", body: JSON.stringify({ prenom: "Gil", nom: "ARCHIVE", poste: "DC", statutMutation: "Pas mutation" }),
  })).json();
  const archive = cree.joueur ?? cree;
  expect(archive.id).toBeTruthy();
  expect((await blessure(archive.id, "Gil ARCHIVE", { localisation: "Genou", gravite: "Grave", dateDebut: "2024-10-05", retourEstime: "2024-11-19", statut: "Retabli" })).ok).toBe(true);
  expect((await blessure(archive.id, "Gil ARCHIVE", { localisation: "Genou", gravite: "Moyenne", dateDebut: "2025-02-03", retourEstime: "2025-02-10", statut: "Retabli" })).ok).toBe(true);
  await ouvrirSelecteur(page);
  await page.getByRole("button", { name: /^2024-2025/ }).click();
  await expect(selecteur(page)).toContainText("2024-2025");
  await page.goto("/medical");
  await expect(page.getByTestId("medical-saison")).toContainText("Résumé des blessures de la saison 2024-2025");
  await expect(page.getByTestId("kpi-blessures")).toContainText("2");
  await expect(page.getByTestId("kpi-joueurs")).toContainText("1");
  await expect(page.getByTestId("kpi-jours")).toContainText("52");                    // 45 + 7 jours
  await expect(page.getByTestId("par-localisation")).toContainText("Genou");
  await expect(page.getByTestId("par-mois")).toContainText("oct.");
  await expect(page.getByTestId("joueurs-touches")).toContainText("Gil ARCHIVE");
  await expect(page.getByTestId("rechutes")).toContainText("2 fois");                 // meme joueur, meme genou
  await expect(page.getByTestId("fatigue-effectif")).toHaveCount(0);                  // pas de fatigue sur une saison terminee
  await expect(page.getByText("Blessures de la saison 2024-2025 (2)")).toBeVisible();

  // Saison en cours : la fatigue est TOUJOURS la, meme sans effectif ni charge recente.
  await ouvrirSelecteur(page);
  await page.getByRole("button", { name: /^2025-2026/ }).click();
  await expect(selecteur(page)).toContainText("2025-2026");
  await page.goto("/medical");
  await expect(page.getByTestId("medical-saison")).toContainText("2025-2026");
  await expect(page.getByTestId("kpi-blessures")).toHaveCount(0);
  await expect(page.getByTestId("fatigue-effectif")).toBeVisible();
  await expect(page.getByTestId("fatigue-effectif")).toContainText("Aucune charge récente connue");

  // L'effectif propose le tri par fatigue (et non plus par forme).
  await page.goto("/effectif");
  await page.getByRole("combobox", { name: "Trier l'effectif par" }).click();
  await expect(page.getByRole("option", { name: "Tri · Fatigue" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Tri · Forme" })).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("import FMI : la feuille est importée puis consultable", async () => {
  test.skip(!pdfplumberDisponible(), "PYTHON_BIN avec pdfplumber requis pour parser les PDF");

  await page.goto("/import");
  await page.waitForLoadState("networkidle");                                  // page hydratee : un fichier depose avant serait ignore
  await expect(page.getByText("Pipeline d'import")).toHaveCount(0);            // ni pipeline, ni pastille du parseur, ni encart "cote backend"
  await expect(page.getByText(/pdfplumber|Côté backend/)).toHaveCount(0);
  await page.locator("input[type=file]").first().setInputFiles(FMI);

  await expect(page.getByText("Importé", { exact: true })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: "Voir" }).click();
  await expect(page.getByText("53415223")).toBeVisible();
  await expect(page.getByText("2–0")).toBeVisible();
});

test("recherche de joueurs : par saison, poste et situation, lien vers la fiche, critères conserves au retour", async () => {
  test.skip(!pdfplumberDisponible(), "PYTHON_BIN avec pdfplumber requis : les joueurs viennent de la FMI importée");

  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Navigation principale" });
  await cliquerJusquaNavigation(nav.getByRole("link", { name: "Recherche joueurs", exact: true }), /\/recherche$/);
  await expect(page.getByRole("heading", { level: 1, name: "Recherche de joueurs" })).toBeVisible();

  // La FMI importee est du 18/01/2026 : ses joueurs ont joue en 2025-2026, aucun n'a de feuille en 2026-2027.
  await choisir(page.getByTestId("rj-saison"), /^2025-2026/);
  await choisir(page.getByTestId("rj-cible"), /^2026-2027/);
  await choisir(page.getByTestId("rj-situation"), "Sans club connu");
  await page.getByTestId("rj-lancer").click();
  const resultats = page.getByTestId("rj-resultats");
  await expect(resultats.getByRole("heading", { level: 2 })).toHaveText(/^\d+ joueurs?$/);
  const lignes = page.getByTestId("rj-table").locator("tbody tr");
  expect(await lignes.count()).toBeGreaterThan(10);
  await expect(resultats.getByText("Sans club connu").first()).toBeVisible();
  await expect(page).toHaveURL(/saison=.+&cible=.+&situation=sans_club/);

  // Attaquants seulement (postes de fiche, ou deduits des numeros).
  await choisir(page.getByTestId("rj-poste"), "Attaquants");
  await page.getByTestId("rj-lancer").click();
  await expect(resultats.getByText(/^Attaquants · /)).toBeVisible();
  const postes = await lignes.locator("td:nth-child(2)").allTextContents();
  expect(postes.length).toBeGreaterThan(0);
  expect(postes.every((p) => /^(AT|AG|AD)/.test(p.trim()))).toBe(true);

  // La fiche du premier, puis retour : la meme recherche est relancee depuis l'URL.
  const premier = lignes.first().getByRole("link");
  const nom = (await premier.textContent())!.trim();
  await cliquerJusquaNavigation(premier, /\/joueur\//);
  // Un clic repete pendant une navigation lente (cliquerJusquaNavigation) peut empiler deux fois la fiche : on revient
  // en arriere jusqu'a la recherche.
  await expect(async () => {
    if (!/\/recherche/.test(page.url())) await page.goBack();
    await expect(page).toHaveURL(/\/recherche\?/, { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByTestId("rj-table").locator("tbody tr").first()).toContainText(nom);
  await expect(page.getByTestId("rj-poste")).toHaveText(/Attaquants/);
});

test("rapport d'équipe : sans match analyse sur la saison, la page l'explique sans planter ni inventer de tendance", async () => {
  await page.goto("/rapports");
  await cliquerJusquaNavigation(page.getByRole("link", { name: /^Analyse d'équipe : OL Sud E2E/ }), /\/rapports\/equipe\//);

  await expect(page.getByRole("heading", { level: 1, name: /OL Sud E2E/ })).toBeVisible();
  await expect(page.getByText("Pas encore de match analyse")).toBeVisible();
  // Aucune section de tendance sans echantillon : ni constats, ni courbe, ni navigation par sections.
  await expect(page.getByText("Ce qu'il faut retenir")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Sections du rapport" })).toHaveCount(0);
  // La dynamique n'est pas chiffree : l'anneau est remplace par un tiret expliquant pourquoi.
  await expect(page.getByRole("img", { name: /au moins 6 matchs pour juger une dynamique/ })).toBeVisible();
});

test("rapport pré-match : un clic depuis /rapports, rapport lisible, imprimable sans la coquille", async () => {
  test.skip(!pdfplumberDisponible(), "PYTHON_BIN avec pdfplumber requis : l'adversaire vient de la FMI importée");

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
  await expect(page.getByRole("heading", { level: 1, name: /^Rapport pré-match : .+ contre .+/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pistes pour le match" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Les deux équipes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Face-a-face" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Arbitre" })).toBeVisible();
  // Aucun match programme : le rapport le dit au lieu d'inventer une rencontre.
  await expect(page.getByText(/Aucun match programmé/)).toBeVisible();

  // Un seul bouton "Exporter" (plus de bouton PowerPoint ni d'impression separes) ; il disparait a l'impression avec les barres.
  await expect(page.getByRole("button", { name: "Imprimer / PDF" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Exporter en PowerPoint" })).toHaveCount(0);
  const bouton = page.getByRole("button", { name: "Exporter", exact: true });
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

test("rapport pré-match : bouton Exporter, aperçu, PDF et PowerPoint identiques, pages au choix (sans la page convocation), champs inconnus laisses vides", async () => {
  test.skip(!pdfplumberDisponible(), "PYTHON_BIN avec pdfplumber requis : l'adversaire vient de la FMI importée");

  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
  const clubs: { id: string; nom: string }[] = await (await fetch(`${API_URL}/clubs`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const adversaire = clubs.find((c) => c.nom !== "OL Sud E2E")!;

  await page.goto(`/rapports/prematch/${adversaire.id}`);
  await page.getByRole("button", { name: "Exporter", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Exporter le rapport" })).toBeVisible();
  await expect(page.getByRole("button", { name: "PDF", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("iframe").and(page.getByTitle(/Aperçu de l.export/))).toBeVisible({ timeout: 60_000 });

  // Les seize pages (sept du modele du staff + neuf d'analyse), toutes cochees au depart.
  const cases = page.getByRole("checkbox");
  await expect(cases).toHaveCount(16);
  for (let i = 0; i < 16; i++) await expect(cases.nth(i)).toBeChecked();
  await expect(page.locator("label").getByText("Analyse", { exact: true })).toHaveCount(9);

  // Le modele du staff seul : sept pages ; puis tout recoche.
  await page.getByRole("button", { name: "Modèle seulement" }).click();
  await expect(page.getByText("Pages · 7 pages sur 16")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Nous contre eux/ })).not.toBeChecked();
  await page.getByRole("button", { name: "Tout cocher" }).click();

  // Sans la page convocation ("Le match") : quinze pages.
  await page.getByRole("checkbox", { name: /Le match/ }).uncheck();
  await expect(page.getByText("Pages · 15 pages sur 16")).toBeVisible();

  // Le PDF (format par defaut) : un vrai PDF, de quinze pages, tire du meme PowerPoint.
  const [pdf] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Télécharger le PDF" }).click(),
  ]);
  expect(pdf.suggestedFilename()).toMatch(/^avant-match-.+\.pdf$/);
  const octets = readFileSync((await pdf.path()) as string);
  expect(octets.subarray(0, 4).toString()).toBe("%PDF");
  expect((octets.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(15);

  // Le PowerPoint : memes pages.
  await expect(page.getByText(/avant-match-.+\.pdf/)).toBeVisible();
  await page.getByRole("button", { name: "Exporter", exact: true }).click();
  await page.getByRole("button", { name: "PowerPoint", exact: true }).click();
  const [telechargement] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Télécharger le PowerPoint" }).click(),
  ]);
  expect(telechargement.suggestedFilename()).toMatch(/^avant-match-.+\.pptx$/);

  // Le fichier : une archive de quinze diapositives, sans la page "Le match" (donc sans "Convocation"), avec l'adversaire.
  const [diapos, convocation, adv] = execFileSync(process.env.PYTHON_BIN ?? "python3", ["-c", [
    "import sys, re, zipfile",
    "z = zipfile.ZipFile(sys.argv[1])",
    "n = [x for x in z.namelist() if re.match(r'ppt/slides/slide\\d+\\.xml$', x)]",
    "t = ' '.join(z.read(x).decode('utf8') for x in n)",
    "print(len(n)); print('Convocation' in t); print(sys.argv[2].upper() in t.upper())",
  ].join("\n"), (await telechargement.path()) as string, adversaire.nom]).toString().trim().split("\n");
  expect([diapos, convocation, adv]).toEqual(["15", "False", "True"]);

  // La fenetre se ferme apres le telechargement ; rouverte, elle garde le choix (15 pages). Aucune page cochee : pas de telechargement.
  await expect(page.getByRole("heading", { level: 2, name: "Exporter le rapport" })).toHaveCount(0);
  await page.getByRole("button", { name: "Exporter", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /Le match/ })).not.toBeChecked();
  await page.getByRole("button", { name: "Tout décocher" }).click();
  await expect(page.getByRole("button", { name: /Télécharger le/ })).toBeDisabled();
  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Exporter le rapport" })).toHaveCount(0);
});

test("rapports : un point d'entree unique, un dossier par club, anciennes pages scouting et prédictions redirigees", async () => {
  test.skip(!pdfplumberDisponible(), "PYTHON_BIN avec pdfplumber requis : l'adversaire vient de la FMI importée");

  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
  const appeler = (chemin: string, init: RequestInit = {}) => fetch(`${API_URL}${chemin}`, {
    ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const nav = page.getByRole("navigation", { name: "Navigation principale" });

  // Une seule entree "Rapports" : Scouting et Predictions n'ont plus d'onglet.
  await page.goto("/");
  await expect(nav.getByRole("link", { name: "Rapports", exact: true })).toBeVisible();
  for (const ancien of ["Scouting", "Prédictions"]) await expect(nav.getByRole("link", { name: ancien, exact: true })).toHaveCount(0);

  // Un club adverse avec une equipe sur la saison choisie : son dossier apparait dans la liste.
  const saisonId = (await contexte.cookies()).find((c) => c.name === "ownSaisonId")!.value;
  const club = await (await appeler("/clubs", { method: "POST", body: JSON.stringify({ nom: "Club Dossier" }) })).json();
  expect((await appeler("/equipes", {
    method: "POST", body: JSON.stringify({
      clubId: club.id, nom: "Seniors D2 Poule C", categorie: "Seniors", division: "D2", poule: "C",
      competitionLibelle: "Seniors D2 / Phase Unique", saisonId,
    }),
  })).ok).toBe(true);

  await page.goto("/rapports");
  await expect(page.getByRole("heading", { level: 1, name: /^Rapports/ })).toBeVisible();
  await expect(page.getByTestId("prochain-match")).toContainText("Aucun match programmé");
  const dossiers = page.getByTestId("dossiers-clubs");
  // Mon club : un seul document, l'analyse (on ne prepare pas un match contre soi, on ne s'observe pas).
  const moi = dossiers.getByTestId(/^dossier-/).filter({ hasText: "Mon équipe" });
  await expect(moi.getByRole("link")).toHaveCount(1);
  await expect(moi.getByRole("link", { name: /^Analyse d'équipe : OL Sud E2E/ })).toBeVisible();
  // Un adversaire : les trois documents du dossier.
  const adv = dossiers.getByTestId(`dossier-${club.id}`);
  await expect(adv.getByRole("link", { name: "Pré-match : Club Dossier" })).toHaveAttribute("href", `/rapports/prematch/${club.id}`);
  await expect(adv.getByRole("link", { name: "Analyse d'équipe : Club Dossier" })).toHaveAttribute("href", `/rapports/equipe/${club.id}`);
  await expect(adv.getByRole("link", { name: "Scouting : Club Dossier" })).toHaveAttribute("href", `/club/${club.id}/scouting`);

  // Les trois documents sont relies par les memes onglets : on passe de l'un a l'autre sans repasser par la liste.
  await cliquerJusquaNavigation(adv.getByRole("link", { name: "Pré-match : Club Dossier" }), /\/rapports\/prematch\//);
  const onglets = page.getByRole("navigation", { name: "Documents du club" });
  await expect(onglets.getByRole("link", { name: "Pré-match" })).toHaveAttribute("aria-current", "page");
  await cliquerJusquaNavigation(onglets.getByRole("link", { name: "Scouting" }), /\/club\/.+\/scouting$/);
  await expect(page.getByRole("navigation", { name: "Documents du club" }).getByRole("link", { name: "Scouting" })).toHaveAttribute("aria-current", "page");
  await cliquerJusquaNavigation(page.getByRole("navigation", { name: "Documents du club" }).getByRole("link", { name: "Analyse d'équipe" }), /\/rapports\/equipe\//);
  await expect(page.getByRole("navigation", { name: "Documents du club" }).getByRole("link", { name: "Analyse d'équipe" })).toHaveAttribute("aria-current", "page");

  // Anciennes adresses : redirigees vers le point d'entree unique.
  await page.goto("/scouting");
  await expect(page).toHaveURL(/\/rapports$/);
});

test("entraîneur : cliquable depuis la feuille de match, fiche avec bilan par saison et parcours", async () => {
  test.skip(!pdfplumberDisponible(), "PYTHON_BIN avec pdfplumber requis : les entraîneurs viennent de la FMI importée");

  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
  const get = async (chemin: string) => (await fetch(`${API_URL}${chemin}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const [match] = await get("/matchs");
  const staff: { coach: { id: string; nom: string; prenom: string } }[] = (await get(`/coachs/match/${match.id}`))
    .filter((l: any) => l.fonctions?.split("/").includes("E"));
  expect(staff.length, "la feuille importée compte au moins un entraîneur").toBeGreaterThan(0);
  const { id, nom } = staff[0].coach;

  await page.goto(`/matchs/${match.id}`);
  await cliquerJusquaNavigation(page.getByRole("link", { name: new RegExp(nom) }).first(), new RegExp(`/coachs/${id}`));
  await expect(page.getByRole("heading", { level: 1, name: new RegExp(nom) })).toBeVisible();
  // Portee : la saison choisie par defaut, la carriere complete au clic.
  await cliquerJusquaNavigation(page.getByRole("navigation", { name: "Portée de la fiche" }).getByRole("link", { name: "Carrière complète" }), /portee=carriere/);
  await expect(page.getByRole("heading", { name: "Saison par saison" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Parcours" })).toBeVisible();
  await expect(page.getByText("1 match", { exact: false }).first()).toBeVisible();
});

test("système de jeu : saisi sur la fiche du match, repris par la prediction et le rapport pré-match", async () => {
  test.skip(!pdfplumberDisponible(), "PYTHON_BIN avec pdfplumber requis : le match vient de la FMI importée");

  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
  const get = async (chemin: string) => (await fetch(`${API_URL}${chemin}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const [match] = await get("/matchs");

  await page.goto(`/matchs/${match.id}`);
  // Aucun systeme suppose : la feuille FMI n'en contient pas.
  const domicile = page.getByRole("combobox", { name: /^Système de jeu de / }).first();
  await expect(domicile).toContainText("Non renseigné");
  await choisir(domicile, "4-3-3");
  await expect(page.getByText(/Système de .* : 4-3-3\./)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("combobox", { name: /^Système de jeu de / }).first()).toContainText("4-3-3");

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
  // Un seul match : les numeros ne montrent aucun changement, le systeme probable est celui qui a ete saisi,
  // et les numeros 1 a 11 de la feuille donnent le onze par poste (gardien au 1).
  expect(rapport.systemeAdverse.probable).toMatchObject({ systeme: "4-3-3", source: "renseigne", observations: 1 });
  expect(rapport.numeros.onze).toHaveLength(11);
  expect(rapport.numeros.onze[0]).toMatchObject({ numero: 1, poste: "GB", origine: "numero" });

  // Rapport pre-match : le systeme saisi, d'ou il vient, et le onze place sur le terrain.
  await page.goto(`/rapports/prematch/${match.clubDom}`);
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Système de jeu probable" }) });
  await expect(section.getByText("4-3-3").first()).toBeVisible();
  await expect(section.getByText("Dispositifs renseignés", { exact: true })).toBeVisible();
  await expect(section.getByText("Onze probable", { exact: true }).first()).toBeVisible();

  // Les predictions font partie du rapport pre-match (projection, systeme, onze), sans exemple fictif ; l'ancienne page
  // Predictions renvoie vers les rapports.
  await expect(page.getByRole("heading", { name: "Projection du résultat" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Chez nous : joueurs à ménager" })).toBeVisible();
  await expect(page.getByText("Chaponnay")).toHaveCount(0);
  await page.goto("/ia");
  await expect(page).toHaveURL(/\/rapports$/);
  await page.goto(`/ia?adversaire=${match.clubDom}`);
  await expect(page).toHaveURL(new RegExp(`/rapports/prematch/${match.clubDom}$`));
});

test("système de jeu : un éducateur d'un autre club renseigné un système vide, jamais un système déjà saisi, et le refus est explique", async ({ browser }) => {
  test.skip(!pdfplumberDisponible(), "PYTHON_BIN avec pdfplumber requis : le match vient de la FMI importée");

  const appeler = (jeton: string, chemin: string, init: RequestInit = {}) => fetch(`${API_URL}${chemin}`, {
    ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${jeton}`, ...(init.headers ?? {}) },
  });
  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
  const [match] = await (await appeler(token, "/matchs")).json();
  // Le match de la feuille FMI : le systeme du recevant a ete saisi par l'administrateur (test precedent), celui du visiteur est vide.
  expect(match).toMatchObject({ formationDom: "4-3-3" });
  expect(match.formationExt ?? null).toBeNull();

  // Un educateur d'un club qui n'est pas dans ce match.
  const tiers = await (await appeler(token, "/clubs", { method: "POST", body: JSON.stringify({ nom: "Club Tiers" }) })).json();
  const educ = await (await appeler(token, "/utilisateurs", { method: "POST", body: JSON.stringify({ prenom: "Tom", nom: "Tiers", role: "user", clubId: tiers.id }) })).json();
  const connexion = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: educ.login, password: educ.initialPassword }),
  })).json();
  const change = await (await appeler(connexion.token, "/auth/change-password", { method: "POST", body: JSON.stringify({ oldPassword: educ.initialPassword, newPassword: MDP_COMPTE }) })).json();
  await appeler(change.token, "/auth/cgu", { method: "POST", body: JSON.stringify({ version: VERSION_CGU }) });
  const jeton = (await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: educ.login, password: MDP_COMPTE }),
  })).json()).token;

  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  try {
    await a.goto("/login");
    await a.locator("input[placeholder=MLEMAIRE]").fill(educ.login);
    await a.locator("input[type=password]").fill(MDP_COMPTE);
    await a.locator("button[type=submit]").click();
    await a.waitForURL((u) => u.pathname === "/");

    // Match d'un autre club : on le consulte, on ne le modifie pas (ni bouton Modifier, ni Supprimer).
    await a.goto(`/matchs/${match.id}`);
    await expect(a.getByRole("heading", { level: 2, name: "Systèmes de jeu" })).toBeVisible();
    await expect(a.getByRole("button", { name: "Modifier" })).toHaveCount(0);
    await expect(a.getByRole("button", { name: "Supprimer" })).toHaveCount(0);
    // Le systeme deja saisi se lit (non modifiable) ; le systeme vide se renseigne.
    const sections = a.locator("section", { has: a.getByRole("heading", { name: "Systèmes de jeu" }) });
    await expect(sections.getByText("4-3-3", { exact: true })).toBeVisible();
    await expect(a.getByRole("combobox", { name: /^Système de jeu de / })).toHaveCount(1);

    // Deuxieme onglet, meme compte : il renseigne le systeme du visiteur.
    await b.goto(`/matchs/${match.id}`);
    await choisir(b.getByRole("combobox", { name: /^Système de jeu de / }), "3-5-2");
    await expect(b.getByText(/Système de .* : 3-5-2\./)).toBeVisible();

    // Premier onglet, reste ouvert sur l'ancien etat : corriger ce systeme est refuse, et la raison est dite
    // (au lieu d'un "API 403 sur /matchs/..." muet).
    await choisir(a.getByRole("combobox", { name: /^Système de jeu de / }), "4-4-2");
    await expect(a.getByText(/Enregistrement impossible : Le dispositif de l'equipe visiteuse est deja renseigne \(3-5-2\)/)).toBeVisible();
    await a.reload();
    await expect(a.getByRole("combobox", { name: /^Système de jeu de / })).toHaveCount(0);
    await expect(sections.getByText("3-5-2", { exact: true })).toBeVisible();

    // Cote API : corriger ou effacer est refuse avec sa raison ; modifier le match lui-meme aussi, et la liste le dit.
    const corrige = await appeler(jeton, `/matchs/${match.id}/dispositifs`, { method: "PATCH", body: JSON.stringify({ formationDom: "" }) });
    expect(corrige.status).toBe(403);
    expect((await corrige.json()).message).toMatch(/deja renseigne \(4-3-3\)/);
    const modifie = await appeler(jeton, `/matchs/${match.id}`, { method: "PATCH", body: JSON.stringify({ terrain: "Chez moi" }) });
    expect(modifie.status).toBe(403);
    expect((await modifie.json()).message).toBe("Ce match ne concerne pas ton club.");
    const liste: { id: string; modifiable: boolean }[] = await (await appeler(jeton, "/matchs")).json();
    expect(liste.find((x) => x.id === match.id)!.modifiable).toBe(false);
    expect((await (await appeler(token, `/matchs/${match.id}`)).json()).formationExt).toBe("3-5-2");
  } finally {
    await ctx.close();
  }
});

test("IA (administrateur) : onglet de l'administration, entraînement lance depuis l'ecran, échec explique faute de données", async () => {
  test.skip(!pdfplumberDisponible(), "PYTHON_BIN avec pdfplumber requis : l'entraînement lit les feuilles de match importées");

  await page.goto("/admin/utilisateurs");
  await page.waitForLoadState("networkidle");                                  // page hydratee : un clic donne trop tot sur un lien serait perdu
  // L'IA est dans le menu de gauche de l'administrateur.
  const menu = page.getByRole("navigation", { name: "Navigation principale" });
  await expect(menu.getByRole("link", { name: "IA", exact: true })).toBeVisible();
  await cliquerJusquaNavigation(menu.getByRole("link", { name: "IA", exact: true }), /\/admin\/ia$/);
  await expect(menu.getByRole("link", { name: "IA", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 1, name: "Intelligence artificielle" })).toBeVisible();
  await expect(page.getByTestId("modele-actif")).toContainText("Aucun modèle actif");
  await expect(page.getByTestId("donnees-disponibles")).toContainText(/\d+ matchs? joués?/);
  await expect(page.getByTestId("ia-vide")).toBeVisible();

  // Reentrainement automatique : actif par defaut, chaque mercredi a 5 h, le prochain passage est annonce. Le planificateur
  // ne tourne pas dans l'API de test (il demarre en production) : l'ecran le dit.
  const planning = page.getByTestId("planning-ia");
  await expect(planning).toContainText("chaque mercredi à 5 h (heure de Paris)");
  await expect(planning).toContainText(/Prochain passage : mercredi \d+ \S+, 5 h/);
  await expect(planning).toContainText("Sans modèle actif, il n'est jamais activé tout seul");
  await expect(page.getByTestId("planning-inactif")).toContainText("IA_PLANIFICATEUR=on");
  await planning.getByRole("button", { name: "Suspendre" }).click();
  await expect(planning).toContainText("Suspendu");
  await expect(planning).not.toContainText("Prochain passage");
  await page.reload();
  await expect(page.getByTestId("planning-ia")).toContainText("Suspendu");                  // le reglage survit au rechargement
  await page.getByTestId("planning-ia").getByRole("button", { name: "Réactiver" }).click();
  await expect(page.getByTestId("planning-ia")).toContainText(/Prochain passage : mercredi/);

  await page.getByRole("button", { name: /Lancer un entraînement/ }).first().click();
  await expect(page.getByRole("heading", { level: 2, name: "Lancer un entraînement" })).toBeVisible();
  await page.getByRole("button", { name: "Lancer l'entraînement" }).click();

  // La base de test ne compte qu'une feuille : l'IA ne peut pas apprendre en predisant la semaine suivante. Le serveur
  // l'explique (au lieu d'une erreur technique), l'historique le garde, et aucun modele n'est cree.
  await expect(page.getByTestId("dernier-echec")).toContainText(/au moins deux semaines/);
  await expect(page.getByTestId("historique-ia")).toContainText("Échec");
  await expect(page.getByTestId("modele-actif")).toContainText("Aucun modèle actif");
  await expect(page.getByTestId("resultat-ia")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Lancer un entraînement/ }).first()).toBeEnabled();
});

test("tactique : sans composition enregistrée, le dispositif de départ est celui que le logiciel a identifié pour mon équipe", async () => {
  const fixtures = JSON.parse(readFileSync(FIXTURES, "utf8")) as { clubId: string; equipeId: string; saison2526: string };
  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
  const appeler = (chemin: string, init: RequestInit = {}) => fetch(`${API_URL}${chemin}`, {
    ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const poster = async (chemin: string, corps: unknown) => {
    const res = await appeler(chemin, { method: "POST", body: JSON.stringify(corps) });
    expect(res.ok, `${chemin} -> ${res.status}`).toBe(true);
    return res.json();
  };

  // Saison en cours : un effectif, et deux matchs joues ou le staff a renseigne le dispositif 4-3-3.
  const postes = ["GB", "DC", "DC", "DD", "DG", "MD", "MD", "MO", "AG", "AT", "AT", "DC"];
  for (let i = 0; i < postes.length; i++) {
    await poster(`/joueurs/equipe/${fixtures.equipeId}/create`, { prenom: "Dis", nom: `DEPART${i + 1}`, poste: postes[i], statutMutation: "Pas mutation" });
  }
  const adversaire = await poster("/clubs", { nom: "Adversaire Depart FC", abbr: "ADF", numeroFff: "999002" });
  const matchs: string[] = [];
  for (const date of ["2025-10-05", "2025-10-19"]) {
    const m = await poster("/matchs", {
      clubDom: fixtures.clubId, clubExt: adversaire.id, equipeDomId: fixtures.equipeId, saisonId: fixtures.saison2526,
      date, scoreDom: 2, scoreExt: 1, statut: "joue", formationDom: "4-3-3",
    });
    matchs.push(m.id);
  }

  await ouvrirSelecteur(page);
  await page.getByRole("button", { name: "2025-2026 ★", exact: true }).click();
  await expect(selecteur(page)).toContainText("2025-2026");
  await page.goto("/tactique");
  await expect(page.getByRole("heading", { name: "11 de départ" })).toBeVisible();
  // Pas de composition enregistree : le dispositif de depart est celui que le logiciel a identifie, et la page dit d'ou il vient.
  await expect(page.getByRole("combobox", { name: "Dispositif" })).toContainText("4-3-3");
  await expect(page.getByTestId("dispositif-identifie")).toContainText("4-3-3");
  await expect(page.getByTestId("dispositif-identifie")).toContainText("2 matchs renseignés");
  await expect(page.getByText(/Composition · 4-3-3/).first()).toBeVisible();

  // Une composition enregistree prime : elle garde son dispositif, meme si le logiciel en identifie un autre.
  await choisir(page.getByRole("combobox", { name: "Dispositif" }), "4-4-2");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText(/Composition enregistrée/).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Dispositif" })).toContainText("4-4-2");
  await expect(page.getByTestId("dispositif-identifie")).toHaveCount(0);

  // Menage : la suite des parcours repart sans ces matchs.
  for (const id of matchs) await appeler(`/matchs/${id}`, { method: "DELETE" });
});

test("accessibilite : aucune violation axe sur les pages principales, en thème nuit et jour", async () => {
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
  const pages = ["/", "/rapports", "/recherche", "/matchs", "/effectif", "/tactique", "/arbitres", "/classement", "/calendrier", "/medical", "/admin/ia", "/admin/utilisateurs",
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

test("accessibilité mobile : aucune violation axe, tiroir du menu fermé inerte (jamais atteignable au clavier)", async ({ browser }) => {
  test.setTimeout(180_000);
  const axe = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  const ctx = await browser.newContext({ storageState: await contexte.storageState(), viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  try {
    const violations: string[] = [];
    for (const chemin of ["/", "/effectif", "/matchs", "/calendrier", "/classement", "/admin/utilisateurs"]) {
      await p.goto(chemin);
      await p.waitForLoadState("networkidle");
      await p.evaluate(axe);
      const trouves: string[] = await p.evaluate(async () => {
        const r = await (window as any).axe.run(document, { resultTypes: ["violations"] });
        return r.violations.map((v: any) => `${v.impact} ${v.id} x${v.nodes.length} : ${v.nodes[0].target.join(" ")}`);
      });
      violations.push(...trouves.map((t) => `${chemin} (mobile) ${t}`));
    }
    expect(violations, "violations d'accessibilité en mobile (axe-core)").toEqual([]);

    // Fermé, le tiroir est inerte ; ouvert, ses liens redeviennent atteignables.
    await p.goto("/");
    const tiroir = p.locator("div.fixed.inset-0.z-50[inert]");
    await expect(tiroir).toHaveCount(1);
    await p.getByRole("button", { name: "Ouvrir le menu" }).click();
    await expect(p.locator("div.fixed.inset-0.z-50[inert]")).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});

test("page introuvable : une fiche inconnue dit ce qui manque et ramène à la liste", async () => {
  for (const [chemin, titre, retour, versLaListe] of [
    ["/joueur/identifiant-inconnu", "Joueur introuvable", "Retour à l'effectif", /\/effectif$/],
    ["/matchs/identifiant-inconnu", "Match introuvable", "Retour aux matchs", /\/matchs$/],
    ["/club/identifiant-inconnu", "Club introuvable", "Retour au classement", /\/classement$/],
  ] as const) {
    // (Le statut HTTP reste 200 : le chargement progressif de la page envoie l'en-tete avant de savoir que la fiche manque.)
    await page.goto(chemin);
    await expect(page.getByRole("heading", { level: 1, name: titre })).toBeVisible();
    await expect(page.getByText("Cette page n'a pas pu s'afficher")).toHaveCount(0);
    await cliquerJusquaNavigation(page.getByRole("link", { name: retour }), versLaListe);
  }
});

test("saison archivée : calendrier, entraînements, tactique et prédictions sont fermes, avec leur raison ; le reste reste consultable", async () => {
  const nav = page.getByRole("navigation", { name: "Navigation principale" });
  // Saison active (2025-2026) : toute la preparation du match est ouverte.
  await page.goto("/");
  await ouvrirSelecteur(page);
  await page.getByRole("button", { name: "2025-2026 ★", exact: true }).click();   // (le bouton du selecteur porte lui aussi ce nom de saison)
  await page.goto("/");
  for (const nom of ["Calendrier", "Entraînements", "Tactique", "Saisons", "IA"]) await expect(nav.getByRole("link", { name: nom, exact: true })).toBeVisible();   // l'administrateur voit les Saisons et l'IA

  // Saison archivee (2024-2025) : ces onglets disparaissent de la navigation (Saisons et IA, reserves a l'administrateur, restent).
  await ouvrirSelecteur(page);
  await page.getByRole("button", { name: /^2024-2025/ }).click();
  await page.goto("/");
  for (const nom of ["Calendrier", "Entraînements", "Tactique"]) await expect(nav.getByRole("link", { name: nom, exact: true })).toHaveCount(0);
  for (const nom of ["Effectif", "Médical", "Matchs", "Rapports", "Classement", "Saisons", "IA"]) await expect(nav.getByRole("link", { name: nom, exact: true })).toBeVisible();

  // Taper l'adresse ne contourne rien : la page dit pourquoi, et propose de revenir a la saison en cours.
  for (const [chemin, page_] of [["/tactique", "Tactique"], ["/entrainements", "Entraînements"], ["/calendrier", "Calendrier"]] as const) {
    await page.goto(chemin);
    const indisponible = page.getByTestId("page-indisponible");
    await expect(indisponible).toHaveAttribute("data-restriction", "saison-passee");
    await expect(indisponible).toContainText(`${page_} : disponible sur la saison en cours`);
    await expect(indisponible).toContainText("2024-2025");
    await expect(page.locator("button:enabled", { hasText: "Enregistrer" })).toHaveCount(0);
  }
  // L'ancienne page Predictions renvoie vers les rapports, ou le pre-match est ferme lui aussi.
  await page.goto("/rapports");
  await expect(page.getByTestId("rapports-saison-passee")).toContainText("le pré-match (avec ses prédictions) se prépare sur la saison en cours");
  await expect(page.getByTestId("prochain-match")).toHaveCount(0);
  await page.goto("/rapports/prematch/un-club");
  await expect(page.getByTestId("page-indisponible")).toContainText("Rapport pré-match : disponible sur la saison en cours");

  // Revenir a la saison en cours rouvre ces pages.
  await page.getByRole("button", { name: /Revenir à 2025-2026/ }).click();
  await expect(page.getByTestId("page-indisponible")).toHaveCount(0);       // la page se recharge sur la saison en cours : on attend ce rechargement avant de naviguer
  await page.waitForLoadState("load");
  await page.goto("/tactique");
  await expect(page.getByTestId("page-indisponible")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Tactique", level: 1 })).toBeVisible();   // (l'effectif de cette saison est vide : pas de "11 de depart")
  await page.goto("/entrainements");
  await expect(page.getByTestId("page-indisponible")).toHaveCount(0);
  await page.goto("/calendrier");
  await expect(page.getByTestId("page-indisponible")).toHaveCount(0);

  // Le parcours suivant part de la saison archivee, comme avant.
  await page.goto("/");
  await ouvrirSelecteur(page);
  await page.getByRole("button", { name: /^2024-2025/ }).click();
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
  await expect(page.getByRole("option", { name: "Tri · Passes décisives" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Tri · Minutes" })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("calendrier : un match ajoute (adversaire choisi dans une liste) apparaît au calendrier, puis comme prochain match du dashboard", async () => {
  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
  // La saison choisie est 2026-2027 : le mois suivant est toujours a venir.
  await page.goto("/calendrier");
  await page.getByRole("button", { name: /^\p{Lu}\p{Ll}{2,3}\.$/u }).last().click();
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
  await modale.getByRole("button", { name: "Créer le match" }).click();
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
  const echeance = page.locator("section").filter({ hasText: "Prochaine échéance" }).first();
  await expect(echeance).toContainText("Olympique Test FC");
  await expect(echeance).not.toContainText("Aucun match à venir");
  await expect(echeance).toContainText(/(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) \d{1,2} \S+ \d{4}/);

  // Page Matchs : aucun filtre n'est pre-applique.
  await page.goto("/matchs");
  await expect(page.getByRole("combobox", { name: "Équipe" })).toContainText("Toutes");
  await expect(page.getByRole("combobox", { name: "Journée" })).toContainText("Toutes");
  await expect(page.getByRole("link", { name: /Olympique Test FC/ }).first()).toBeVisible();

  // Menage : la suite des parcours repart sans match a venir.
  await fetch(`${API_URL}/matchs/${idMatch}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
});

test("calendrier : la modale reprend l'heure prevue, une séance se rouvre d'un clic ; entraînements : 6 par page, récents d'abord, présence moyenne", async () => {
  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
  await page.goto("/calendrier");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /^\p{Lu}\p{Ll}{2,3}\.$/u }).last().click();
  // Le creneau prevu (jour + heure) propose l'heure du planning dans la modale de creation.
  const prevu = page.getByRole("button", { name: /Entraînement \d{2}:\d{2}/ }).first();
  const heurePrevue = (await prevu.innerText()).match(/\d{2}:\d{2}/)![0];
  await prevu.click();
  const modale = page.locator("div.fixed.inset-0.overflow-y-auto");
  await expect(modale.getByRole("heading", { name: "Nouvel entraînement" })).toBeVisible();
  await expect(modale).toContainText(heurePrevue);
  await modale.getByPlaceholder("Sortie de balle / pressing").fill("Thème initial e2e");
  await modale.getByRole("button", { name: "Créer la séance" }).click();
  await expect(modale).toBeHidden();

  // Un clic sur la seance rouvre la modale en edition.
  await page.getByRole("button", { name: /Thème initial e2e/ }).click();
  await expect(modale.getByRole("heading", { name: "Modifier la séance" })).toBeVisible();
  await modale.getByPlaceholder("Sortie de balle / pressing").fill("Thème modifie e2e");
  await modale.getByRole("button", { name: "Enregistrer" }).click();
  await expect(modale).toBeHidden();
  await expect(page.getByRole("button", { name: /Thème modifie e2e/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Thème initial e2e/ })).toHaveCount(0);

  // Entrainements : 12 seances au total -> 6 sur chaque page.
  const entr = await (await fetch(`${API_URL}/entrainements`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const creee = entr.find((e: any) => e.theme === "Thème modifie e2e");
  const ids: string[] = [creee.id];
  for (let i = 0; i < 11; i++) {
    const r = await fetch(`${API_URL}/entrainements`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ equipeId: creee.equipeId, date: `2020-01-${String(i + 1).padStart(2, "0")}`, heure: "18:00", type: "Tactique", dureeMin: 60, intensite: 5, espace: "terrain_entier", presents: 5, total: 10 }),
    });
    ids.push((await r.json()).id);
  }
  await page.goto("/entrainements");
  await expect(page.getByTestId("pagination-seances")).toHaveText("Page 1 / 2");
  await expect(page.getByTestId("presence-seance")).toHaveCount(6);
  await expect(page.getByTestId("presence-moyenne")).toContainText("Moyenne :");
  await page.getByRole("button", { name: /Suivant/ }).click();
  await expect(page.getByTestId("pagination-seances")).toHaveText("Page 2 / 2");
  await expect(page.getByTestId("presence-seance")).toHaveCount(6);

  for (const id of ids) await fetch(`${API_URL}/entrainements/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
});

test("calendrier : jours d'entraînement prévus et événements « autre » gardés par le serveur (plus dans le navigateur), l'ancien stockage est repris", async () => {
  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
  // L'equipe de la barre laterale (cookie), celle dont la page lit le planning.
  const equipeId = (await page.context().cookies()).find((c) => c.name === "ownEquipeId")?.value
    ?? (JSON.parse(readFileSync(FIXTURES, "utf8")) as { equipeId: string }).equipeId;
  const fixtures = { equipeId };
  const duServeur = async () => (await fetch(`${API_URL}/planning-equipe/${fixtures.equipeId}`, { headers: { Authorization: `Bearer ${token}` } })).json();

  // Un navigateur qui garde encore l'ancien stockage local : repris une fois par le serveur, puis efface.
  await page.goto("/calendrier");
  await page.waitForLoadState("networkidle");
  await page.evaluate(({ id }) => {
    localStorage.setItem(`fa.planning.${id}`, JSON.stringify({ jours: [4, 0], heure: "18:15" }));
    localStorage.setItem(`fa.autres.${id}`, JSON.stringify([{ id: "autre-1700000000000-e2e001", date: "2026-12-05", titre: "Réunion staff e2e" }]));
  }, { id: fixtures.equipeId });
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect.poll(async () => (await duServeur()).planning).toEqual({ jours: [0, 4], heure: "18:15" });
  expect((await duServeur()).autres.map((e: any) => e.titre)).toEqual(["Réunion staff e2e"]);
  expect(await page.evaluate((id) => [localStorage.getItem(`fa.planning.${id}`), localStorage.getItem(`fa.autres.${id}`)], fixtures.equipeId)).toEqual([null, null]);

  // Un autre appareil (contexte neuf, sans stockage local) voit le meme planning.
  const autre = await page.context().browser()!.newContext({ storageState: await page.context().storageState() });
  const p2 = await autre.newPage();
  await p2.goto(`http://localhost:${WEB_PORT}/calendrier`);
  await p2.waitForLoadState("networkidle");
  expect(await p2.evaluate(() => localStorage.length)).toBe(0);
  await autre.close();
  await fetch(`${API_URL}/planning-equipe/${fixtures.equipeId}/autres/autre-1700000000000-e2e001`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
});

test("calendrier : un match cree puis modifie reste unique, et un doublon est refuse avec son motif", async () => {
  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
  const modale = page.locator("div.fixed.inset-0.overflow-y-auto");
  // Le mois montre la premiere fois est RETENU : le calendrier s'ouvre sur un mois qui depend de la date du jour et des matchs deja
  // crees, et un mois different a chaque ouverture creerait deux matchs a des dates differentes (donc pas un doublon).
  const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const rang = (t: string) => { const [m, a] = t.trim().toLowerCase().split(/\s+/); return Number(a) * 12 + MOIS.indexOf(m); };
  let moisCible: string | null = null;
  const ouvrirMois = async () => {
    await page.goto("/calendrier");
    const entete = page.getByText(/^\p{Lu}\p{Ll}+ \d{4}$/u).first();
    const boutons = page.getByRole("button", { name: /^\p{Lu}\p{Ll}{2,3}\.$/u });
    await expect(entete).toBeVisible();
    if (moisCible === null) {
      const avant = (await entete.innerText()).trim();
      await boutons.last().click();
      await expect(entete).not.toHaveText(avant);
      moisCible = (await entete.innerText()).trim();
      return;
    }
    for (let i = 0; i < 24; i++) {
      const actuel = (await entete.innerText()).trim();
      if (actuel === moisCible) return;
      await (rang(actuel) < rang(moisCible) ? boutons.last() : boutons.first()).click();
      await expect(entete).not.toHaveText(actuel);
    }
  };
  const ouvrirAjout = async () => {
    await ouvrirMois();
    await page.getByTitle("Ajouter un match").first().click();
    await expect(modale.getByRole("heading", { name: "Nouveau match" })).toBeVisible();
  };

  // Creation : l'adversaire est cree sur place.
  await ouvrirAjout();
  await modale.getByRole("combobox", { name: "Rechercher l'adversaire" }).fill("Racing Doublon");
  await modale.getByRole("button", { name: /Club absent de la liste/ }).click();
  await modale.getByRole("button", { name: "Créer le match" }).click();
  await expect(modale).toBeHidden();
  const lien = page.getByRole("link", { name: /Racing Doublon/ });
  await expect(lien).toHaveCount(1);
  const idMatch = (await lien.getAttribute("href"))!.split("/").pop()!;

  // Le meme match, le meme jour : refuse, avec la raison, et rien n'est cree.
  await ouvrirAjout();
  await modale.getByRole("combobox", { name: "Rechercher l'adversaire" }).fill("racing");
  await modale.getByRole("option", { name: /Racing Doublon/ }).click();
  await modale.getByRole("button", { name: "Créer le match" }).click();
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
  await expect(statut).toContainText("Prévu");
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
  await calendrier.getByRole("button", { name: new RegExp(`^${nouveauJour} \\S+ ${annee}$`) }).click();
  await expect(calendrier).toHaveCount(0);
  await expect(champDate).toHaveValue(`${nouveauJour}/${mois}/${annee}`);
  await modale.getByRole("button", { name: "Ouvrir le calendrier" }).click();
  await page.keyboard.press("Escape");
  await expect(calendrier).toHaveCount(0);
  await expect(modale.getByRole("heading", { name: "Modifier le match" })).toBeVisible();

  await modale.getByRole("button", { name: "Enregistrer" }).click();
  await expect(modale).toBeHidden();

  // Une seule instance au calendrier, a la nouvelle date.
  await ouvrirMois();
  await expect(page.getByRole("link", { name: /Racing Doublon/ })).toHaveCount(1);
  const tous = await (await fetch(`${API_URL}/matchs`, { headers: { Authorization: `Bearer ${token}` } })).json();
  expect(tous.filter((m: any) => m.id === idMatch || (m.clubExt === match.clubExt && m.clubDom === match.clubDom))).toHaveLength(1);
  expect((await (await fetch(`${API_URL}/matchs/${idMatch}`, { headers: { Authorization: `Bearer ${token}` } })).json()).date).toBe(`${annee}-${mois}-${nouveauJour}`);

  await fetch(`${API_URL}/matchs/${idMatch}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
});

test("référent de club : cree les comptes de ses éducateurs, sans rien voir ni pouvoir au-dela de son club", async ({ browser }) => {
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
  const change = await appeler("/auth/change-password", connexion.token, {
    method: "POST", body: JSON.stringify({ oldPassword: referent.initialPassword, newPassword: MDP_COMPTE }),
  });
  // Changer de mot de passe ferme toutes les sessions du compte (le jeton temporaire est revoque) : on prend le nouveau.
  const ancienJeton = connexion.token;
  connexion.token = (await change.json()).token;
  await appeler("/auth/cgu", connexion.token, { method: "POST", body: JSON.stringify({ version: VERSION_CGU }) });
  expect((await appeler("/auth/me", ancienJeton)).status).toBe(401);

  // Session du referent, dans son propre navigateur.
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  try {
    await p.goto("/login");
    await p.locator("input[placeholder=MLEMAIRE]").fill("RREFERENTE");
    await p.locator("input[type=password]").fill(MDP_COMPTE);
    await p.locator("button[type=submit]").click();
    await p.waitForURL((u) => u.pathname === "/");

    // Les saisons et l'IA sont reservees a l'administrateur : ni onglet, ni page (l'adresse tapee a la main est refusee).
    const navReferent = p.getByRole("navigation", { name: "Navigation principale" });
    await expect(navReferent.getByRole("link", { name: "Import feuilles FMI" })).toBeVisible();
    await expect(navReferent.getByRole("link", { name: "Saisons", exact: true })).toHaveCount(0);
    await expect(navReferent.getByRole("link", { name: "IA", exact: true })).toHaveCount(0);
    for (const chemin of ["/saisons", "/admin/ia"]) {
      await p.goto(chemin);
      await expect(p.getByTestId("page-indisponible")).toHaveAttribute("data-restriction", "admin");
      await expect(p.getByTestId("page-indisponible")).toContainText("réservé à l'administrateur");
    }
    await p.goto("/");

    // Entree dediee dans la navigation ; pas d'acces aux autres clubs (le club est impose par son jeton).
    // Au meme endroit que l'administration (en bas de la barre laterale, a cote de la deconnexion), pas dans les menus.
    await expect(p.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Mes éducateurs" })).toHaveCount(0);
    await p.getByRole("link", { name: "Mes éducateurs" }).click();
    await expect(p.getByRole("heading", { name: "Mes éducateurs" })).toBeVisible();
    await expect(p.getByText("Aucun éducateur pour l'instant")).toBeVisible();

    // Deux educateurs : le referent ne choisit ni role ni club, seulement les equipes (aucune coche = toutes).
    const creer = async (prenom: string, nom: string) => {
      await p.getByRole("button", { name: "Nouvel éducateur" }).click();
      const modale = p.locator("div.fixed.inset-0.overflow-y-auto");
      await expect(modale.getByText("Administrateur")).toHaveCount(0);       // pas de choix de role
      await modale.getByPlaceholder("Mathis").fill(prenom);
      await modale.getByPlaceholder("Lemaire").fill(nom);
      await modale.getByRole("button", { name: "Créer le compte" }).click();
      await expect(modale.getByText("Mot de passe temporaire")).toBeVisible();
      // Tire au hasard, affiche une seule fois.
      const temporaire = (await modale.getByTestId("mot-de-passe-temporaire").textContent()) ?? "";
      expect(temporaire).toMatch(/^\S{4}-\S{4}-\S{4}-\S{4}$/);
      await modale.getByRole("button", { name: "OK" }).click();
      return temporaire;
    };
    const temporaireLuc = await creer("Luc", "Durand");
    await creer("Lea", "Moreau");
    await expect(p.getByRole("cell", { name: "LDURAND", exact: true })).toBeVisible();
    await expect(p.getByRole("cell", { name: "LMOREAU", exact: true })).toBeVisible();
    await expect(p.getByRole("cell", { name: "VVOISIN", exact: true })).toHaveCount(0);          // l'educateur de l'autre club est invisible
    // Chaque compte affiche son createur : ici le referent, avec son identifiant.
    await expect(p.getByTestId("createur-LDURAND")).toContainText("Rita Referente");
    await expect(p.getByTestId("createur-LDURAND")).toContainText("RREFERENTE");

    // Cote API (jeton du referent) : seulement ses educateurs ; jamais d'admin, ni d'autre club, ni les comptes d'autrui.
    const liste: { login: string; role: string; clubId: string }[] = await (await appeler("/utilisateurs", connexion.token)).json();
    expect(liste.map((u) => u.login).sort()).toEqual(["LDURAND", "LMOREAU"]);
    expect(liste.every((u) => u.role === "user" && u.clubId === clubId)).toBe(true);
    const nouveau = (corps: object) => appeler("/utilisateurs", connexion.token, { method: "POST", body: JSON.stringify(corps) });
    expect((await nouveau({ prenom: "Al", nom: "Pwn", role: "admin" })).status).toBe(403);
    expect((await nouveau({ prenom: "Al", nom: "Voisin", clubId: autreClub.id })).status).toBe(403);
    expect((await appeler(`/utilisateurs/${educVoisin.id}`, connexion.token, { method: "DELETE" })).status).toBe(404);
    expect((await appeler(`/utilisateurs/${referent.id}`, connexion.token, { method: "PATCH", body: JSON.stringify({ role: "admin" }) })).status).toBe(404);

    // L'educateur cree se connecte, rattache au club du referent, avec un mot de passe a changer ; l'ancien mot de
    // passe commun ne marche pas.
    const commun = await fetch(`${API_URL}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: "LDURAND", password: "Bienvenue1" }),
    });
    expect(commun.status).toBe(401);
    const educ = await (await fetch(`${API_URL}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: "LDURAND", password: temporaireLuc }),
    })).json();
    expect(educ.user).toMatchObject({ role: "user", clubId, mustChangePassword: true });
    expect((await appeler("/utilisateurs", educ.token)).status).toBe(403);       // un educateur ne gere aucun compte
    const bloque = await appeler("/matchs", educ.token);                           // le mot de passe temporaire ne sert qu'a en choisir un
    expect(bloque.status).toBe(403);
    expect((await bloque.json()).code).toBe("MOT_DE_PASSE_A_CHANGER");
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

test("comptes : équipe de la saison actuelle sans la poule, saisons de l'historique, créateur affiche, restrictions appliquees", async ({ browser }) => {
  const fixtures = JSON.parse(readFileSync(FIXTURES, "utf8")) as { clubId: string; equipeId: string; saison2425: string; saison2526: string };
  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
  const appeler = (chemin: string, init: RequestInit = {}) => fetch(`${API_URL}${chemin}`, {
    ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const comptes = async (): Promise<any[]> => (await appeler("/utilisateurs")).json();
  const modale = page.locator("div.fixed.inset-0.overflow-y-auto");

  // Creation par l'administrateur : equipe de la saison actuelle (2025-2026) par son niveau, et une saison de l'historique.
  await page.goto("/admin/utilisateurs");
  await page.getByRole("button", { name: "Nouveau compte" }).click();
  await modale.getByPlaceholder("Mathis").fill("Eric");
  await modale.getByPlaceholder("Lemaire").fill("Coach");
  await choisir(modale.getByRole("combobox", { name: "Club autorisé" }), "OL Sud E2E");
  const equipes = modale.getByRole("group", { name: /^Équipes attribuées/ });
  await expect(equipes).toContainText("saison 2025-2026");
  await expect(equipes.getByRole("checkbox")).toHaveCount(1);                                 // un niveau, pas une ligne par poule ni par saison
  await expect(equipes.getByText("Seniors D2", { exact: true })).toBeVisible();
  await expect(equipes).not.toContainText("Poule");
  await equipes.getByRole("checkbox", { name: "Seniors D2" }).check();

  const saisons = modale.getByRole("group", { name: "Saisons consultables" });
  await expect(saisons.getByRole("button", { name: "Cette saison uniquement" })).toHaveAttribute("aria-pressed", "true");   // defaut d'un nouveau compte
  await expect(modale.getByTestId("resume-saisons")).toContainText("Voit la saison actuelle (2025-2026) et les suivantes, pas l'historique");
  await saisons.getByRole("button", { name: "Choisir des saisons" }).click();
  await saisons.getByRole("checkbox", { name: "2024-2025" }).check();
  await expect(saisons.getByRole("checkbox")).toHaveCount(1);                                 // seules les saisons passees se choisissent
  await expect(modale.getByTestId("resume-saisons")).toContainText("+ 2024-2025");
  await modale.getByRole("button", { name: "Créer le compte" }).click();
  await expect(modale.getByText("Mot de passe temporaire")).toBeVisible();
  const temporaireEric = (await modale.getByTestId("mot-de-passe-temporaire").textContent()) ?? "";
  await modale.getByRole("button", { name: "OK" }).click();

  // La liste : equipe sans poule, saisons, createur (l'administrateur connecte).
  const ligne = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "ECOACH", exact: true }) });
  await expect(ligne).toContainText("Seniors D2");
  await expect(ligne).not.toContainText("Poule");
  await expect(ligne).toContainText("Actuelle + 2024-2025");
  await expect(page.getByTestId("createur-ECOACH")).toContainText("Admin Admin");
  await expect(page.getByTestId("createur-ECOACH")).toContainText("AADMIN");
  // Les comptes anterieurs au suivi n'ont pas de createur connu.
  await expect(page.getByTestId("createur-AADMIN")).toHaveText("—");

  // Cote API : equipe de la saison actuelle, saison passee choisie, createur enregistre.
  const eric = (await comptes()).find((u) => u.login === "ECOACH");
  expect(eric).toMatchObject({ role: "user", toutesSaisons: false, saisonIds: [fixtures.saison2425], equipeIds: [fixtures.equipeId], createur: { login: "AADMIN" } });

  // La modification montre ce que le compte a deja : niveau coche, saison choisie.
  await ligne.getByRole("button", { name: "Modifier ECOACH" }).click();
  await expect(modale.getByRole("group", { name: /^Équipes attribuées/ }).getByRole("checkbox", { name: "Seniors D2" })).toBeChecked();
  await expect(modale.getByRole("group", { name: "Saisons consultables" }).getByRole("button", { name: "Choisir des saisons" })).toHaveAttribute("aria-pressed", "true");
  await expect(modale.getByRole("group", { name: "Saisons consultables" }).getByRole("checkbox", { name: "2024-2025" })).toBeChecked();
  await modale.getByRole("button", { name: "Annuler" }).click();

  // Un second educateur, limite a la saison actuelle (par l'API : le formulaire est deja couvert ci-dessus).
  const fred = await (await appeler("/utilisateurs", { method: "POST", body: JSON.stringify({
    prenom: "Fred", nom: "Seul", role: "user", clubId: fixtures.clubId, equipeIds: [fixtures.equipeId], toutesSaisons: false,
  }) })).json();
  expect(fred).toMatchObject({ toutesSaisons: false, saisonIds: [] });

  // Ce que chacun voit dans le selecteur de saison, a sa connexion (mot de passe change d'avance par l'API).
  const saisonsVues = async (login: string, initial: string) => {
    const jeton = (await (await fetch(`${API_URL}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login, password: initial }),
    })).json()).token;
    await fetch(`${API_URL}/auth/change-password`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${jeton}` },
      body: JSON.stringify({ oldPassword: initial, newPassword: MDP_COMPTE }),
    });
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    try {
      await p.goto("/login");
      await p.locator("input[placeholder=MLEMAIRE]").fill(login);
      await p.locator("input[type=password]").fill(MDP_COMPTE);
      await p.locator("button[type=submit]").click();
      await p.waitForURL((u) => u.pathname === "/");
      // Premiere connexion : les conditions d'utilisation sont a accepter avant tout (case a cocher obligatoire),
      // une seule fois par version.
      const cgu = p.getByRole("dialog", { name: "Conditions d'utilisation" });
      await expect(cgu).toBeVisible();
      await expect(cgu.getByRole("button", { name: "Accepter et continuer" })).toBeDisabled();
      await cgu.getByRole("checkbox").check();
      await cgu.getByRole("button", { name: "Accepter et continuer" }).click();
      await expect(cgu).toBeHidden();
      await p.reload();
      await expect(p.getByRole("dialog", { name: "Conditions d'utilisation" })).toHaveCount(0);
      await selecteur(p).click();
      const liste = p.getByRole("dialog", { name: "Choix de la saison et de l'équipe" });
      await expect(liste).toBeVisible();
      await expect(liste.getByRole("button", { name: /^2025-2026/ })).toBeVisible();
      return {
        passee: await liste.getByRole("button", { name: /^2024-2025/ }).count(),
        suivante: await liste.getByRole("button", { name: /^2026-2027/ }).count(),
      };
    } finally {
      await ctx.close();
    }
  };
  expect(await saisonsVues("ECOACH", temporaireEric)).toEqual({ passee: 1, suivante: 1 });   // actuelle + 2024-2025 choisie + saison a venir
  expect(await saisonsVues("FSEUL", fred.initialPassword)).toEqual({ passee: 0, suivante: 1 });    // l'historique reste ferme

  // Et c'est l'API qui le garantit, pas le front : avec le jeton de l'educateur, la saison fermee est introuvable, ses equipes et ses
  // matchs ne sortent pas, et les operations qui concernent tout le monde sont refusees.
  const jetonDe = async (login: string) => (await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login, password: MDP_COMPTE }),
  })).json()).token as string;
  const lire = async (jeton: string, chemin: string, init: RequestInit = {}) => fetch(`${API_URL}${chemin}`, {
    ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${jeton}` },
  });
  const fseul = await jetonDe("FSEUL");
  expect((await (await lire(fseul, "/saisons")).json()).map((x: any) => x.nom).sort()).toEqual(["2025-2026", "2026-2027"]);
  expect((await lire(fseul, `/saisons/${fixtures.saison2425}`)).status).toBe(404);
  expect((await (await lire(fseul, "/equipes")).json()).some((e: any) => e.saisonId === fixtures.saison2425)).toBe(false);
  expect((await (await lire(fseul, "/matchs")).json()).some((x: any) => x.saisonId === fixtures.saison2425)).toBe(false);
  expect((await lire(fseul, "/saisons", { method: "POST", body: JSON.stringify({ nom: "2030-2031", anneeDebut: 2030 }) })).status).toBe(403);
  expect((await lire(fseul, "/seed/reset", { method: "POST" })).status).toBe(403);
  const ecoachJeton = await jetonDe("ECOACH");
  expect((await lire(ecoachJeton, `/saisons/${fixtures.saison2425}`)).status).toBe(200);         // celle qu'on lui a ouverte

  // Menage : la suite des parcours repart sans ces comptes.
  for (const u of (await comptes()).filter((x) => ["ECOACH", "FSEUL"].includes(x.login))) {
    await appeler(`/utilisateurs/${u.id}`, { method: "DELETE" });
  }
});

test("recherche : Ctrl+K et / placent le curseur, fiches seulement, Entree ouvre la fiche", async () => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");   // le raccourci n'existe qu'une fois la page hydratee
  const champ = page.getByRole("combobox", { name: /Rechercher/ });
  // Tape tout de suite apres le raccourci : aucune lettre ne doit se perdre.
  await page.keyboard.press("Control+k");
  await page.keyboard.type("kabifupp");
  await expect(champ).toBeFocused();
  await expect(champ).toHaveValue("kabifupp");

  // Les joueurs sont cherches cote serveur : une faute de frappe est toleree.
  await expect(page.getByRole("option", { name: /KABIFUP/ })).toBeVisible();
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
  await expect(page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Médical", exact: true })).toBeVisible();

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

test("recherche : un entraîneur se trouve par son nom et ouvre sa fiche", async () => {
  test.skip(!pdfplumberDisponible(), "PYTHON_BIN avec pdfplumber requis : les entraîneurs viennent de la FMI importée");

  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
  const [coach] = await (await fetch(`${API_URL}/coachs`, { headers: { Authorization: `Bearer ${token}` } })).json();
  expect(coach, "la feuille importée compte au moins un entraîneur").toBeTruthy();

  await page.goto("/");
  await page.getByRole("combobox", { name: /Rechercher/ }).fill(coach.nom);
  await expect(page.getByText("Entraîneurs", { exact: true })).toBeVisible();
  await page.getByRole("option", { name: new RegExp(coach.nom) }).first().click();
  await expect(page).toHaveURL(/\/coachs\//);
});

test("barre latérale : repliee en rail, l'état survit au rechargement", async () => {
  await page.goto("/effectif");
  await page.getByRole("button", { name: "Replier la barre latérale" }).click();
  await expect(page.getByRole("button", { name: "Déplier la barre latérale" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Déplier la barre latérale" })).toBeVisible();

  await page.getByRole("button", { name: "Déplier la barre latérale" }).click();
  await expect(page.getByRole("button", { name: "Replier la barre latérale" })).toBeVisible();
});

test("mobile : menu en tiroir, ferme après navigation, sans debordement horizontal", async ({ browser }) => {
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
    await champ.fill("kabifupp");
    await expect(p.getByRole("option", { name: /KABIFUP/ })).toBeVisible();
    await p.getByRole("button", { name: "Fermer", exact: true }).click();
    await expect(champ).toBeHidden();

    // La page ne deborde pas de l'ecran (les tableaux defilent dans leur panneau).
    const debordement = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(debordement).toBeLessThanOrEqual(1);
  } finally {
    await mobile.close();
  }
});

test("responsive : aucune page ne deborde de l'ecran, sur mobile et tablette (portrait et paysage)", async ({ browser }) => {
  test.setTimeout(300_000);
  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
  const get = async (chemin: string) => (await fetch(`${API_URL}${chemin}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const clubs: { id: string }[] = await get("/clubs");
  const matchs: { id: string }[] = await get("/matchs");
  const arbitres: { id: string }[] = await get("/arbitres");
  const joueurs: { id: string }[] = await get("/joueurs");
  const pages = [
    "/", "/matchs", "/effectif", "/tactique", "/arbitres", "/classement", "/calendrier", "/medical", "/entrainements",
    "/rapports", "/rapports/equipe", "/saisons", "/admin/ia", "/admin/utilisateurs", "/import", "/analytics", "/ia", "/scouting",
    ...(clubs[0] ? [`/club/${clubs[0].id}`, `/club/${clubs[0].id}/scouting`, `/rapports/prematch/${clubs[0].id}`, `/rapports/equipe/${clubs[0].id}`] : []),
    ...(matchs[0] ? [`/matchs/${matchs[0].id}`] : []),
    ...(arbitres[0] ? [`/arbitres/${arbitres[0].id}`] : []),
    ...(joueurs[0] ? [`/joueur/${joueurs[0].id}`] : []),
  ];
  const tailles = [
    { width: 360, height: 740 }, { width: 390, height: 844 }, { width: 768, height: 1024 },
    { width: 1024, height: 768 }, { width: 844, height: 390 },
  ];
  const debordements: string[] = [];
  for (const viewport of tailles) {
    const ctx = await browser.newContext({ viewport, storageState: await contexte.storageState() });
    const p = await ctx.newPage();
    try {
      for (const chemin of pages) {
        await p.goto(chemin);
        await p.waitForLoadState("networkidle");
        const fautifs: string[] = await p.evaluate(() => {
          const largeur = window.innerWidth;
          const sortis: string[] = [];
          if (document.documentElement.scrollWidth - largeur > 1) sortis.push(`PAGE scrollWidth=${document.documentElement.scrollWidth}`);
          // Telephone : un tableau ne doit pas etre rogne dans son panneau (contenu plus large que le cadre).
          if (largeur < 640) {
            for (const el of Array.from(document.querySelectorAll<HTMLElement>(".panel"))) {
              if (getComputedStyle(el).overflowX !== "hidden" && el.scrollWidth - el.clientWidth > 1) sortis.push(`PANNEAU rogne ${el.scrollWidth - el.clientWidth}px : ${el.textContent?.trim().slice(0, 40)}`);
            }
          }
          for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (r.right - largeur > 1) {
              // Ignore ce qui est dans un conteneur defilant (tableaux) : il n'elargit pas la page.
              let a: HTMLElement | null = el.parentElement, defile = false;
              while (a && a !== document.body) {
                const o = getComputedStyle(a).overflowX;
                if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip" || getComputedStyle(a).position === "fixed") { defile = true; break; }
                a = a.parentElement;
              }
              if (!defile && getComputedStyle(el).position !== "fixed") sortis.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)} right=${Math.round(r.right)}`);
            }
          }
          return sortis.slice(0, 4);
        });
        if (fautifs.length) debordements.push(`${viewport.width}x${viewport.height} ${chemin.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ":id")} : ${fautifs.join(" | ")}`);
      }
    } finally {
      await ctx.close();
    }
  }
  expect(debordements, "pages qui debordent de l'ecran").toEqual([]);
});

/** Un calendrier d'equipe au format de la FFF (clubs fictifs), a partir de demain : un match par semaine. */
function calendrierFff(sansJournee?: number): string {
  const adversaires: [string, string, boolean][] = [
    ["AS E2E UN 3", "association-sportive-e2e-un", true], ["FC E2E DEUX", "football-club-e2e-deux", false],
    ["US E2E TROIS 2", "union-sportive-e2e-trois", true], ["RC E2E QUATRE", "racing-club-e2e-quatre", false],
    ["ES E2E CINQ", "entente-sportive-e2e-cinq", true], ["AS E2E UN 3", "association-sportive-e2e-un", false],
  ];
  const lignes = ["BEGIN:VCALENDAR", "VERSION:2.0", "X-WR-CALNAME:OL SUD E2E - SEM 2 - Calendrier d'essai"];
  adversaires.forEach(([nom, slug, domicile], i) => {
    if (i + 1 === sansJournee) return;
    const d = new Date(Date.now() + (1 + 7 * i) * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
    const id = 88000001 + i;
    lignes.push(
      "BEGIN:VEVENT", `UID:${id}@fff.fr`, "DTSTAMP:20260906T150000Z", `DTSTART;TZID=Europe/Paris:${d}T150000`,
      `SUMMARY:J${i + 1} - ${domicile ? `OL SUD E2E 2 - ${nom}` : `${nom} - OL SUD E2E 2`}`,
      `DESCRIPTION:SENIORS D2\\n\\nVoir la fiche match: https://epreuves.fff.fr/competition/match/${id}-${domicile ? `ol-sud-e2e-${slug}` : `${slug}-ol-sud-e2e`}/match`,
      "LOCATION:STADE E2E", "END:VEVENT");
  });
  lignes.push("END:VCALENDAR");
  return lignes.join("\r\n");
}

test("calendrier FFF : un fichier .ics depose cree les matchs à venir, le rejouer ne change rien, un match absent est signale, un fichier invalide est refuse", async () => {
  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
  const duCalendrier = async (): Promise<{ idFff: string; calendrierDisparu: boolean }[]> =>
    ((await (await fetch(`${API_URL}/matchs`, { headers: { Authorization: `Bearer ${token}` } })).json()) as any[]).filter((m) => m.idFff);
  const fichier = (contenu: string) => ({ name: "1234_SEM_1.ics", mimeType: "text/calendar", buffer: Buffer.from(contenu) });
  const ouvrir = async () => {
    await page.goto("/calendrier");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("cal-fff-ouvrir").click();
    await expect(page.getByRole("heading", { name: "Calendrier FFF" })).toBeVisible();
  };

  await ouvrir();
  await expect(page.getByTestId("cal-fff-fichier")).toBeAttached();
  await page.getByTestId("cal-fff-fichier").setInputFiles(fichier(calendrierFff()));
  await expect(page.getByTestId("cal-fff-bilan")).toHaveText(/^6 matchs ajoutés \(6 matchs dans le calendrier\)/);
  await expect(page.getByTestId("cal-fff-rapport")).toContainText("Football Club E2e Deux");
  expect(await duCalendrier()).toHaveLength(6);

  // Rejouer le meme fichier : rien ne change, aucun doublon.
  await page.getByTestId("cal-fff-fichier").setInputFiles(fichier(calendrierFff()));
  await expect(page.getByTestId("cal-fff-bilan")).toHaveText("Calendrier à jour : 6 matchs, rien ne change.");
  expect(await duCalendrier()).toHaveLength(6);

  // Un match disparait du calendrier : signale, jamais supprime.
  await page.getByTestId("cal-fff-fichier").setInputFiles(fichier(calendrierFff(3)));
  await expect(page.getByTestId("cal-fff-bilan")).toContainText("1 match disparu du calendrier");
  await expect(page.getByTestId("cal-fff-rapport")).toContainText("à vérifier, rien n'est supprimé");
  const apres = await duCalendrier();
  expect(apres).toHaveLength(6);
  expect(apres.filter((m) => m.calendrierDisparu).map((m) => m.idFff)).toEqual(["88000003"]);

  // Un fichier qui n'est pas un calendrier de la FFF : refuse, avec la raison.
  await page.getByTestId("cal-fff-fichier").setInputFiles(fichier("ceci n'est pas un calendrier"));
  await expect(page.getByTestId("cal-fff-erreur")).toContainText("Aucun match lisible");

  // Une adresse qui n'est pas celle de la FFF est refusee par l'API.
  await page.getByTestId("cal-fff-adresse").fill("https://exemple.org/agenda.ics");
  await expect(page.getByText(/ne ressemble pas à un calendrier d'équipe de la FFF/)).toBeVisible();
  await page.getByTestId("cal-fff-enregistrer").click();
  await expect(page.getByTestId("cal-fff-erreur")).toContainText("Adresse invalide");
});

test("data hub de mon club : résultats, attaque, cartes des tirs filtrables avec la cage, joueurs", async () => {
  const fixtures = JSON.parse(readFileSync(FIXTURES, "utf8")) as { clubId: string; equipeId: string; saison2526: string };
  // Un match joue, saisi en direct sur la saison 2025-2026 de cette equipe (le match du parcours precedent est rouvert : pas encore « joue »).
  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
  const appeler = (chemin: string, init: RequestInit = {}) => fetch(`${API_URL}${chemin}`, {
    ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const adversaire = await (await appeler("/clubs", { method: "POST", body: JSON.stringify({ nom: "Club Data Hub" }) })).json();
  const match = await (await appeler("/matchs", { method: "POST", body: JSON.stringify({
    clubDom: fixtures.clubId, clubExt: adversaire.id, equipeDomId: fixtures.equipeId, saisonId: fixtures.saison2526,
    date: "2026-06-06", statut: "joue", scoreDom: 1, scoreExt: 0,
  }) })).json();
  expect(match.id).toBeTruthy();
  await appeler(`/direct/matchs/${match.id}/chrono`, { method: "POST", body: JSON.stringify({ action: "demarrer" }) });
  const saisir = (n: number, corps: object) => appeler(`/direct/matchs/${match.id}/evenements/hub-${match.id.slice(0, 8)}-${n}-zzzzzz`, { method: "PUT", body: JSON.stringify(corps) });
  await saisir(1, { cote: "dom", type: "tir", resultat: "but", periode: 1, minute: 12, zoneTier: 0, zoneCouloir: 2, zoneCadre: 1 });
  await saisir(2, { cote: "dom", type: "tir", resultat: "non_cadre", periode: 1, minute: 30, zoneTier: 1, zoneCouloir: 3 });
  await saisir(3, { cote: "ext", type: "tir", resultat: "cadre", periode: 2, minute: 60, zoneTier: 0, zoneCouloir: 1 });
  const base = `http://localhost:${WEB_PORT}`;
  const avant = (await contexte.cookies()).filter((c) => c.name === "ownSaisonId" || c.name === "ownEquipeId" || c.name === "ownSelValide");
  await contexte.addCookies([
    { name: "ownSaisonId", value: fixtures.saison2526, url: base },
    { name: "ownEquipeId", value: fixtures.equipeId, url: base },
  ]);
  await page.goto(`/club/${fixtures.clubId}`);
  await page.getByRole("tab", { name: "Data Hub" }).click();
  const hub = page.getByTestId("data-hub");
  await expect(hub).toBeVisible();
  await expect(page.getByTestId("hub-resultats")).toBeVisible();
  await expect(page.getByTestId("hub-attaque")).toContainText("xG estimé");
  await expect(page.getByTestId("hub-defense")).toContainText("Arrêts du gardien");

  // La carte des tirs : filtres cadrés / non cadrés / buts, et la cage.
  const carte = page.getByTestId("hub-carte-tirs");
  await expect(carte).toContainText("Dans la cage");
  const resume = carte.getByTestId("carte-tirs-resume");
  const tous = await resume.innerText();
  await carte.getByRole("radio", { name: "Buts" }).click();
  await expect(carte.getByRole("radio", { name: "Buts" })).toHaveAttribute("aria-checked", "true");
  expect(await resume.innerText()).not.toBe(tous);
  await carte.getByRole("radio", { name: "Tous" }).click();
  await expect(resume).toHaveText(tous);

  // Les sections d'analyse : graphiques et lectures, chacune avec sa propre alternative textuelle.
  for (const [onglet, testid, texte] of [
    ["Création", "hub-creation", "D'où vient le danger qu'on crée"], ["Concession", "hub-concession", "Comment on concède"],
    ["Adversaires", "hub-adversaires", "Dispositif de l'adversaire connu"], ["Score et rythme", "hub-rythme", "Danger par tranche de 15 minutes"],
    ["Profil", "hub-profil", "Profil de l'équipe"],
  ] as const) {
    await hub.getByRole("tab", { name: onglet }).click();
    await expect(page.getByTestId(testid)).toContainText(texte);
  }
  await hub.getByRole("tab", { name: "Création" }).click();
  await expect(page.getByTestId("hub-creation").getByRole("img", { name: /xG créé par zone/ })).toBeVisible();

  await contexte.addCookies(avant.map((c) => ({ name: c.name, value: c.value, url: base })));         // la selection d'avant, pour les tests suivants
});

test("direct : un match à venir se joue en saisie (coup d'envoi, but, tir adverse), la frise se corrige, le match se clôture et se rouvre", async () => {
  test.setTimeout(150_000);
  const axe = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  const auditer = async (portee: string | null, theme: string) => {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await page.waitForTimeout(600);
    return page.evaluate(async (p) => {
      const r = await (window as any).axe.run(p ? document.querySelector(p) : document, { resultTypes: ["violations"] });
      return r.violations.map((v: any) => `${v.impact} ${v.id} x${v.nodes.length} : ${v.nodes[0].target.join(" ")}`);
    }, portee);
  };
  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
  const appeler = (chemin: string, init: RequestInit = {}) => fetch(`${API_URL}${chemin}`, {
    ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const fixtures = JSON.parse(readFileSync(FIXTURES, "utf8")) as { clubId: string; equipeId: string; saison2526: string };
  const adversaire = await (await appeler("/clubs", { method: "POST", body: JSON.stringify({ nom: "Club Direct" }) })).json();
  const match = await (await appeler("/matchs", { method: "POST", body: JSON.stringify({
    clubDom: fixtures.clubId, clubExt: adversaire.id, equipeDomId: fixtures.equipeId, saisonId: fixtures.saison2526,
    date: "2026-05-30", statut: "prevu", scoreDom: 0, scoreExt: 0,
  }) })).json();
  expect(match.id).toBeTruthy();

  // Le parcours : un seul bouton « Direct » sur la fiche du match, qui renvoie vers l'avant-match tant que le onze n'est pas fait.
  await page.goto(`/matchs/${match.id}`);
  await expect(page.getByTestId("ouvrir-direct")).toBeVisible();
  await expect(page.getByTestId("ouvrir-avant")).toHaveCount(0);                     // plus de boutons Avant-match ni Après-match sur la fiche
  await expect(page.getByTestId("ouvrir-apres")).toHaveCount(0);
  await cliquerJusquaNavigation(page.getByTestId("ouvrir-direct"), /\/matchs\/[^/]+\/avant\?depuis=direct$/);
  await expect(page.getByRole("heading", { name: "Avant-match" })).toBeVisible();
  await expect(page.getByText(/Avant de lancer le direct, compose ton onze/)).toBeVisible();
  await expect(page.getByText("Brouillon")).toBeVisible();
  // Le plan courant de l'equipe prerempli le onze ; on remplace le gardien par un joueur du groupe.
  const gardien = page.getByRole("button", { name: /^GB : / });
  const avant = await gardien.getAttribute("aria-label");
  await gardien.click();
  await page.getByRole("dialog").locator("button[aria-pressed=false]").first().click();
  await expect(gardien).not.toHaveAttribute("aria-label", avant ?? "");

  // Les numeros du jour : chaque joueur retenu en a un, tous differents. Deux fois le meme est refuse, tant qu'il n'est pas corrige.
  const numeros = page.getByRole("region", { name: "Numéros portés ce jour-là" }).locator("input");
  const nb = await numeros.count();
  expect(nb).toBeGreaterThanOrEqual(10);
  for (let i = 0; i < nb; i++) await numeros.nth(i).fill(String(i + 1));
  await numeros.nth(1).fill("1");                                                    // doublon volontaire avec le premier
  await expect(page.getByRole("alert").filter({ hasText: "Le numéro 1 est donné à" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Valider et lancer le direct/ })).toBeDisabled();
  await numeros.nth(1).fill("2");
  await expect(page.getByRole("alert").filter({ hasText: "Le numéro" })).toHaveCount(0);
  await page.evaluate(axe);
  for (const theme of ["dark", "light"]) expect(await auditer(null, theme), `axe sur l'avant-match (${theme})`).toEqual([]);
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));

  // Valider enregistre le onze et ses numeros pour CE match, puis ouvre le direct.
  await page.getByRole("button", { name: "Valider et lancer le direct" }).click();
  await expect(page).toHaveURL(/\/matchs\/[^/]+\/direct$/, { timeout: 20_000 });
  const planAvant = await (await appeler(`/tactiques?equipeId=${fixtures.equipeId}&matchId=${match.id}`)).json();
  expect(planAvant.matchId).toBe(match.id);                                  // un plan propre au match, pas le plan courant
  expect(planAvant.titulaires.filter(Boolean).length).toBeGreaterThanOrEqual(10);
  expect(Object.values(planAvant.numeros as Record<string, number>).sort((x, y) => x - y)).toEqual(Array.from({ length: nb }, (_, i) => i + 1));
  // Le direct ne propose plus que les joueurs retenus, avec leur numero du jour.
  const etatAvant = await (await appeler(`/direct/matchs/${match.id}`)).json();
  expect(etatAvant.avantMatch.pret).toBe(true);
  expect(etatAvant.joueurs).toHaveLength(nb);
  expect(etatAvant.joueurs.map((j: any) => j.numero).sort((x: number, y: number) => x - y)).toEqual(Array.from({ length: nb }, (_, i) => i + 1));

  // Une fois l'avant-match fait, le bouton « Direct » de la fiche va droit au direct.
  await page.goto(`/matchs/${match.id}`);
  await cliquerJusquaNavigation(page.getByTestId("ouvrir-direct"), /\/matchs\/[^/]+\/direct$/);
  await expect(page.getByRole("region", { name: "Tableau de marque" })).toBeVisible();
  const tableau = page.getByRole("region", { name: "Tableau de marque" });
  await expect(tableau.getByLabel("Score : 0 à 0")).toBeVisible();
  await expect(tableau).toContainText("Avant le coup d'envoi");

  // Tant que le match n'a pas commence, l'avant-match reste modifiable (depuis le direct, comme depuis la fiche du match).
  await page.getByTestId("modifier-avant-match").click();
  await expect(page).toHaveURL(/\/matchs\/[^/]+\/avant$/);
  await expect(page.getByText("Le match a commencé : l'avant-match n'est plus modifiable.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Lancer le direct" })).toBeEnabled();
  await page.goto(`/matchs/${match.id}`);
  await expect(page.getByTestId("ouvrir-avant-match")).toBeVisible();
  await cliquerJusquaNavigation(page.getByTestId("ouvrir-direct"), /\/matchs\/[^/]+\/direct$/);
  await expect(page.getByRole("region", { name: "Tableau de marque" })).toBeVisible();

  // Coup d'envoi : le chrono tourne.
  await page.getByRole("button", { name: "Coup d'envoi" }).click();
  await expect(tableau).toContainText("1re période");
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

  // Un but de notre equipe : action, joueur, zone, resultat deja choisi.
  const groupe = page.getByRole("group", { name: "Actions du match" });
  await groupe.getByRole("button", { name: "But", exact: true }).click();
  const feuille = page.locator("div.fixed.inset-0");
  await expect(feuille.getByRole("heading", { name: "But · notre équipe" })).toBeVisible();
  await feuille.getByRole("button", { name: "Joueur inconnu" }).click();
  await feuille.getByRole("button", { name: "Suivant" }).click();
  await feuille.getByRole("button", { name: "Offensif · centre" }).click();
  await feuille.getByRole("button", { name: "Attaque placée" }).click();
  await feuille.getByRole("button", { name: "Cadre haut droit" }).click();
  await feuille.getByRole("button", { name: /^Enregistrer(?! ainsi)/ }).click();
  await expect(tableau.getByLabel("Score : 1 à 0")).toBeVisible();

  // Un tir adverse : pave numerique, resultat obligatoire.
  await page.getByRole("group", { name: "Équipe concernée" }).getByRole("button", { name: "Adversaire" }).click();
  await groupe.getByRole("button", { name: "Tir", exact: true }).click();
  await feuille.getByRole("button", { name: "9", exact: true }).click();
  await feuille.getByRole("button", { name: "Suivant" }).click();
  await expect(feuille.getByRole("button", { name: /^Enregistrer(?! ainsi)/ })).toBeDisabled();
  await feuille.getByRole("button", { name: "Non cadré" }).click();
  await feuille.getByRole("button", { name: /^Enregistrer(?! ainsi)/ }).click();
  await expect(page.getByText("2 événements · tout est envoyé")).toBeVisible();
  await expect(tableau.getByLabel("Score : 1 à 0")).toBeVisible();

  // Accessibilite de l'ecran, puis de la feuille de saisie seule (derriere elle, la page est assombrie : axe y lirait de faux contrastes).
  await page.evaluate(axe);
  for (const theme of ["dark", "light"]) expect(await auditer(null, theme), `axe sur le direct (${theme})`).toEqual([]);
  await groupe.getByRole("button", { name: "Corner", exact: true }).click();
  for (const theme of ["dark", "light"]) expect(await auditer("[role=dialog]", theme), `axe sur la feuille de saisie (${theme})`).toEqual([]);
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await feuille.getByRole("button", { name: "Enregistrer ainsi" }).click();   // un corner sans detail s'enregistre en un appui
  await expect(page.getByText("3 événements · tout est envoyé")).toBeVisible();

  // La frise (grand ecran : a droite) : corriger le but en tir cadre arrete, le score retombe ; annuler, retablir.
  const frise = page.getByRole("complementary", { name: "Frise du match" });
  await frise.getByRole("button", { name: /minute : But\. Modifier/ }).click();
  await expect(page.locator("div.fixed.inset-0").getByRole("heading", { name: /Modifier/ })).toBeVisible();
  await page.locator("div.fixed.inset-0").getByRole("button", { name: "Résultat, zone et contexte" }).click();
  await page.locator("div.fixed.inset-0").getByRole("button", { name: "Cadré, arrêté" }).click();
  await page.locator("div.fixed.inset-0").getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(tableau.getByLabel("Score : 0 à 0")).toBeVisible();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(page.getByText("2 événements · tout est envoyé")).toBeVisible();
  await page.getByRole("button", { name: "Rétablir" }).click();
  await expect(page.getByText("3 événements · tout est envoyé")).toBeVisible();

  // Le recalage du chrono et la fin du match, puis la cloture verrouille la saisie jusqu'a la reouverture.
  await page.getByRole("button", { name: "Mi-temps" }).click();
  await page.getByRole("button", { name: "2e période" }).click();
  await page.getByRole("button", { name: "Fin du match" }).click();
  await expect(tableau).toContainText("Match terminé");
  await page.getByRole("button", { name: "Clôturer le match" }).click();
  await expect(page.getByText("Direct clôturé : la saisie est verrouillée.")).toBeVisible();
  await expect(groupe.getByRole("button", { name: "Tir", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Rouvrir" }).click();
  await expect(groupe.getByRole("button", { name: "Tir", exact: true })).toBeEnabled();

  // Ce qui a ete saisi est bien enregistre cote serveur : trois evenements, mon equipe a domicile.
  const etat = await (await appeler(`/direct/matchs/${match.id}`)).json();
  expect(etat.evenements).toHaveLength(3);
  expect(etat.nousCote).toBe("dom");
  expect(etat.chrono.statut).toBe("termine");

  // L'apres-match, depuis la banniere de fin : le bilan s'enregistre tout seul, la page est accessible, puis on cloture le match.
  await cliquerJusquaNavigation(page.getByRole("link", { name: "Après-match" }), /\/matchs\/[^/]+\/apres$/);
  await expect(page.getByRole("heading", { name: "Après-match" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Notes joueurs" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Bilan" }).click();
  await page.getByLabel("Ce qui a marché").fill("Pressing haut");
  await expect.poll(async () => (await (await appeler(`/apres-match/matchs/${match.id}`)).json()).bilan.positifs, { timeout: 8_000 }).toBe("Pressing haut");
  await expect(page.getByText("Tout est enregistré")).toBeVisible();

  // L'adversaire : de petits selecteurs par sujet, enregistres tout seuls par section.
  await page.getByRole("tab", { name: "Adversaire" }).click();
  await expect(page.getByText("0 sur 14 sujets renseignés.")).toBeVisible();
  await page.getByRole("button", { name: "Pressing" }).click();
  await page.getByRole("group", { name: "Pressing : Déclenchement" }).getByRole("button", { name: "Touche", exact: true }).click();
  await page.getByRole("group", { name: "Pressing : Efficacité" }).getByRole("button", { name: "4 sur 5" }).click();
  await page.getByRole("button", { name: "Dispositif" }).click();
  await page.getByRole("group", { name: "Dispositif : Avec le ballon" }).getByRole("button", { name: "4-3-3", exact: true }).click();
  await page.getByRole("button", { name: "Meilleurs joueurs" }).click();
  await page.getByRole("button", { name: "Ajouter un joueur" }).click();
  await page.getByLabel("Numéro du joueur 1").fill("10");
  await page.getByLabel("Commentaire sur le joueur 1").fill("Gaucher");
  await expect.poll(async () => (await (await appeler(`/apres-match/matchs/${match.id}/adversaire`)).json()).valeurs, { timeout: 8_000 })
    .toEqual({ dispositif: { en_possession: "4-3-3" }, pressing: { declenchement: ["Touche"], efficacite: 4 }, meilleurs_joueurs: { joueurs: [{ numero: 10, commentaire: "Gaucher" }] } });
  await expect(page.getByText("3 sur 14 sujets renseignés.")).toBeVisible();
  // Rechargee, la saisie est la : elle ne depend pas de l'appareil.
  await page.reload();
  await page.getByRole("tab", { name: "Adversaire" }).click();
  await expect(page.getByText("3 sur 14 sujets renseignés.")).toBeVisible();
  await page.getByRole("button", { name: "Pressing" }).click();
  await expect(page.getByRole("group", { name: "Pressing : Déclenchement" }).getByRole("button", { name: "Touche", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(axe);        // le rechargement a vide la page : axe est a reinjecter
  for (const theme of ["dark", "light"]) expect(await auditer(null, theme), `axe sur l'adversaire (${theme})`).toEqual([]);
  for (const theme of ["dark", "light"]) expect(await auditer(null, theme), `axe sur l'après-match (${theme})`).toEqual([]);
  // Le résumé de fin de match : les chiffres du direct, comparés, accessibles.
  await page.getByRole("tab", { name: "Résumé" }).click();
  await expect(page.getByRole("heading", { name: "Le match en chiffres" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Corners : \d pour nous, \d pour eux/ })).toBeVisible();
  for (const theme of ["dark", "light"]) expect(await auditer(null, theme), `axe sur le résumé (${theme})`).toEqual([]);
  // Clôturer enregistre tout puis ramène à la fiche du match, où le dispositif observé de l'adversaire est renseigné.
  await page.getByRole("button", { name: "Clôturer le match" }).click();
  await expect(page).toHaveURL(new RegExp(`/matchs/${match.id}$`), { timeout: 15_000 });
  expect((await (await appeler(`/matchs/${match.id}`)).json()).formationExt).toBe("4-3-3");
  await expect(page.getByText("4-3-3").first()).toBeVisible();
  // Une fois clôturé, « Match clôturé » enregistre et ramène aussi à la fiche du match.
  await page.goto(`/matchs/${match.id}/apres`);
  await page.getByRole("button", { name: "Match clôturé" }).click();
  await expect(page).toHaveURL(new RegExp(`/matchs/${match.id}$`), { timeout: 15_000 });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
});

test("direct : un autre appareil saisit et on le voit, et ce qui n'a pas pu partir survit au rechargement", async () => {
  test.setTimeout(120_000);
  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
  const appeler = (chemin: string, init: RequestInit = {}) => fetch(`${API_URL}${chemin}`, {
    ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const fixtures = JSON.parse(readFileSync(FIXTURES, "utf8")) as { clubId: string; equipeId: string; saison2526: string };
  const adversaire = await (await appeler("/clubs", { method: "POST", body: JSON.stringify({ nom: "Club Synchro" }) })).json();
  const match = await (await appeler("/matchs", { method: "POST", body: JSON.stringify({
    clubDom: fixtures.clubId, clubExt: adversaire.id, equipeDomId: fixtures.equipeId, saisonId: fixtures.saison2526,
    date: "2026-05-31", statut: "prevu", scoreDom: 0, scoreExt: 0,
  }) })).json();
  await appeler(`/direct/matchs/${match.id}/chrono`, { method: "POST", body: JSON.stringify({ action: "demarrer" }) });

  await page.goto(`/matchs/${match.id}/direct`);
  await expect(page.getByText("0 événement · tout est envoyé")).toBeVisible();

  // Un autre appareil saisit : l'ecran le reprend tout seul (lecture toutes les 5 s).
  await appeler(`/direct/matchs/${match.id}/evenements/autre-appareil-0001`, { method: "PUT", body: JSON.stringify({ cote: "dom", type: "corner", periode: 1, minute: 7 }) });
  await expect(page.getByText("1 événement · tout est envoyé")).toBeVisible({ timeout: 15_000 });

  // Le reseau d'envoi tombe : l'evenement saisi reste en attente, et la file survit au rechargement de la page.
  await page.route("**/direct/matchs/*/evenements/**", (route) => route.abort("failed"));
  await page.getByRole("group", { name: "Actions du match" }).getByRole("button", { name: "Corner", exact: true }).click();
  await page.locator("div.fixed.inset-0").getByRole("button", { name: "Enregistrer ainsi" }).click();
  await expect(page.getByText(/1 événement en attente/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/1 événement en attente/)).toBeVisible({ timeout: 15_000 });
  expect((await (await appeler(`/direct/matchs/${match.id}`)).json()).evenements).toHaveLength(1);   // rien n'est parti

  // Le reseau revient : la file repart d'elle-meme, sans doublon.
  await page.unroute("**/direct/matchs/*/evenements/**");
  await expect(page.getByText("2 événements · tout est envoyé")).toBeVisible({ timeout: 20_000 });
  expect((await (await appeler(`/direct/matchs/${match.id}`)).json()).evenements).toHaveLength(2);
});

test("invitation : un saisisseur sans compte saisit le direct d'un seul match, le lien ne sert qu'une fois, l'accès se coupe", async () => {
  test.setTimeout(150_000);
  const axe = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
  const appeler = (chemin: string, init: RequestInit = {}) => fetch(`${API_URL}${chemin}`, {
    ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const fixtures = JSON.parse(readFileSync(FIXTURES, "utf8")) as { clubId: string; equipeId: string; saison2526: string };
  const adversaire = await (await appeler("/clubs", { method: "POST", body: JSON.stringify({ nom: "Club Invitation" }) })).json();
  const match = await (await appeler("/matchs", { method: "POST", body: JSON.stringify({
    clubDom: fixtures.clubId, clubExt: adversaire.id, equipeDomId: fixtures.equipeId, saisonId: fixtures.saison2526,
    date: "2026-06-01", statut: "prevu", scoreDom: 0, scoreExt: 0,
  }) })).json();
  await appeler(`/direct/matchs/${match.id}/chrono`, { method: "POST", body: JSON.stringify({ action: "demarrer" }) });

  // Le staff cree l'invitation depuis le direct : le lien n'apparait qu'une fois.
  await page.goto(`/matchs/${match.id}/direct`);
  await page.getByRole("button", { name: "Inviter un saisisseur" }).click();
  await page.getByLabel("Nom de la personne").fill("Julie");
  await page.getByRole("button", { name: "Créer le lien" }).click();
  const lien = await page.getByLabel("Lien d'invitation").inputValue();
  expect(lien).toMatch(/\/saisie\/[A-Za-z0-9_-]{43}$/);
  await expect(page.getByText("Lien pas encore ouvert")).toBeVisible();
  for (const theme of ["dark", "light"]) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await page.waitForTimeout(400);
    await page.evaluate(axe);
    const v = await page.evaluate(async () => (await (window as any).axe.run(document.querySelector("[role=dialog]"), { resultTypes: ["violations"] })).violations.map((x: any) => `${x.impact} ${x.id}`));
    expect(v, `axe sur la fenetre d'invitation (${theme})`).toEqual([]);
  }
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));

  // L'invite : un appareil vierge, sans compte. Il ouvre le lien et saisit un corner.
  const invite = await (await contexte.browser()!.newContext()).newPage();
  await invite.goto(lien);
  await expect(invite.getByText("Saisie invitée :")).toBeVisible({ timeout: 20_000 });
  await expect(invite).toHaveURL(/\/saisie$/);                                   // le jeton a quitte la barre d'adresse
  await expect(invite.getByRole("link", { name: /Retour au match/ })).toHaveCount(0);
  await expect(invite.getByRole("button", { name: "Pause" })).toHaveCount(0);   // pas le droit de piloter le chrono
  await invite.getByRole("group", { name: "Actions du match" }).getByRole("button", { name: "Corner", exact: true }).click();
  await invite.locator("div.fixed.inset-0").getByRole("button", { name: "Enregistrer ainsi" }).click();
  await expect(invite.getByText("1 événement · tout est envoyé")).toBeVisible();
  await expect.poll(async () => (await (await appeler(`/direct/matchs/${match.id}`)).json()).evenements.length, { timeout: 10_000 }).toBe(1);
  await expect(page.getByText("1 événement · tout est envoyé")).toBeVisible({ timeout: 15_000 });   // le staff le voit aussi

  // Rouvrir le meme lien sur un autre appareil : refuse, c'etait un lien a usage unique.
  const autre = await (await contexte.browser()!.newContext()).newPage();
  await autre.goto(lien);
  await expect(autre.getByRole("heading", { name: "Lien déjà utilisé" })).toBeVisible({ timeout: 20_000 });

  // Rien d'autre de l'application n'est atteignable : pages renvoyees vers la connexion, relais refuse.
  await invite.goto("/matchs");
  await expect(invite).toHaveURL(/\/login/);
  const refus = await invite.evaluate(async () => (await fetch("/api/backend/matchs")).status);
  expect(refus).toBe(401);

  // Le staff coupe l'acces : l'invite le sait et ne peut plus rien saisir.
  await page.getByRole("button", { name: "Couper l'accès de Julie" }).click();
  await expect(page.getByText("Accès coupé")).toBeVisible();
  await invite.goto("/saisie");
  await expect(invite.getByRole("heading", { name: /Accès terminé|Pas d'invitation/ })).toBeVisible({ timeout: 25_000 });
  expect((await (await appeler(`/direct/matchs/${match.id}`)).json()).evenements).toHaveLength(1);
});

function pdfplumberDisponible(): boolean {
  try {
    execFileSync(process.env.PYTHON_BIN ?? "python3", ["-c", "import pdfplumber"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
