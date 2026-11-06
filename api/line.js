/* Vercel serverless function: ด่านรับ Webhook จาก LINE → ตรวจลายเซ็น → ส่งต่อให้ Google Apps Script
 *
 * ทำไมต้องมีด่านนี้: Apps Script อ่าน header X-Line-Signature ไม่ได้ และตอบ POST ด้วย 302 ทำให้ LINE Verify ล้มเหลวถ้าชี้ตรง
 *
 * Environment Variables (Vercel → Project → Settings → Environment Variables → แล้ว Redeploy):
 *   LINE_CHANNEL_SECRET  (จำเป็น)  Channel secret จาก LINE Developers → Basic settings
 *   LINE_WEBHOOK_KEY     (จำเป็น)  รหัส 32 ตัว ได้จากการรัน setupLine() ใน Apps Script (ต้องตรงกับ Script Property ชื่อเดียวกัน)
 *   GAS_WEBHOOK_URL      (ไม่บังคับ) ลิงก์ Web App https://script.google.com/macros/s/<ID>/exec  (ถ้าไม่ตั้ง ใช้ GAS_URL หรือค่าเริ่มต้นด้านล่าง)
 *                        ถ้า URL นี้มี ?k=<รหัส> อยู่แล้ว จะใช้รหัสนั้นก่อน
 * LINE Developers → Messaging API → Webhook URL = https://<โดเมน Vercel>/api/line
 *
 * ตรวจสอบ: เปิด https://<โดเมน Vercel>/api/line?probe=1 ในเบราว์เซอร์ → ต้องเห็น "ok":true และ gas.ok = true
 *           (probe จะเรียก Apps Script จริงด้วยรหัส k แต่ไม่ส่งข้อความหาใคร ไม่เปิดเผยรหัสลับ) */
const crypto = require('crypto');
const DEFAULT_GAS = 'https://script.google.com/macros/s/AKfycbxbDTmoSluMcM35zptxZ26Nu4RchZK5MC8T-2IxkeUJzINymjJcbPgWw1aetOrq5hJcMg/exec';

/* ค่า env ที่คัดลอกมาอาจมีช่องว่าง/ขึ้นบรรทัดใหม่/เครื่องหมายคำพูดติดมา → ล้างก่อนใช้ */
const clean = (v) => String(v == null ? '' : v).trim().replace(/^["']+|["']+$/g, '').trim();

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

/* ปลายทาง Apps Script + รหัส k */
function resolveTarget() {
  const raw = clean(process.env.GAS_WEBHOOK_URL) || clean(process.env.GAS_URL) || DEFAULT_GAS;
  let u;
  try { u = new URL(raw); } catch (e) { return { error: 'GAS_WEBHOOK_URL ไม่ใช่ URL ที่ถูกต้อง' }; }
  let key = clean(u.searchParams.get('k')), source = 'GAS_WEBHOOK_URL';
  if (!key) { key = clean(process.env.LINE_WEBHOOK_KEY); source = 'LINE_WEBHOOK_KEY'; }
  if (!key) return { error: 'ไม่พบรหัส k: ตั้ง env LINE_WEBHOOK_KEY (รัน setupLine() ใน Apps Script เพื่อดูรหัส) แล้ว Redeploy' };
  u.searchParams.set('k', key);
  return { url: u.toString(), key, source };
}

/* เรียก Apps Script 1 ครั้ง (ลองใหม่อีก 1 ครั้งถ้าเครือข่ายล้ม/ได้ 5xx) — คืน {status, ok, note} */
async function callGas(target, bodyObj) {
  const body = JSON.stringify(Object.assign({}, bodyObj, { _k: target.key }));   // แนบรหัสใน body อีกทาง เผื่อ query string ถูกตัด
  let last = { status: 0, ok: false, note: 'ไม่ได้เรียก' };
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(target.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, redirect: 'follow', signal: AbortSignal.timeout(25000) });
      const txt = await r.text().catch(() => '');
      if (r.status >= 500) { last = { status: r.status, ok: false, note: 'GAS ตอบ ' + r.status }; }
      else if (r.ok && /"ok"\s*:\s*true/.test(txt)) return { status: r.status, ok: true };
      else if (r.ok && /"ok"\s*:\s*false/.test(txt)) return { status: r.status, ok: false, note: 'Apps Script ปฏิเสธ: รหัส k ไม่ตรง (ดูแท็บ ActivityLog action=line_webhook)' };
      else return { status: r.status, ok: false, note: /accounts\.google|ppConfig|<!DOCTYPE/i.test(txt) ? 'ได้หน้า HTML/ล็อกอิน Google — Web App ต้องตั้ง Who has access = Anyone และใช้ลิงก์ /macros/s/<ID>/exec' : 'ตอบไม่ใช่รูปแบบของระบบ: HTTP ' + r.status + ' ' + txt.replace(/\s+/g, ' ').slice(0, 100) };
    } catch (e) { last = { status: 0, ok: false, note: 'เรียก GAS ไม่ได้: ' + (e && e.message) }; }
    if (i === 0) await new Promise((ok) => setTimeout(ok, 1200));
  }
  return last;
}

