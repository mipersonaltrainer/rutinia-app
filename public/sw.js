// Rutinia service worker — deliberately minimal.
// It makes the app installable and shows an offline page when the network is down.
// It NEVER caches pages, API responses, photos or anything personal: health data must not sit in a device cache
// that outlives the session. Only the static offline shell and icons are stored.
const CACHE = "tos-shell-v1";
const SHELL = ["/offline", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;            // everything else goes straight to the network, untouched
  e.respondWith(fetch(req).catch(async () => (await caches.match("/offline")) || Response.error()));
});

// Web push (marketing and service notices). The payload is only what the team wrote (title, short text, an in-app path): never personal data.
// Only same-origin paths are followed; anything else opens the notification list.
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = {}; }
  const title = String(d.title || "Rutinia").slice(0, 80);
  e.waitUntil(self.registration.showNotification(title, { body: String(d.body || "").slice(0, 200), icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: typeof d.tag === "string" && d.tag ? d.tag.slice(0, 80) : undefined, data: { url: typeof d.url === "string" && d.url.startsWith("/") && !d.url.startsWith("//") ? d.url : "/trainer/notifications" } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/trainer/notifications";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => { for (const c of cs) { if ("navigate" in c) { c.navigate(url); return c.focus(); } } return self.clients.openWindow(url); }));
});
