# ขั้นตอนวางไฟล์ (เฉพาะไฟล์ที่แก้)

| ไฟล์ในชุดนี้ | วางที่ใน repo | หมายเหตุ |
|---|---|---|
| `backend/Code.gs` | `backend/Code.gs` และวางทับใน Apps Script | แล้ว **Deploy → Manage deployments → Edit → New version** |
| `index.html` | `index.html` (ราก repo) | ปุ่ม "อ่านคู่มือก่อน" 3 จุด |
| `manual/line.html` | `manual/line.html` | คู่มือภาพประกอบ ขั้นที่ 1–20 |
| `README.md` | `README.md` | อัปเดตโครงสร้าง + ฟีเจอร์ LINE |

หลังวาง Code.gs รัน `setupLine()` ไม่ต้อง · แค่ Deploy → New version แล้วลองเพิ่มเพื่อนด้วยบัญชี LINE ทดสอบ (บล็อกแล้วเพิ่มใหม่ ระบบจะนับเป็นเพื่อนเก่า ไม่ส่งคู่มือ)

ไม่ต้องแตะ: `config.js`, `assets/`, `manual/ch1-9.html`, `backend/appsscript.json`

```
git add backend/Code.gs index.html manual/line.html README.md
git commit -m "LINE: ทางลัดพิมพ์เลขบัตรในแชท + คู่มือภาพประกอบ + ปุ่มอ่านคู่มือ"
git push
```
Vercel จะ deploy เอง ไม่ต้อง build · คู่มืออ้างโลโก้ที่ `assets/logo.png` และ `assets/favicon-32.png` (ต้องมีใน repo)

## แก้เวลาเพี้ยน (19:17 แทน 12:17)
หลังวาง Code.gs + Deploy → New version แล้ว เปิดหน้าเจ้าหน้าที่ 1 ครั้ง ระบบจะแปลงเวลาเก่าให้เอง
(หรือรัน `fixTimeNow()` ใน Apps Script editor แล้วดู Execution log) · ข้อความใหม่จะเก็บเวลาถูกต้อง
ตรวจเพิ่มเติม: รัน `diagTime()` และตั้งเขตเวลาชีทที่ ไฟล์ → การตั้งค่า → เขตเวลา = Asia/Bangkok

## ส่งข้อความเตือนผู้ที่ยังไม่ผูก LINE
1. Deploy → New version แล้วรัน `remindUnlinkedDryRun()` ดู Execution log (จำนวนที่จะส่ง ไม่ส่งจริง)
2. รัน `remindUnlinked()` เพื่อส่งจริง · อยากให้ส่งเองทุกจันทร์ 09:00 รัน `installRemindTrigger()`
3. แท็บ LinePending จะมีคอลัมน์ใหม่ "เตือนล่าสุด / จำนวนครั้งที่เตือน" (สร้างให้เอง)
