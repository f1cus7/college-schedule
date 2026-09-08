const CACHE_NAME = "college-schedule-v2";

const APP_SHELL = [
    "/",
    "/index.html",
    "/css/style.css",
    "/js/schedule.js",
    "/favicon.svg",
    "/manifest.json",
    "/icons/icon-192.png",
    "/icons/icon-512.png"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const url = new URL(event.request.url);

    if (event.request.method !== "GET") {
        return;
    }

    // API расписания
    if (url.pathname === "/api/schedule") {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const copy = response.clone();

                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(
                                "/api/schedule",
                                copy
                            );
                        });

                    return response;
                })
                .catch(() => {
                    return caches.match("/api/schedule");
                })
        );

        return;
    }

    // Страницы и статические файлы
    event.respondWith(
        fetch(event.request)
            .then(response => {
                const copy = response.clone();

                caches.open(CACHE_NAME)
                    .then(cache => {
                        cache.put(
                            event.request,
                            copy
                        );
                    });

                return response;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});