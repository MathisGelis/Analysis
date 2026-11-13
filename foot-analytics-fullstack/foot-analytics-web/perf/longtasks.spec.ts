// Tâches longues (> 50 ms, celles qui bloquent le fil principal et dégradent l'INP) et LCP, page par page.
// Données : 157 joueurs dans l'effectif de l'équipe et 34 matchs sur la saison en cours.
// Chaque page est chargée REPS fois (cache chaud après la première) ; on rapporte la médiane et le pire cas.
import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { API_URL } from "../playwright.config";
import { FIXTURES, MOT_DE_PASSE } from "../e2e/global-setup";

const REPS = 5;
const PAGES = ["/", "/effectif", "/matchs", "/calendrier", "/classement", "/medical", "/recherche", "/rapports", "/entrainements", "/tactique"];

test.setTimeout(600_000);

test("tâches longues et LCP, par page", async ({ browser }) => {
  const fx = JSON.parse(readFileSync(FIXTURES, "utf8")) as { clubId: string; equipeId: string; saison2526: string };
  const { token } = await (await fetch(`${API_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: "AADMIN", password: MOT_DE_PASSE }),
  })).json();
  const poster = async (chemin: string, corps: unknown) => {
    const r = await fetch(`${API_URL}${chemin}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(corps) });
    if (!r.ok) throw new Error(`${chemin} -> ${r.status} ${await r.text()}`);
    return r.json();
  };
  // 157 joueurs rattachés à l'équipe (la mesure précédente les créait sans équipe : /effectif restait vide).
  const postes = ["GB", "DC", "DD", "DG", "MD", "MC", "MO", "AG", "AD", "AT"];
  const t0 = Date.now();
  for (let i = 0; i < 157; i++) {
    await poster(`/joueurs/equipe/${fx.equipeId}/create`, { prenom: `Perf${i + 1}`, nom: `JOUEUR${String(i + 1).padStart(3, "0")}`, poste: postes[i % postes.length], statutMutation: "Pas mutation", numero: (i % 99) + 1 });
  }
  console.log(`157 joueurs créés en ${Date.now() - t0} ms`);
  // 34 matchs sur la saison en cours (une rencontre par semaine), contre 12 adversaires.
  const adversaires: string[] = [];
  for (let i = 0; i < 12; i++) adversaires.push((await poster("/clubs", { nom: `Adversaire Perf ${i + 1}`, abbr: `AP${i + 1}`, numeroFff: `9971${String(i).padStart(2, "0")}` })).id);
  for (let i = 0; i < 34; i++) {
    const d = new Date(Date.UTC(2025, 8, 7 + 7 * i)).toISOString().slice(0, 10);
    await poster("/matchs", {
      clubDom: i % 2 ? fx.clubId : adversaires[i % 12], clubExt: i % 2 ? adversaires[i % 12] : fx.clubId,
      equipeDomId: i % 2 ? fx.equipeId : undefined, equipeExtId: i % 2 ? undefined : fx.equipeId, saisonId: fx.saison2526,
      date: d, scoreDom: (i * 3) % 4, scoreExt: (i * 5) % 3, statut: "joue",
    });
  }

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const w = window as unknown as { __lt: { d: number; t: number }[]; __lcp: number };
    w.__lt = []; w.__lcp = 0;
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__lt.push({ d: e.duration, t: e.startTime }); }).observe({ type: "longtask", buffered: true }); } catch { /* indisponible */ }
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true }); } catch { /* indisponible */ }
  });
  await page.goto("/login");
  await page.getByPlaceholder("MLEMAIRE").fill("AADMIN");
  await page.locator("input[type=password]").fill(MOT_DE_PASSE);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/");

  const mesurer = async (chemin: string) => {
    await page.goto(chemin, { waitUntil: "load" });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);   // laisse passer l'hydratation et les effets tardifs
    return page.evaluate(() => {
      const w = window as unknown as { __lt: { d: number; t: number }[]; __lcp: number };
      const lt = w.__lt;
      return { total: Math.round(lt.reduce((s, x) => s + x.d, 0)), n: lt.length, max: Math.round(Math.max(0, ...lt.map((x) => x.d))), lcp: Math.round(w.__lcp), dom: document.getElementsByTagName("*").length };
    });
  };
  const mediane = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const rapport: Record<string, unknown>[] = [];
  const cdp = await ctx.newCDPSession(page);
  // Deux profils : le poste de test, puis un mobile milieu de gamme simulé (processeur ralenti 4x).
  for (const ralentissement of [1, 4]) {
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: ralentissement });
  console.log(`--- processeur ralenti x${ralentissement} ---`);
  for (const chemin of PAGES) {
    await mesurer(chemin);   // 1re visite : compile / chauffe les caches serveur, non comptée
    const mesures = [];
    for (let i = 0; i < REPS; i++) mesures.push(await mesurer(chemin));
    const ligne = {
      cpu: `x${ralentissement}`, page: chemin, dom: mesures[0].dom,
      tachesLonguesMs_mediane: mediane(mesures.map((m) => m.total)), tachesLonguesMs_pire: Math.max(...mesures.map((m) => m.total)),
      nbTaches_mediane: mediane(mesures.map((m) => m.n)), plusLongueMs_pire: Math.max(...mesures.map((m) => m.max)),
      lcpMs_mediane: mediane(mesures.map((m) => m.lcp)),
    };
    rapport.push(ligne);
    console.log(JSON.stringify(ligne));
  }
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  // Interactions réelles sur /effectif (157 lignes) : tri par clic sur un en-tête, puis filtre au clavier.
  await page.goto("/effectif");
  await page.waitForLoadState("networkidle");
  const interaction = await page.evaluate(async () => {
    const w = window as unknown as { __lt: { d: number; t: number }[] };
    const avant = w.__lt.length;
    const bouton = Array.from(document.querySelectorAll("th button")).find((b) => /Matchs jou/i.test(b.getAttribute("title") ?? "") || /Mat\./.test(b.textContent ?? "")) as HTMLElement | undefined;
    const t = performance.now();
    bouton?.click();
    await new Promise((r) => setTimeout(r, 800));
    return { cliqueTri: !!bouton, tachesApresClic: w.__lt.slice(avant).map((x) => Math.round(x.d)), duree: Math.round(performance.now() - t) };
  });
  console.log("tri /effectif :", JSON.stringify(interaction));
  mkdirSync(path.join(__dirname, ".tmp"), { recursive: true });
  writeFileSync(path.join(__dirname, ".tmp", "longtasks.json"), JSON.stringify({ rapport, interaction }, null, 2));
  await ctx.close();
});
