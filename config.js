/* ตั้งค่าหน้าเว็บ (แก้ไฟล์นี้ไฟล์เดียว) — ใช้ร่วมกันทั้งระบบ อวช. (/) และระบบ FTE (/fte/)
 * GAS_URL  = '/api/gas' (พร็อกซีบน Vercel → api/gas.js เรียก Apps Script แทนเบราว์เซอร์ เลี่ยง CORS) ; ลิงก์ Web App จริง (…/exec) ตั้งใน api/gas.js หรือ env GAS_URL
 *            ถ้า Deploy แบบ "Manage deployments > Edit > New version" ลิงก์เดิมใช้ต่อได้เลย
 * LINE_QR  = พาธรูป QR ของ LINE OA (ค่าเริ่มต้น assets/line-qr.png)
 * FTE_RECAPTCHA_SITE_KEY = (ถ้าใช้) reCAPTCHA site key ของหน้า FTE — ค่าเดียวกับ Script Property RECAPTCHA_SITE_KEY (เป็นค่าสาธารณะ) */
window.APP_CONFIG = {
  GAS_URL: '/api/gas',
  LINE_QR: 'assets/line-qr.png',
  FTE_RECAPTCHA_SITE_KEY: ''
};