module.exports = async (req, res) => {
  const secret = clean(process.env.LINE_CHANNEL_SECRET), target = resolveTarget();

  if (req.method !== 'POST') {                      // GET = หน้าตรวจการตั้งค่า (ไม่แสดงรหัสลับ)
    const info = {
      proxy: 'line',
      LINE_CHANNEL_SECRET: !!secret,
      keyFound: !target.error, keySource: target.source || null, keyLength: target.key ? target.key.length : 0,   // ปกติ 32
      problem: !secret ? 'missing env LINE_CHANNEL_SECRET' : (target.error || null),
    };
    const q = String((req.url || '').split('?')[1] || '');
    if (/(^|&)probe=1(&|$)/.test(q) && !target.error) info.gas = await callGas(target, { events: [] });   // ทดสอบเรียก Apps Script จริง (events ว่าง = ไม่ส่งข้อความ)
    info.ok = !info.problem && (info.gas ? info.gas.ok : true);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify(info));
  }

  if (!secret) { res.statusCode = 500; return res.end('missing env LINE_CHANNEL_SECRET'); }
  if (target.error) { console.error('config error:', target.error); res.statusCode = 500; return res.end(target.error); }

  const raw = await readRaw(req);
  const sig = Buffer.from(String(req.headers['x-line-signature'] || ''));
  const mac = Buffer.from(crypto.createHmac('sha256', secret).update(raw).digest('base64'));
  if (sig.length !== mac.length || !crypto.timingSafeEqual(sig, mac)) { res.statusCode = 401; return res.end('bad signature'); }

  let payload;
  try { payload = JSON.parse(raw.toString('utf8')); } catch (e) { res.statusCode = 400; return res.end('bad json'); }
  if (!Array.isArray(payload.events) || payload.events.length === 0) { res.statusCode = 200; return res.end('OK'); }   // Verify ของ LINE ส่ง events ว่าง

  // ส่งต่อให้ Apps Script (cold start ได้หลายวินาที) — ตอบ LINE 200 เสมอเมื่อลายเซ็นถูก; Apps Script กันเหตุการณ์ซ้ำด้วย webhookEventId
  const types = payload.events.map((e) => e.type + (e.postback ? ':' + String(e.postback.data || '').slice(0, 30) : '')).join(',');
  const job = callGas(target, payload).then((r) => {
    if (r.ok) console.log('forwarded OK:', types);
    else console.error('forward FAILED:', types, JSON.stringify(r), 'keySource=' + target.source);
  });
  const wu = getWaitUntil();
  if (wu) wu(job); else await job;
  res.statusCode = 200;
  res.end('OK');
};
module.exports.config = { api: { bodyParser: false } };
