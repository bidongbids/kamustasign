// LCSign service worker: lets the installed app open and run the
// translator with no connection after one online visit.
//
// - Page loads: network first, falling back to the cached app shell.
// - Hashed JS bundles and fonts (/_expo/static/, /assets/): cache first - a
//   new build has new file names.
// - Models, MediaPipe runtime, icons: stale-while-revalidate - served from
//   the cache, refreshed in the background, so a retrained model (same file
//   names) arrives on the next launch. Bump CACHE as well when shipping a
//   model, so no device can mix an old model.json with new shards.
// - Nothing heavy is precached, so installing doesn't download ~60 MB up
//   front; each file is cached the first time it is used. The page and
//   bundle loaded before this worker took control are sent over by App.tsx
//   ("cache-urls") so the very first visit is enough to open offline.
// - Everything else (Supabase, translation, other origins, video): untouched.
//
// Bump CACHE when the caching rules change; old caches are deleted on activate.
const CACHE = "kamustasign-v1";
const IMMUTABLE = [/^\/_expo\/static\//, /^\/assets\//];
const REVALIDATE = [/^\/model\//, /^\/word-model\//, /^\/fsl-model\//, /^\/mediapipe\//, /^\/icons\//, /^\/reference\/.*\.(jpg|png)$/];

// Whole files only: 206 (range) responses can't be cached.
function store(req, res) {
  if (res.status === 200) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("message", (event) => {
  if (event.data?.type !== "cache-urls") return;
  const urls = (event.data.urls || [])
    .map((u) => new URL(u, self.location.origin))
    .filter((u) => u.origin === self.location.origin)
    .filter((u) => u.pathname === "/" || [...IMMUTABLE, ...REVALIDATE].some((re) => re.test(u.pathname)));
  event.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(
        urls.map((u) =>
          c.match(u.href).then((hit) => hit || fetch(u.href).then((res) => res.status === 200 && c.put(u.href, res)).catch(() => {}))
        )
      )
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("/", copy));
          }
          return res;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  if (IMMUTABLE.some((re) => re.test(url.pathname))) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => store(req, res))));
    return;
  }

  if (REVALIDATE.some((re) => re.test(url.pathname))) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const fresh = fetch(req).then((res) => store(req, res));
        if (hit) {
          fresh.catch(() => {}); // offline: the cached copy is all there is
          return hit;
        }
        return fresh;
      })
    );
  }
});
