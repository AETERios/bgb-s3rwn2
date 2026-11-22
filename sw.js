const CACHE = "jdbg-app-shiguang-20261122-v3";
const ASSETS = ["./", "./?v=shiguang-20261122-v3", "./index.html", "./design-v3.css", "./manifest.webmanifest", "./icon-180-v3.png", "./icon-192-v3.png", "./icon-512-v3.png"];
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
self.addEventListener("fetch", e => {
  if(e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if(url.origin !== self.location.origin) return;
  const network = () => fetch(e.request, e.request.mode === "navigate" ? {cache:"reload"} : undefined).then(resp => {
    if(resp.ok && !resp.redirected){ const copy = resp.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return resp;
  });
  // Navigation refreshes from the server; versioned URLs never reuse an older query's response.
  if(e.request.mode === "navigate"){
    e.respondWith(network().catch(() => caches.open(CACHE).then(c => c.match(e.request).then(hit => hit || c.match(new URL("./index.html", self.location.href))))));
  }else{
    e.respondWith(caches.open(CACHE).then(c => c.match(e.request)).then(hit => hit || network()));
  }
});
