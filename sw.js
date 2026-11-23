const CACHE = "jdbg-app-shiguang-import-20261123-v9-r2";
const ASSETS = ["./", "./?v=shiguang-import-20261123-v9-r2", "./index.html", "./design-v3.css", "./manifest.webmanifest", "./icon-180-v3.png", "./icon-192-v3.png", "./icon-512-v3.png"];
self.addEventListener("install", e => {
  const requests = ASSETS.map(asset => new Request(new URL(asset, self.location.href), {cache:"reload"}));
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(requests)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("jdbg-app-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("message", e => {
  if(e.data?.type === "BGB_VERSION") e.ports[0]?.postMessage({cache:CACHE});
});
