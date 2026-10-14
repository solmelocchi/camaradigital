/**
 * Service worker: guarda la app para que abra rápido y aunque haya poca
 * señal en el salón. Siempre intenta la red primero (así cada cambio se
 * ve enseguida) y usa la copia guardada solo si no hay conexión.
 * Nunca guarda las respuestas del servidor de fotos.
 */
// Avisos: con la app cerrada, Firebase muestra la notificación desde acá
importScripts("js/firebase-config.js");
if (self.FIREBASE_CONFIG) {
  importScripts(
    "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js"
  );
  firebase.initializeApp(self.FIREBASE_CONFIG);
  firebase.messaging();
}

const CACHE = "camara-v6";
const BASE = [
  "./", "index.html", "manifest.webmanifest",
  "css/base.css", "css/app.css",
  "js/boda.js", "js/api.js", "js/api-demo.js", "js/imagenes.js", "js/sonidos.js",
  "js/descartable.js", "js/visor.js", "js/app.js", "js/avisos.js", "js/firebase-config.js",
  "assets/icono-192.png", "assets/icono-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.endsWith("/exec")) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
