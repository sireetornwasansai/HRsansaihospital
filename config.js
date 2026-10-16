/* ตั้งค่าหน้าเว็บ (แก้ไฟล์นี้ไฟล์เดียว) — ใช้ร่วมกันทั้งระบบ อวช. (/) และระบบ FTE (/fte/)
 * GAS_URL  = ลิงก์ Web App ของ Google Apps Script (ลงท้าย /exec)
 *            ถ้า Deploy แบบ "Manage deployments > Edit > New version" ลิงก์เดิมใช้ต่อได้เลย
 * LINE_QR  = พาธรูป QR ของ LINE OA (ค่าเริ่มต้น assets/line-qr.png)
 * FTE_RECAPTCHA_SITE_KEY = (ถ้าใช้) reCAPTCHA site key ของหน้า FTE — ค่าเดียวกับ Script Property RECAPTCHA_SITE_KEY (เป็นค่าสาธารณะ) */
window.APP_CONFIG = {
  GAS_URL: 'https://script.google.com/a/macros/sansaihospital.go.th/s/AKfycbxbDTmoSluMcM35zptxZ26Nu4RchZK5MC8T-2IxkeUJzINymjJcbPgWw1aetOrq5hJcMg/exec',
  LINE_QR: 'assets/line-qr.png',
  FTE_RECAPTCHA_SITE_KEY: ''
};
