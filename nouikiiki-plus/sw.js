/* 脳いきいき手帳 サービスワーカー（オフライン対応） */
/* アプリを更新したら、この APP_VER を上げること。
   index.html の <script src="...?v=..."> と同じ番号にそろえる。 */
const APP_VER = "0.3.7";
/* キャッシュ名は「nouikiiki-plus-」で始めること。
   無料版（nouikiiki-free-）と同じサイトに置くため、
   お互いのキャッシュを消してしまわないように、名前で見分けている。 */
const CACHE_PREFIX = "nouikiiki-plus-";
const CACHE_NAME = CACHE_PREFIX + APP_VER;
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./kuro.png",
  "./js/gate.js?v=" + APP_VER,
  "./js/records.js?v=" + APP_VER,
  "./js/shisetsu.js?v=" + APP_VER,
  "./js/plus-core.js?v=" + APP_VER,
  "./js/games-plus.js?v=" + APP_VER,
  "./js/karada.js?v=" + APP_VER,
  "./js/minna.js?v=" + APP_VER,
  "./js/boot-plus.js?v=" + APP_VER
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) =>
              (k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME) ||
              /^nouikiiki-(v\d|\d)/.test(k)   // 無料版・プラス版に分ける前の古いキャッシュ
            )
            .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* アプリ本体（HTML・JS）は「ネット優先」。
   ここをキャッシュ優先にすると、アプリを更新しても古いままの人が出てしまう。
   通信できないときだけキャッシュを使う。
   フォントや画像など、それ以外は「キャッシュ優先」で速さを優先する。 */
function isAppFile(url) {
  return url.origin === self.location.origin &&
         (url.pathname.endsWith(".js") || url.pathname.endsWith(".html") || url.pathname.endsWith("/"));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  if (isAppFile(url)) {
    // ネット優先
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) =>
            cached || (req.mode === "navigate" ? caches.match("./index.html") : Response.error())
          )
        )
    );
    return;
  }

  // それ以外はキャッシュ優先
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && (res.status === 200 || res.type === "opaque")) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => {
          if (req.mode === "navigate") return caches.match("./index.html");
          return Response.error();
        });
    })
  );
});
