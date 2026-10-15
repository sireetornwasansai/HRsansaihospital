/* ตั้งค่าที่อยู่ Web App ของ Google Apps Script (ลงท้าย /exec)
 * ค่าเริ่มต้นคือลิงก์ที่อยู่ในไฟล์ FTE_Sansai_Hos.xlsx ของคุณ — ถ้า Deploy เป็น "New deployment" ใหม่ ให้แก้บรรทัดนี้บรรทัดเดียว
 * (ถ้าใช้ "Manage deployments > Edit > New version" บน Deployment เดิม ลิงก์เดิมใช้ได้เลย) */
window.APP_CONFIG = {
  /* ลิงก์ Web App ของระบบ FTE เดิม (ลงท้าย /exec) — ใส่แล้วเมนู "ระบบอัตรากำลัง FTE" จะขึ้นที่แถบนำทาง, เว้นว่างไว้ = ซ่อน */
  FTE_URL: '', GAS_URL: 'https://script.google.com/a/macros/sansaihospital.go.th/s/AKfycbxbDTmoSluMcM35zptxZ26Nu4RchZK5MC8T-2IxkeUJzINymjJcbPgWw1aetOrq5hJcMg/exec' };
