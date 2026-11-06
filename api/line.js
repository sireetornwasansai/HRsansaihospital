/* Vercel serverless function: รับ Webhook จาก LINE แล้วส่งต่อให้ Google Apps Script
 * เหตุผล: Apps Script ตอบ POST ด้วย 302 redirect ทำให้ LINE Verify/ส่งเหตุการณ์ล้มเหลว (404/302)
 * และอ่าน header X-Line-Signature ไม่ได้ → ฟังก์ชันนี้ตรวจลายเซ็นให้ แล้วตอบ LINE 200 เสมอเมื่อลายเซ็นถูกต้อง
 *
 * ตั้งค่า Environment Variables ใน Vercel (Project → Settings → Environment Variables):
 *   LINE_CHANNEL_SECRET = Channel secret (LINE Developers → Basic settings)
 *   GAS_WEBHOOK_URL     = https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?k=<LINE_WEBHOOK_KEY>
 *   LINE_WEBHOOK_KEY    = (ไม่บังคับ) รหัสเดียวกับ Script Property LINE_WEBHOOK_KEY — ถ้า GAS_WEBHOOK_URL ไม่มี ?k= ระบบจะเติมให้เอง
 * แล้ว Redeploy และตั้ง Webhook URL ใน LINE เป็น https://<โดเมน Vercel>/api/line
 * ตรวจการตั้งค่า: เปิด https://<โดเมน Vercel>/api/line ในเบราว์เซอร์ (GET) จะแสดงสถานะ env (ไม่เปิดเผยรหัสลับ)
 *
 * หมายเหตุ: รหัส k ถูกส่งให้ Apps Script 2 ทางพร้อมกัน — ใน URL (?k=) และในตัว body (_k) — เพื่อไม่ให้ขาดหายถ้า query string ถูกตัดระหว่างทาง
 *           (ลายเซ็นของ LINE ตรวจจาก body ดั้งเดิมก่อนแนบ _k เสมอ) */
const crypto = require('crypto');

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function getWaitUntil() {
  try {
    const c = globalThis[Symbol.for('@vercel/request-context')];
    const ctx = c && c.get && c.get();
    if (ctx && typeof ctx.waitUntil === 'function') return ctx.waitUntil.bind(ctx);
  } catch (e) {}
  return null;
}

