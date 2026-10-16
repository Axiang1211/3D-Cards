/*
 * sw.js
 * Lets the installed app (PWA) open without a connection.
 *
 *  - Pages and the site's own files: from the network when online (so a new
 *    version shows up straight away), from the cache when offline.
 *  - Fonts and the cut-out tool from CDNs: from the cache once downloaded.
 *  - Shares, Google sign-in and other /api calls: never cached.
 */
const VERSION = "v5";
const SHELL = "3dcards-shell-" + VERSION;
const RUNTIME = "3dcards-runtime-" + VERSION;
const CDN = "3dcards-cdn-" + VERSION;

const PRECACHE = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/holo-card.css",
  "css/style.css",
  "css/app.css",
  "js/config.js",
  "js/i18n.js",
  "js/desktop.js",
  "js/pwa.js",
  "gallery/gallery.js",
  "js/motion.js",
  "js/sand-core.js",
  "js/sand-worker.js",
  "js/holo-card.js",
  "js/store.js",
  "js/io.js",
  "js/cutout.js",
  "js/share.js",
  "js/cloud.js",
  "js/fullscreen.js",
  "js/view-gallery.js",
  "js/view-detail.js",
  "js/view-create.js",
  "js/view-shared.js",
  "js/view-download.js",
  "js/watermark.js",
  "js/account.js",
  "js/public.js",
  "js/app-shell.js",
  "js/app.js",
  "brand/logo-mark-64.png",
  "brand/logo-mark-128.png",
  "brand/logo-mark-192.png",
  "brand/logo-mark-manga-192.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(SHELL)
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, RUNTIME, CDN].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const CDN_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com", "cdn.jsdelivr.net"];

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/api/")) return; // live data only
    if (req.mode === "navigate") {
      // Any page (including /s/<id> share links) opens the app; offline it opens from the cache.
      e.respondWith(networkFirst(req, RUNTIME, () => caches.match("index.html", { ignoreSearch: true })));
      return;
    }
    e.respondWith(networkFirst(req, RUNTIME));
    return;
  }
  if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith(cacheFirst(req, CDN));
  }
});

async function networkFirst(req, cacheName, fallback) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetchWithTimeout(req, 6000);
    if (res && res.ok && res.type !== "opaque") cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const hit = (await cache.match(req)) || (await caches.match(req, { ignoreSearch: true }));
    if (hit) return hit;
    if (fallback) {
      const f = await fallback();
      if (f) return f;
    }
    throw err;
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()).catch(() => {});
  return res;
}

function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(req).then(
      (r) => {
        clearTimeout(t);
        resolve(r);
      },
      (err) => {
        clearTimeout(t);
        reject(err);
      }
    );
  });
}
