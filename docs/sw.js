// 오프라인에서도 열리도록: 화면 파일은 캐시 우선, 게임 데이터는 네트워크 우선(실패하면 마지막으로 받은 것)
const CACHE = 'gpc-v12';   // 화면 파일을 바꾸면 올린다 (캐시 우선이라 안 올리면 예전 화면이 한 번 더 뜬다)
const SHELL = ['./', 'index.html', 'style.css', 'recommend.js', 'app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;   // 스토어 검색 등 외부 요청은 건드리지 않는다
  // 게임 데이터와 외부 게임 사전은 자주 바뀌므로 네트워크 우선
  if (/\/data\/[^/]+\.json$/.test(url.pathname)) {
    e.respondWith(fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request)));
    return;
  }
  // 화면 파일: 캐시를 먼저 보여 주고 뒤에서 새 버전을 받아 둔다
  e.respondWith(caches.match(e.request).then((hit) => {
    const net = fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
