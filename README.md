# ระบบติดตามสถานะการประเมินผลงาน (อวช.) — รพ.สันทราย

```
index.html, config.js, vercel.json   Frontend (Vercel) ← push repo นี้ได้เลย
backend/Code.gs, appsscript.json     Backend อวช. (Google Apps Script + Sheets)
fte/                                 ระบบเดิม FTE (index.html + backend/Code.gs + xlsx) ไม่ได้แก้ไข
docs/FUNCTIONS.md                    สรุปฟังก์ชันตามความต้องการ
```

## 1) Backend (GAS)
1. เปิดชีทที่มีแท็บ `allstaff` → Extensions → Apps Script → วาง `backend/Code.gs` + `appsscript.json`
2. Project Settings → Script Properties: **`ADMIN_PASSWORD`** (จำเป็น), `DRIVE_FOLDER_ID`, `SITE_URL` (เช่น https://xxx.vercel.app), `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_OA_ID` (เช่น @123abcde), `RECAPTCHA_SITE_KEY/SECRET_KEY` (ถ้าใช้)
3. รัน `setup()` (อนุญาตสิทธิ์ + สร้างแท็บ) แล้วรัน `setupLine()` เพื่อดู Webhook URL
4. Deploy → Web app (Execute as Me, Anyone) → คัดลอก URL `/exec`
5. LINE Developers → Messaging API → วาง Webhook URL (`...?k=รหัสลับ`) → Verify → เปิด Use webhook; ปิด Auto-reply
   - ถ้า URL เป็น `/a/macros/โดเมน/` แล้ว Verify ไม่ผ่าน ให้ใช้ `https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?k=...`
6. แก้โค้ดภายหลัง: Manage deployments → Edit → New version (URL เดิมใช้ต่อได้)

## 2) Frontend
แก้ `GAS_URL` ใน `config.js` ให้เป็น URL `/exec` ของ deployment → push GitHub → Vercel Import (Framework: Other)

## 3) ระบบ FTE เดิม
FTE เป็นเว็บที่เสิร์ฟจาก GAS (`google.script.run`) และมีสเปรดชีต/ชีตของตัวเอง จึงแยก deploy ไว้ ไม่รวมสคริปต์กัน (มีฟังก์ชัน `doGet` ชนกัน) — วางโค้ดใน `fte/` เป็นสำรอง แล้วใส่ URL `/exec` ของ FTE ที่ `FTE_URL` ใน `config.js` เมนู "ระบบอัตรากำลัง FTE" จะขึ้นบนเว็บอวช. ให้อัตโนมัติ

## หมายเหตุความปลอดภัย
ห้ามเก็บรหัสผ่านไว้ในชีท (แท็บ `link+รหัส` เดิมควรลบ) · token LINE เก็บใน Script Properties เท่านั้น
