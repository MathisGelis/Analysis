// Service worker de l'application installable (public/sw.js), execute dans un faux environnement de worker : il ne met en
// cache que la page hors ligne et son icone, la sert quand une navigation echoue faute de reseau, et ne touche a rien
// d'autre (API, pages, donnees).

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type Ecouteur = (e: any) => void;

function chargerSw(reseau: (req: any) => Promise<Response>) {
  const ecouteurs: Record<string, Ecouteur> = {};
  const caches = new Map<string, Map<string, Response>>();
  const cacheStorage = {
    open: async (nom: string) => {
      if (!caches.has(nom)) caches.set(nom, new Map());
      const c = caches.get(nom)!;
      return { addAll: async (urls: string[]) => { for (const u of urls) c.set(u, new Response(`contenu ${u}`)); } };
    },
    keys: async () => [...caches.keys()],
    delete: async (nom: string) => caches.delete(nom),
    match: async (url: string) => [...caches.values()].map((c) => c.get(url)).find(Boolean),
  };
  const self = {
    location: { origin: "https://app.test" },
    addEventListener: (type: string, f: Ecouteur) => { ecouteurs[type] = f; },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const code = readFileSync(path.resolve(__dirname, "../../public/sw.js"), "utf8");
  new Function("self", "caches", "fetch", code)(self, cacheStorage, reseau);

  const attendre = async (type: string, e: any = {}) => {
    let promesse: Promise<unknown> = Promise.resolve();
    ecouteurs[type]({ ...e, waitUntil: (p: Promise<unknown>) => { promesse = p; } });
    await promesse;
  };
  const requete = async (req: any) => {
    let reponse: Promise<Response> | undefined;
    ecouteurs.fetch({ request: req, respondWith: (r: Promise<Response>) => { reponse = r; } });
    return reponse ? await reponse : undefined;
  };
  return { caches, attendre, requete };
}

const nav = (url: string) => ({ method: "GET", mode: "navigate", url });
const horsLigne = () => Promise.reject(new TypeError("Failed to fetch"));

describe("service worker (public/sw.js)", () => {
  it("installation : seulement la page hors ligne et son icone ; activation : les anciens caches sont effaces", async () => {
    const sw = chargerSw(horsLigne);
    sw.caches.set("ancien-cache", new Map([["/matchs", new Response("vieux")]]));
    await sw.attendre("install");
    await sw.attendre("activate");
    expect([...sw.caches.keys()]).toEqual(["fa-hors-ligne-v1"]);
    expect([...sw.caches.get("fa-hors-ligne-v1")!.keys()]).toEqual(["/offline.html", "/icons/icon.svg"]);
  });

  it("sans reseau, une navigation affiche la page hors ligne", async () => {
    const sw = chargerSw(horsLigne);
    await sw.attendre("install");
    const r = await sw.requete(nav("https://app.test/matchs"));
    expect(await r!.text()).toBe("contenu /offline.html");
  });

  it("avec le reseau, la navigation passe par le reseau ; l'API et les autres ressources ne sont jamais interceptees", async () => {
    const sw = chargerSw(async () => new Response("page en ligne"));
    await sw.attendre("install");
    expect(await (await sw.requete(nav("https://app.test/matchs")))!.text()).toBe("page en ligne");
    expect(await sw.requete({ method: "GET", mode: "cors", url: "https://app.test/api/backend/joueurs" })).toBeUndefined();
    expect(await sw.requete({ method: "POST", mode: "navigate", url: "https://app.test/api/session/login" })).toBeUndefined();
    expect(await sw.requete({ method: "GET", mode: "no-cors", url: "https://app.test/_next/static/x.js" })).toBeUndefined();
  });
});
