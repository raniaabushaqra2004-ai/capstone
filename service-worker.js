const CACHE_NAME = "medika-pwa-v6";
const APP_SHELL = [
    "./",
    "./index.html",
    "./chat.html",
    "./report.html",
    "./decision.html",
    "./integrative.html",
    "./dashboard.html",
    "./manifest.webmanifest",
    "./style.css",
    "./script.js",
    "./app-config.js",
    "./images/app-icon-192.png",
    "./images/app-icon-512.png",
    "./images/apple-touch-icon.png",
    "./images/hero-clinician.svg",
    "./images/hero-dashboard.svg",
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) =>
            cache.addAll(APP_SHELL.map((asset) => new Request(asset, { cache: "reload" })))
        )
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    const url = new URL(request.url);

    if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
        return;
    }

    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    return response;
                })
                .catch(() => caches.match(request).then((cached) => cached || caches.match("./chat.html")))
        );
        return;
    }

    event.respondWith(
        caches.match(request).then((cached) => {
            const networkFetch = fetch(request)
                .then((response) => {
                    if (response && response.status === 200) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => cached);

            return cached || networkFetch;
        })
    );
});

self.addEventListener("message", (event) => {
    if (event.data === "skip-waiting") {
        self.skipWaiting();
    }
});
