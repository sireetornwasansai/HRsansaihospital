/* Service worker — ทำให้ติดตั้งเป็นแอปบน PC ได้ และเปิดหน้าเว็บได้แม้เน็ตหลุดชั่วคราว
 * หลักการ: หน้าเว็บ/ไฟล์ตั้งค่า = "เครือข่ายก่อน" (ได้เวอร์ชันล่าสุดเสมอ) แล้วค่อยใช้แคชสำรอง
 * ไม่แตะคำขอไปยัง Google Apps Script (ข้ามโดเมน/POST) จึงไม่มีข้อมูลผู้ยื่นหรือโทเค็นถูกเก็บในแคช
 * เปลี่ยน CACHE เมื่ออยากล้างแคชเก่า */
const CACHE = 'awc-v1';
const SHELL = ['/', '/index.html', '/config.js', '/manifest.webmanifest', '/assets/logo.png', '/assets/icon-192.png', '/assets/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(r).then(res => {
    if (res && res.ok && res.type === 'basic') { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); }
    return res;
  }).catch(() => caches.match(r).then(m => m || (r.mode === 'navigate' ? caches.match('/index.html') : Response.error()))));
});
