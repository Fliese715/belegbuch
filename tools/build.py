#!/usr/bin/env python3
"""Baut die auslieferbare Web-App aus src/belegbuch.html.

Aufruf (im Hauptordner):  python3 tools/build.py

Erzeugt:
  index.html  Quelltext + HTML-Gerüst + Anmeldung des Service Workers
  sw.js       Service Worker; der Cache-Name enthält eine Prüfsumme von index.html,
              damit installierte Apps nach jeder Änderung die neue Fassung laden.

src/belegbuch.html ist bewusst ein Fragment ohne <html>/<head>/<body>: genau so wird es
auch als Claude-Artifact veröffentlicht, das sein eigenes Gerüst mitbringt.
"""
import hashlib
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = (ROOT / "src" / "belegbuch.html").read_text(encoding="utf-8")

RESET = ("<style>:root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 "
         "env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}"
         "img{max-width:100%}[hidden]{display:none!important}</style>")
HEAD = ('<!doctype html><html lang="de"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#1747a6">'
        '<link rel="icon" href="icon-192.png"><link rel="apple-touch-icon" href="icon-192.png">'
        + RESET + "</head><body>")
TAIL = """<script>
if ('serviceWorker' in navigator) { window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { }); }); }
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }
</script></body></html>"""

index = HEAD + src + TAIL
(ROOT / "index.html").write_text(index, encoding="utf-8")
version = "belegbuch-" + hashlib.sha1(index.encode("utf-8")).hexdigest()[:10]

SW = r"""/* Belegbuch – Service Worker: hält die App-Dateien für den Betrieb ohne Internet vor.
   Erzeugt von tools/build.py – nicht von Hand ändern. */
var VERSION = '__VERSION__';
var SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];
var EXTRA = ['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return c.addAll(SHELL).then(function () {
      return Promise.all(EXTRA.map(function (u) { return fetch(u, { mode: 'no-cors' }).then(function (r) { return c.put(u, r); }).catch(function () { }); }));
    });
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request; if (req.method !== 'GET') return;
  var url = new URL(req.url), own = url.origin === location.origin;
  if (own) {
    /* Eigene Dateien: zuerst Netz (Updates kommen an), ohne Netz aus dem Cache. */
    e.respondWith(fetch(req).then(function (r) {
      if (r && r.ok) { var cp = r.clone(); caches.open(VERSION).then(function (c) { c.put(req, cp); }); }
      return r;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (m) { return m || caches.match('./index.html'); });
    }));
  } else if (/cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/.test(url.host)) {
    /* PDF-Bibliothek und Schrift: aus dem Cache, sonst laden und merken. */
    e.respondWith(caches.match(req).then(function (m) {
      return m || fetch(req).then(function (r) { var cp = r.clone(); caches.open(VERSION).then(function (c) { c.put(req, cp); }); return r; });
    }));
  }
});
"""
(ROOT / "sw.js").write_text(SW.replace("__VERSION__", version), encoding="utf-8")
print("index.html und sw.js gebaut, Cache-Name:", version)
