/* Vercel serverless function: รับ Webhook จาก LINE แล้วส่งต่อให้ Google Apps Script
 * เหตุผล: Apps Script ตอบ POST ด้วย 302 redirect ทำให้ LINE Verify/ส่งเหตุการณ์ล้มเหลว (404/302)
 * และอ่าน header X-Line-Signature ไม่ได้ → ฟังก์ชันนี้ตรวจลายเซ็นให้ แล้วตอบ LINE 200 เสมอเมื่อลายเซ็นถูกต้อง
 *
 * ตั้งค่า Environment Variables ใน Vercel (Project → Settings → Environment Variables):
 *   LINE_CHANNEL_SECRET = Channel secret (LINE Developers → Basic settings)
 *   GAS_WEBHOOK_URL     = https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?k=<LINE_WEBHOOK_KEY>
 * แล้ว Redeploy และตั้ง Webhook URL ใน LINE เป็น https://<โดเมน Vercel>/api/line
 */
const crypto = require('crypto');

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.statusCode = 200; return res.end('LINE webhook proxy OK'); }
  const secret = process.env.LINE_CHANNEL_SECRET, target = process.env.GAS_WEBHOOK_URL;
  if (!secret || !target) { res.statusCode = 500; return res.end('missing env LINE_CHANNEL_SECRET / GAS_WEBHOOK_URL'); }

  const raw = await readRaw(req);
  const sig = Buffer.from(String(req.headers['x-line-signature'] || ''));
  const mac = Buffer.from(crypto.createHmac('sha256', secret).update(raw).digest('base64'));
  if (sig.length !== mac.length || !crypto.timingSafeEqual(sig, mac)) { res.statusCode = 401; return res.end('bad signature'); }

  try {
    const r = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: raw,
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) console.error('GAS status', r.status);
  } catch (e) { console.error('forward error', e && e.message); }
  res.statusCode = 200;
  res.end('OK');
};
module.exports.config = { api: { bodyParser: false } };
