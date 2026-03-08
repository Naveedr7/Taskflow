/* ============================================================
   TaskFlow — Service Worker
   Strategy: Cache-First with background update
   ============================================================ */

const CACHE_NAME = "taskflow-v1";

// All assets to pre-cache on install
const ASSETS_TO_CACHE = [
    "./index.html",
    "./style.css",
    "./script.js",
    "./manifest.json",
    "./assets/icon-192.png",
    "./assets/icon-512.png",
    // Google Fonts (cached on first fetch)
];

/* ----------------------------------------------------------
   INSTALL — pre-cache all core assets
   ---------------------------------------------------------- */
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log("[SW] Pre-caching app assets");
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    // Activate immediately without waiting for old SW to die
    self.skipWaiting();
});

/* ----------------------------------------------------------
   ACTIVATE — clean up old caches
   ---------------------------------------------------------- */
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => {
                        console.log("[SW] Removing old cache:", key);
                        return caches.delete(key);
                    })
            )
        )
    );
    // Take control of all open tabs immediately
    self.clients.claim();
});

/* ----------------------------------------------------------
   FETCH — Cache-First strategy
   ---------------------------------------------------------- */
self.addEventListener("fetch", (event) => {
    // Only handle GET requests within our scope
    if (event.request.method !== "GET") return;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // Serve from cache if available
            if (cachedResponse) {
                return cachedResponse;
            }

            // Otherwise fetch from network and cache the response
            return fetch(event.request)
                .then((networkResponse) => {
                    // Only cache valid same-origin or CDN responses
                    if (
                        networkResponse &&
                        networkResponse.status === 200 &&
                        (networkResponse.type === "basic" || networkResponse.type === "cors")
                    ) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    // If offline and not cached, return offline fallback for HTML
                    if (event.request.headers.get("accept").includes("text/html")) {
                        return caches.match("./index.html");
                    }
                });
        })
    );
});
