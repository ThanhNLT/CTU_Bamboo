const SHELL = "bamboo-shell-v1";
const ASSETS = "bamboo-assets-v1";
const PRECACHE = ["/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png"];
const OFFLINE = `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bamboo – ngoại tuyến</title><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f5f7f5;color:#1b231e">
<div style="text-align:center;padding:24px"><h1 style="font-size:20px">Không có kết nối mạng</h1>
<p>Bamboo cần mạng để đọc dữ liệu mới nhất. Kiểm tra Wi-Fi hoặc dữ liệu di động rồi thử lại.</p>
<button onclick="location.reload()" style="padding:10px 18px;border-radius:999px;border:0;background:#2f7a3e;color:#fff;font-weight:600">Thử lại</button></div></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const trimAssets = async () => {
  const cache = await caches.open(ASSETS);
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - 300))) await cache.delete(key);
};

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) {
          cache.put(req, res.clone());
          void trimAssets();
        }
        return res;
      }),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } })),
    );
    return;
  }

  if (PRECACHE.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const fresh = fetch(req)
          .then((res) => {
            if (res.ok) caches.open(SHELL).then((cache) => cache.put(req, res.clone()));
            return res;
          })
          .catch(() => hit);
        return hit ?? fresh;
      }),
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url ?? "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (win) return win.navigate(target).then((w) => (w ?? win).focus());
      return self.clients.openWindow(target);
    }),
  );
});
