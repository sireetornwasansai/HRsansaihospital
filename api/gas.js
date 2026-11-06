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

module.exports = async (req, res) => {
  const target = process.env.GAS_URL || DEFAULT_TARGET;
  if (req.method === 'GET') return send(res, 200, { ok: true, proxy: 'gas' });
  if (req.method !== 'POST') return send(res, 405, { ok: false, message: 'method not allowed' });

  let raw;
  try { raw = await readRaw(req); } catch (e) { return send(res, 400, { ok: false, message: 'อ่านข้อมูลที่ส่งมาไม่ได้' }); }

  try {
    const r = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: raw,
      redirect: 'follow',                       // Apps Script ตอบ 302 → ตามไปรับผลจาก googleusercontent
      signal: AbortSignal.timeout(55000),
    });
    const text = await r.text();
    try { JSON.parse(text); } catch (e) {       // ไม่ใช่ JSON = Apps Script ตอบหน้า error/หน้าล็อกอิน (เช่น สิทธิ์ไม่ใช่ Anyone)
      console.error('GAS non-JSON', r.status, text.slice(0, 200));
      return send(res, 200, { ok: false, message: 'เซิร์ฟเวอร์ Apps Script ตอบกลับผิดรูปแบบ (HTTP ' + r.status + ') กรุณาตรวจการตั้งค่า Deploy ว่าเปิดสิทธิ์เป็น "ทุกคน" และ Deploy เวอร์ชันล่าสุดแล้ว' });
    }
    return send(res, 200, text);
  } catch (e) {
    console.error('proxy error', e && e.message);
    const timeout = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return send(res, 200, { ok: false, message: timeout ? 'เซิร์ฟเวอร์ตอบช้าเกินกำหนด กรุณาตรวจสอบข้อมูลแล้วลองใหม่อีกครั้ง' : 'เชื่อมต่อเซิร์ฟเวอร์ Apps Script ไม่ได้' });
  }
};
module.exports.config = { api: { bodyParser: false } };
