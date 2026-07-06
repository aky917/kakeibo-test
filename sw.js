/* ===== Service Worker for kakeibo PWA ===== */
/* キャッシュバージョン: 更新時にここの数字を上げると新版デプロイ */
const CACHE_VERSION = 'kakeibo-v1';

/* テスト環境か本番かをスコープから判定 */
const IS_TEST = self.location.pathname.includes('kakeibo-test');
const MAIN_HTML = IS_TEST ? './kakeibo2.html' : './kakeibo.html';

/* キャッシュ対象: 最低限これだけあればオフライン起動可能 */
const CACHE_FILES = [
  './',
  MAIN_HTML,
  './manifest.json',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

/* ===== インストール: 必要ファイルを全部キャッシュ ===== */
self.addEventListener('install', (event) => {
  console.log('[SW] install');
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      // addAll は1つでも失敗すると全部失敗する
      // なので個別に addして、失敗してもインストール自体は続行
      return Promise.all(
        CACHE_FILES.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] cache add failed:', url, err);
          })
        )
      );
    })
  );
});

/* ===== アクティベート: 古いキャッシュを削除 ===== */
self.addEventListener('activate', (event) => {
  console.log('[SW] activate');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ===== fetch: Network First 戦略 =====
   - 通常時: ネット優先 → 成功したらキャッシュ更新
   - オフライン時: キャッシュから返す
   - クラウド同期APIはキャッシュしない
*/
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // POST/PUT/DELETE などはキャッシュしない
  if (event.request.method !== 'GET') return;

  // クラウド同期APIは絶対にキャッシュしない
  if (url.includes('kakeibo-api')) return;

  // chrome拡張機能などのスキームはスキップ
  if (!url.startsWith('http')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 成功したらキャッシュを更新（同期的にはしない）
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => {
            cache.put(event.request, clone).catch(() => {});
          });
        }
        return response;
      })
      .catch(() => {
        // ネット失敗時: キャッシュから返す
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // メインHTMLへのリクエストならHTMLを返す
          if (event.request.mode === 'navigate') {
            return caches.match(MAIN_HTML);
          }
          // どうしても無い場合は失敗として返す
          return new Response('Offline and not cached', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
      })
  );
});

/* ===== メッセージ受信: 新版への即時切替 ===== */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
