// PR.TECH · service worker : l'appli s'ouvre sans réseau, et reçoit le rappel de 20 h.
const VERSION = "prtech-v3";
const COQUILLE = [
  "./", "index.html", "prtech-style.css", "prtech-app.js", "prtech-manifest.webmanifest",
  "prtech-logo.png", "prtech-icon-192.png", "prtech-icon-512.png", "prtech-apple-180.png", "prtech-favicon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(COQUILLE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith("prtech-") && k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Les fichiers de l'appli : réseau d'abord (pour avoir la dernière version), cache si pas de réseau.
// Les données (Supabase) ne passent jamais par le cache.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then((rep) => {
      const copie = rep.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copie));
      return rep;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { texte: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.titre || "PR.TECH", {
    body: d.texte || "",
    icon: "prtech-icon-192.png",
    badge: "prtech-icon-192.png",
    tag: "prtech-rappel",
    renotify: true,
    data: { vers: d.vers || "./" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const vers = new URL((e.notification.data && e.notification.data.vers) || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((liste) => {
    for (const c of liste) if (c.url.startsWith(self.registration.scope)) return c.focus();
    return self.clients.openWindow(vers);
  }));
});
