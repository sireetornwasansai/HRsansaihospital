/* Vercel serverless function: พร็อกซีระหว่างหน้าเว็บ (เบราว์เซอร์) กับ Google Apps Script Web App
 * เหตุผล: Web App ของบัญชี Google Workspace (โดเมน sansaihospital.go.th) ตอบกลับผ่าน
 *   script.googleusercontent.com/a/macros/<โดเมน>/echo ซึ่งเบราว์เซอร์เรียกข้ามโดเมนจากหน้าเว็บบน Vercel ไม่ได้ (ติด CORS)
 *   การเรียกจากเซิร์ฟเวอร์ไม่มีข้อจำกัด CORS จึงให้เซิร์ฟเวอร์เรียกแทน แล้วส่งผลกลับมาที่โดเมนเดียวกับหน้าเว็บ
 *
 * ตั้งค่า (ไม่บังคับ): Environment Variable ใน Vercel
 *   GAS_URL = https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec   (ถ้าไม่ตั้ง ใช้ค่าเริ่มต้นด้านล่าง)
 * หน้าเว็บเรียก  POST /api/gas  (config.js → GAS_URL: '/api/gas')
 * ข้อจำกัด: Vercel รับ body ได้ไม่เกิน ~4.5 MB ต่อคำขอ (ไฟล์แนบที่ส่งเป็น base64 จึงควรไม่เกิน ~3 MB) */
const DEFAULT_TARGET = 'https://script.google.com/macros/s/AKfycbxbDTmoSluMcM35zptxZ26Nu4RchZK5MC8T-2IxkeUJzINymjJcbPgWw1aetOrq5hJcMg/exec';

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(typeof obj === 'string' ? obj : JSON.stringify(obj));
}

/* ลิงก์ที่จะลอง (ตามลำดับ) : ค่า env GAS_URL → ลิงก์มาตรฐาน → ลิงก์แบบโดเมน Workspace (ของบางโดเมนใช้ได้เฉพาะแบบหลัง) */
function targets() {
  const out = [];
  if (process.env.GAS_URL) out.push(process.env.GAS_URL);
  out.push(DEFAULT_TARGET);
  const m = /\/macros\/s\/([^/]+)\/exec/.exec(DEFAULT_TARGET);
  const dom = process.env.GAS_DOMAIN || 'sansaihospital.go.th';
  if (m) out.push('https://script.google.com/a/macros/' + dom + '/s/' + m[1] + '/exec');
  return out.filter((u, i) => out.indexOf(u) === i);
}

function brief(t) { return String(t || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160); }

module.exports = async (req, res) => {
  if (req.method === 'GET') return send(res, 200, { ok: true, proxy: 'gas', targets: targets().map((u) => u.replace(/\/s\/[^/]+\//, '/s/…/')) });
  if (req.method !== 'POST') return send(res, 405, { ok: false, message: 'method not allowed' });

  let raw;
  try { raw = await readRaw(req); } catch (e) { return send(res, 400, { ok: false, message: 'อ่านข้อมูลที่ส่งมาไม่ได้' }); }

  const diag = [];
  for (const target of targets()) {
    try {
      const r = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: raw,
        redirect: 'follow',                       // Apps Script ตอบ 302 → ตามไปรับผลจาก googleusercontent
        signal: AbortSignal.timeout(50000),
      });
      const text = await r.text();
      try { JSON.parse(text); return send(res, 200, text); } catch (e) {}
      let host = ''; try { host = new URL(r.url).host + new URL(r.url).pathname.slice(0, 30); } catch (e) {}
      const d = 'HTTP ' + r.status + ' @' + host + ' : ' + brief(text);
      console.error('GAS non-JSON', target.slice(0, 60), d);
      diag.push(d);
    } catch (e) {
      const timeout = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
      if (timeout) return send(res, 200, { ok: false, message: 'เซิร์ฟเวอร์ตอบช้าเกินกำหนด กรุณาตรวจสอบข้อมูลแล้วลองใหม่อีกครั้ง' });
      diag.push('error: ' + (e && e.message));
    }
  }
  return send(res, 200, { ok: false, message: 'เซิร์ฟเวอร์ Apps Script ตอบกลับผิดรูปแบบ [' + diag.join(' || ').slice(0, 400) + ']' });
};
module.exports.config = { api: { bodyParser: false } };
