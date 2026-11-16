// Service Worker: يخزّن ملفات الواجهة الثابتة فقط لتجربة PWA.
// لا يخزّن أي طلب إلى /api أبداً: البيانات والتسجيل يعملان أونلاين فقط.
// استثناء: خطوط Google تُخزَّن بعد أول تحميل لتظهر آيات المصحف بشكلها الصحيح دون إنترنت.
// (نص المصحف والتلاوات المحمّلة تُخزَّن من الصفحة نفسها في quran-text-v1 وquran-audio-v1، وتبقى عند تحديث هذا الملف)
const CACHE = 'quran-school-shell-v6';
const FONTS = 'quran-fonts-v1';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon-192.png', '/logo.webp'])));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('quran-school-shell-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'GET' && FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open(FONTS).then((c) => c.match(req).then((hit) => {
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })));
    return;
  }
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return; // يمر للشبكة مباشرة
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/')));
    return;
  }
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
