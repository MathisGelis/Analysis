// public/sw.js
//
// Service worker de l'application installee : il ne garde en cache QUE la page hors ligne et l'icone. Aucune page de
// l'application, aucune reponse de l'API, aucune donnee de joueur n'est conservee sur l'appareil (RGPD : un telephone
// perdu ne contient rien). Sans reseau, une navigation affiche /offline.html ; tout le reste passe par le reseau.

const CACHE = "fa-hors-ligne-v1";
const FICHIERS = ["/offline.html", "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }
  // L'icone de la page hors ligne : depuis le cache seulement si le reseau manque.
  const url = new URL(req.url);
  if (url.origin === self.location.origin && FICHIERS.includes(url.pathname)) {
    event.respondWith(fetch(req).catch(() => caches.match(url.pathname)));
  }
});
