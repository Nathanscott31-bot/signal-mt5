'use strict';

// Met en cache uniquement les fichiers de l'interface, pour un démarrage rapide même sans réseau.
const CACHE = 'signal-mt5-assistant-v1';
const SHELL = ['./', 'index.html', 'style.css', 'parser.js', 'app.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  // Réseau d'abord (l'application reste à jour), cache en secours.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        // Pas de mise en cache des adresses avec paramètres : un signal partagé est une donnée personnelle.
        if (res.ok && !url.search) caches.open(CACHE).then((c) => c.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true })));
});
