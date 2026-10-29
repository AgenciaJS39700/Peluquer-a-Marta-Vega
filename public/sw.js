/* /public/sw.js — Modo app (PWA) del Salón Marta Vega.
   Páginas, código y catálogo: primero la red y, sin conexión, la copia guardada. Imágenes y fuentes: primero la copia.
   La API (/api/) nunca pasa por la caché. Sube VERSION al publicar cambios grandes. */
var VERSION = "mv-v4";
var CORE = ["./", "index.html", "styles.css", "app.js", "ojo.js", "hilos.js", "probador.js", "qr.js", "catalogo.json", "manifest.webmanifest", "icon-192.png", "fonts/fraunces.woff", "fonts/manrope.woff", "img/salon-m.webp"];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(CORE); }).catch(function () {}).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin || u.pathname.indexOf("/api/") === 0) return;
  if (r.mode === "navigate" || /\.(html|js|css|json|webmanifest)$/.test(u.pathname)) {
    e.respondWith(fetch(r).then(function (res) {
      if (res.ok) { var cp = res.clone(); caches.open(VERSION).then(function (c) { c.put(r, cp); }); }
      return res;
    }).catch(function () { return caches.match(r, { ignoreSearch: r.mode === "navigate" }).then(function (m) { return m || caches.match("./"); }); }));
    return;
  }
  if (/\.(webp|png|jpe?g|svg|woff2?)$/.test(u.pathname)) {
    e.respondWith(caches.match(r).then(function (m) {
      return m || fetch(r).then(function (res) { if (res.ok) { var cp = res.clone(); caches.open(VERSION).then(function (c) { c.put(r, cp); }); } return res; });
    }));
  }
});
