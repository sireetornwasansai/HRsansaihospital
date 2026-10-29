# ขั้นตอนวางไฟล์ (เฉพาะไฟล์ที่แก้)

| ไฟล์ในชุดนี้ | วางที่ใน repo | หมายเหตุ |
|---|---|---|
| `backend/Code.gs` | `backend/Code.gs` และวางทับใน Apps Script | แล้ว **Deploy → Manage deployments → Edit → New version** |
| `index.html` | `index.html` (ราก repo) | ปุ่ม "อ่านคู่มือก่อน" 3 จุด |
| `manual/line.html` | `manual/line.html` | คู่มือภาพประกอบ ขั้นที่ 1–20 |
| `README.md` | `README.md` | อัปเดตโครงสร้าง + ฟีเจอร์ LINE |

ไม่ต้องแตะ: `config.js`, `assets/`, `manual/ch1-9.html`, `backend/appsscript.json`

```
git add backend/Code.gs index.html manual/line.html README.md
git commit -m "LINE: ทางลัดพิมพ์เลขบัตรในแชท + คู่มือภาพประกอบ + ปุ่มอ่านคู่มือ"
git push
```
Vercel จะ deploy เอง ไม่ต้อง build · คู่มืออ้างโลโก้ที่ `assets/logo.png` และ `assets/favicon-32.png` (ต้องมีใน repo)