/* ค่า env ที่คัดลอกมาอาจมีช่องว่าง/ขึ้นบรรทัดใหม่/เครื่องหมายคำพูดติดมา → ล้างให้ก่อนใช้ */
function clean(v) { return String(v == null ? '' : v).trim().replace(/^["']+|["']+$/g, '').trim(); }

/* ลิงก์ Web App มี 2 รูปแบบ: /macros/s/<ID>/exec (มาตรฐาน) และ /a/macros/<โดเมน>/s/<ID>/exec (Workspace) — ลองทั้งสองแบบ
 * (แบบ /a/macros/… มักขอให้ล็อกอินโดเมน → ได้ HTTP 401 หน้าล็อกอิน Google เมื่อเรียกจากเซิร์ฟเวอร์ จึงลองแบบมาตรฐานก่อน) */
function variants(u) {
  /* รับได้ 3 รูปแบบ: /macros/s/<ID>/exec , /a/macros/<โดเมน>/s/<ID>/exec , /a/<โดเมน>/macros/s/<ID>/exec */
  const m = /^\/(?:macros|a\/macros\/([^/]+)|a\/([^/]+)\/macros)\/s\/([^/]+)\/exec$/.exec(u.pathname);
  if (!m) return [u.toString()];
  const id = m[3], dom = m[1] || m[2] || clean(process.env.GAS_DOMAIN) || 'sansaihospital.go.th';
  const mk = (pn) => { const x = new URL(u.toString()); x.pathname = pn; return x.toString(); };
  return [mk('/macros/s/' + id + '/exec'), mk('/a/macros/' + dom + '/s/' + id + '/exec'), mk('/a/' + dom + '/macros/s/' + id + '/exec')];
}

/* หา URL ปลายทางและรหัส k : ใช้ ?k= ใน GAS_WEBHOOK_URL ก่อน ถ้าไม่มีใช้ LINE_WEBHOOK_KEY แล้วเติมต่อท้าย URL ให้ */
function resolveTarget() {
  const rawUrl = clean(process.env.GAS_WEBHOOK_URL), envKey = clean(process.env.LINE_WEBHOOK_KEY);
  if (!rawUrl) return { error: 'missing env GAS_WEBHOOK_URL' };
  let u;
  try { u = new URL(rawUrl); } catch (e) { return { error: 'GAS_WEBHOOK_URL ไม่ใช่ URL ที่ถูกต้อง' }; }
  let key = clean(u.searchParams.get('k')), source = 'GAS_WEBHOOK_URL';
  if (!key && envKey) { key = envKey; source = 'LINE_WEBHOOK_KEY'; u.searchParams.set('k', key); }
  if (!key) return { error: 'ไม่พบรหัส k: GAS_WEBHOOK_URL ต้องลงท้าย ?k=<LINE_WEBHOOK_KEY> หรือตั้ง env LINE_WEBHOOK_KEY (รัน setupLine() ใน Apps Script เพื่อดูรหัส)' };
  return { url: u.toString(), urls: variants(u), key, source };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    // GET = หน้าตรวจสอบการตั้งค่า (ไม่แสดงรหัสลับ)
    const t = resolveTarget();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify({
      ok: !t.error && !!process.env.LINE_CHANNEL_SECRET,
      proxy: 'line',
      LINE_CHANNEL_SECRET: !!process.env.LINE_CHANNEL_SECRET,
      GAS_WEBHOOK_URL: !!clean(process.env.GAS_WEBHOOK_URL),
      keyFound: !t.error, keySource: t.source || null, keyLength: t.key ? t.key.length : 0,   // ปกติ 32 ตัว
      problem: t.error || (process.env.LINE_CHANNEL_SECRET ? null : 'missing env LINE_CHANNEL_SECRET'),
    }));
  }
  const secret = clean(process.env.LINE_CHANNEL_SECRET), target = resolveTarget();
  if (!secret) { res.statusCode = 500; return res.end('missing env LINE_CHANNEL_SECRET'); }
  if (target.error) { console.error('config error:', target.error); res.statusCode = 500; return res.end(target.error); }

  const raw = await readRaw(req);
  const sig = Buffer.from(String(req.headers['x-line-signature'] || ''));
  const mac = Buffer.from(crypto.createHmac('sha256', secret).update(raw).digest('base64'));
  if (sig.length !== mac.length || !crypto.timingSafeEqual(sig, mac)) { res.statusCode = 401; return res.end('bad signature'); }

  // Verify ของ LINE ส่ง events ว่าง → ตอบ 200 ทันที ไม่ต้องปลุก Apps Script
  let hasEvents = true, body = raw;
  try {
    const b = JSON.parse(raw.toString('utf8'));
    hasEvents = Array.isArray(b.events) && b.events.length > 0;
    if (hasEvents) { b._k = target.key; body = Buffer.from(JSON.stringify(b), 'utf8'); }   // แนบรหัสใน body อีกทาง (หลังตรวจลายเซ็นแล้ว)
  } catch (e) {}
  if (!hasEvents) { res.statusCode = 200; return res.end('OK'); }

  // ส่งต่อให้ Apps Script (ช้า: cold start หลายวินาที) แล้วตอบ LINE ทันที ไม่รอผล
  // ลองใหม่สูงสุด 3 ครั้งเมื่อเครือข่ายล้ม/หมดเวลา/ได้ 5xx — Apps Script กันเหตุการณ์ซ้ำด้วย webhookEventId อยู่แล้ว จึงไม่ตอบซ้ำ
  async function forwardOnce() {
    let last = '';
    for (const url of target.urls) {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        redirect: 'follow',
        signal: AbortSignal.timeout(40000),
      });
      if (r.status >= 500) throw new Error('GAS status ' + r.status);
      const txt = await r.text().catch(() => '');
      if (r.ok && /"ok"\s*:\s*true/.test(txt)) return;                                   // Apps Script รับและประมวลผลแล้ว
      if (r.ok && /"ok"\s*:\s*false/.test(txt)) { console.error('GAS ปฏิเสธเหตุการณ์ (รหัส k ไม่ตรง?) → ดูแท็บ ActivityLog action=line_webhook ; keySource=' + target.source); return; }
      last = 'HTTP ' + r.status + (/accounts\.google|ppConfig|<!DOCTYPE/i.test(txt) ? ' (หน้าล็อกอิน/หน้า HTML ของ Google — Web App ไม่ได้ตั้งสิทธิ์ Who has access = Anyone หรือ URL ผิด)' : ' ' + txt.replace(/\s+/g, ' ').slice(0, 120)) + ' @' + new URL(url).pathname.slice(0, 40);
      console.error('GAS ตอบไม่ใช่ผลของระบบ:', last, '→ ลองลิงก์รูปแบบถัดไป');
    }
    console.error('ส่งต่อ Apps Script ไม่สำเร็จทุกรูปแบบลิงก์:', last);
  }
  const forward = (async () => {
    for (let i = 0; i < 3; i++) {
      try { await forwardOnce(); return; }
      catch (e) {
        console.error('forward error (try ' + (i + 1) + ')', e && e.message);
        if (i < 2) await new Promise((ok) => setTimeout(ok, 1500 * (i + 1)));
      }
    }
  })();

  const wu = getWaitUntil();
  if (wu) wu(forward);           // ให้ Vercel รันต่อหลังตอบแล้ว
  else await forward;            // ถ้าไม่มี waitUntil ต้องรอให้ส่งต่อเสร็จก่อน
  res.statusCode = 200;
  res.end('OK');
};
module.exports.config = { api: { bodyParser: false } };
