# ระบบ อวช. + ระบบอัตรากำลัง FTE — รพ.สันทราย (เว็บเดียว / Backend เดียว)

```
index.html            หน้าเว็บ อวช. (ติดตามสถานะ / ยื่นเอกสาร / เจ้าหน้าที่ HR)       →  /
fte/index.html        หน้าเว็บ FTE เดิม (ปรับให้เรียก GAS ผ่าน fetch)                  →  /fte/
config.js             ตั้งค่า GAS_URL, LINE_QR (ไฟล์เดียวใช้ทั้งสองระบบ)
assets/line-qr.png    ★ วางรูป QR ของ LINE OA ที่นี่
vercel.json           ตั้งค่า Vercel (cleanUrls + security headers)
backend/Code.gs       Backend อวช. + ตัวส่งต่อคำสั่ง (doPost) ให้ FTE
backend/Fte.gs        Backend FTE เดิม (เปลี่ยนชื่อ doGet → fteDoGet_ เท่านั้น)
backend/appsscript.json
docs/FUNCTIONS.md     สรุปฟังก์ชันตามความต้องการ      docs/FTE_Sansai_Hos.xlsx  โครงชีทเดิม
```

## 1) Backend (Google Apps Script) — โปรเจกต์เดียว
1. เปิด Google Sheet ที่มีแท็บ `allstaff` และแท็บของ FTE → Extensions → Apps Script
2. สร้างไฟล์ `Code.gs` และ `Fte.gs` (วางโค้ดจาก `backend/`) และตั้ง `appsscript.json` (Project Settings → Show manifest)
3. ตั้ง **Script Properties** ตามตารางด้านล่าง
4. รัน `setup()` (อนุญาตสิทธิ์ + สร้างแท็บ อวช.) แล้วรัน `setupLine()` เพื่อดู Webhook URL
5. Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone) → ได้ URL `/exec` ใส่ใน `config.js`
   (ครั้งต่อไปใช้ Manage deployments → Edit → New version เพื่อให้ URL เดิมใช้ต่อได้)
6. LINE Developers → Messaging API → Webhook URL = ที่ได้จากข้อ 4 (`...?k=รหัสลับ`) → Verify → เปิด Use webhook, ปิด Auto-reply
   (ถ้า Verify ไม่ผ่านเพราะ URL เป็น `/a/macros/โดเมน/` ให้ใช้ `https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?k=...`)

## 2) Script Properties (Project Settings → Script Properties)

| ชื่อ | จำเป็น | ใช้กับ | คำอธิบาย |
|---|---|---|---|
| `ADMIN_PASSWORD` | ✅ | อวช. + FTE | รหัสผ่านผู้ดูแลระบบ (อวช.: ผู้ใช้ `admin`, FTE: หน้าแอดมิน) ใช้ค่าเดียวกันทั้งสองระบบ |
| `SPREADSHEET_ID` | แนะนำ | อวช. + FTE | ID ของ Google Sheet (ถ้าสคริปต์ผูกกับชีทอยู่แล้วเว้นได้) ทั้งสองระบบอ่านชีทเดียวกัน |
| `LINE_CHANNEL_ACCESS_TOKEN` | ถ้าใช้ LINE | อวช. | Channel access token (long-lived) จาก LINE Developers |
| `LINE_OA_ID` | ถ้าใช้ LINE | อวช. | เช่น `@123abcde` (ใช้ทำปุ่มเพิ่มเพื่อน) |
| `SITE_URL` | ถ้าใช้ LINE | อวช. | เช่น `https://xxxx.vercel.app` (ปุ่ม "ดูความคืบหน้า" และโลโก้ในข้อความ LINE — ต้องเป็น https) |
| `LINE_WEBHOOK_KEY` | อัตโนมัติ | อวช. | สร้างเองเมื่อรัน `setupLine()` — ไม่ต้องตั้งเอง |
| `DRIVE_FOLDER_ID` | ไม่บังคับ | อวช. | โฟลเดอร์เก็บไฟล์อัปโหลด (ไม่ใส่ = My Drive หลัก) |
| `HOSPITAL_NAME` / `HOSPITAL_SUBTITLE` | ไม่บังคับ | FTE | ชื่อ/คำบรรยายหัวเว็บ FTE (ค่าเริ่มต้น "โรงพยาบาลสันทราย") |
| `VISIT_COUNT` | อัตโนมัติ | FTE | ตัวนับผู้เข้าชม ระบบจัดการเอง |

## 3) Frontend (GitHub → Vercel)
```bash
cd awc-tracking-repo
git remote add origin https://github.com/<USER>/<REPO>.git     # repo ว่างที่สร้างบน GitHub
git push -u origin main
```
Vercel → Add New Project → เลือก repo → Framework: **Other** (ไม่ต้องมี build) → Deploy

## 4) ผู้ใช้ (HR) กับ allstaff
- แท็บ **Users** แยกจาก **allstaff** — ระบบอ่าน allstaff อย่างเดียว ไม่เขียน/แก้ไขชีท allstaff
- เพิ่มผู้ใช้โดยค้นหาจาก allstaff (ชื่อ/เลขบัตร) → ชื่อผู้ใช้เริ่มต้น = เลขบัตร, ตั้งรหัสผ่านเอง; ชื่อถูกคัดลอกเป็นสำเนา
- แก้ชื่อ/สิทธิ์/รีเซ็ตรหัสผ่านได้ในแท็บ Users โดยไม่กระทบ allstaff


## 5) การเปลี่ยนแปลงรอบนี้
- ถอดระบบยืนยันตัวตน (reCAPTCHA / ประตูทางเข้า / คุกกี้) ออกจากทั้ง อวช. และ FTE — ไม่ต้องตั้ง `RECAPTCHA_*` อีก (ล็อกอิน HR/แอดมินยังใช้รหัสผ่าน และจำกัดจำนวนครั้งที่ผิด)
- หน้าติดตามสถานะ อวช. ออกแบบใหม่ตามระบบสารบรรณ (ผู้ถือเรื่องตอนนี้, ขั้นตอน, เวลาที่อยู่ในแต่ละขั้น, ป้ายค้างนานกว่าปกติ, ความเคลื่อนไหวจัดกลุ่มตามวัน) — ตั้งผู้รับผิดชอบ/เกณฑ์วันที่ `STAGES` (`o`, `sla`) ใน `backend/Code.gs`
- ใส่โลโก้ทุกจุด: หัวเว็บ, หน้าโหลด, หน้าเปลี่ยนหน้า, ล็อกอิน, ท้ายเว็บ, favicon และการ์ด LINE (ต้องตั้ง `SITE_URL`)
- เพิ่มสถานะโหลด: หน้าจอเริ่มระบบ, skeleton ตามรูปทรงจริงของแต่ละหน้า, แถบโหลดด้านบน, ปุ่มหมุนระหว่างทำงาน, แผงขั้นตอนตอนส่งเอกสาร, กล่องยืนยันก่อนลบ/ยกเลิกการผูก
