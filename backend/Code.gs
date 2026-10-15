/**
 * ระบบติดตามสถานะการประเมินผลงาน (อวช.) — กลุ่มงานทรัพยากรบุคคล โรงพยาบาลสันทราย จังหวัดเชียงใหม่
 * Backend: Google Apps Script (JSON API + LINE Webhook) + Google Sheets   |   Frontend: GitHub → Vercel (index.html)
 *
 * Script Properties (Project Settings > Script Properties)
 *   ADMIN_PASSWORD              รหัสผ่านผู้ใช้ "admin" (ใช้ครั้งแรกเพื่อสร้างผู้ใช้อื่น)  *จำเป็น*
 *   SPREADSHEET_ID              รหัสชีท (ไม่ใส่ = ใช้ชีทที่สคริปต์ผูกอยู่)
 *   DRIVE_FOLDER_ID             โฟลเดอร์เก็บไฟล์ที่อัปโหลด (ไม่ใส่ = Drive หลัก)
 *   RECAPTCHA_SITE_KEY / RECAPTCHA_SECRET_KEY   (ไม่ใส่ = ปิด reCAPTCHA)
 *   --- LINE Messaging API ---
 *   LINE_CHANNEL_ACCESS_TOKEN   Channel access token (long-lived) จาก LINE Developers  *จำเป็นถ้าจะใช้ LINE*
 *   LINE_WEBHOOK_KEY            รหัสลับท้าย Webhook URL (?k=...) — รันฟังก์ชัน setupLine() เพื่อสร้างให้อัตโนมัติ
 *   LINE_OA_ID                  LINE Official Account ID เช่น @123abcde (ใช้สร้างลิงก์เพิ่มเพื่อน)
 *   SITE_URL                    ที่อยู่เว็บบน Vercel เช่น https://awc-sansai.vercel.app (ใช้ทำปุ่ม "ดูความคืบหน้า" ในข้อความ LINE)
 *
 * แท็บที่ระบบสร้างให้อัตโนมัติ: ยื่นอวช, ประวัติสถานะ, Users, Notifications, ActivityLog, LineUsers, LineLog
 */
var TZ = 'Asia/Bangkok', SESSION_TTL = 3600;
var ORG = 'กลุ่มงานทรัพยากรบุคคล โรงพยาบาลสันทราย จังหวัดเชียงใหม่';
var TITLE = 'ระบบติดตามสถานะการประเมินผลงาน (อวช.)';
/* ขั้นตอน: k=รหัส t=ชื่อ c=โทนสี (blue=ปกติ orange=ต้องแก้ไข green=สำเร็จ) h=คำอธิบายสั้นในข้อความแจ้งเตือน */
var STAGES = [
  { k: 'submitted', t: 'ยื่นเอกสารแล้ว', c: 'blue', h: 'ระบบได้รับเอกสารผลงานของท่านแล้ว' },
  { k: 'qualify', t: 'ตรวจคุณสมบัติ (HR)', c: 'blue', h: 'เจ้าหน้าที่ HR กำลังตรวจคุณสมบัติ' },
  { k: 'review', t: 'อยู่ระหว่างกรรมการตรวจผลงาน', c: 'blue', h: 'ผลงานอยู่ระหว่างการตรวจของกรรมการ' },
  { k: 'revise', t: 'ต้องแก้ไข', c: 'orange', h: 'กรุณาแก้ไขผลงานตามหมายเหตุด้านล่าง' },
  { k: 'passed', t: 'ผ่านการประเมิน', c: 'green', h: 'ผลงานผ่านการประเมินแล้ว' }
];
var SH = { SUB: 'ยื่นอวช', HIS: 'ประวัติสถานะ', USR: 'Users', NOT: 'Notifications', LOG: 'ActivityLog', STAFF: 'allstaff', LNU: 'LineUsers', LNL: 'LineLog' };
var HEAD = {
  SUB: ['รหัส', 'เวลายื่น', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', 'เลขบัตรประชาชน', 'ตำแหน่ง', 'กลุ่มงาน', 'ตำแหน่งเลขที่', 'วันเริ่มงาน', 'อายุงาน', 'วุฒิการศึกษา', 'ชื่อผลงาน', 'ลิงก์ไฟล์', 'เบอร์โทร', 'อีเมล', 'สถานะ', 'หมายเหตุ', 'อัปเดตล่าสุด'],
  HIS: ['รหัส', 'เวลา', 'สถานะ', 'หมายเหตุ', 'โดย'],
  USR: ['username', 'ชื่อ-สกุล', 'role', 'salt', 'hash', 'active'],
  NOT: ['เวลา', 'เลขบัตรประชาชน', 'รหัส', 'ข้อความ'],
  LOG: ['เวลา', 'กิจกรรม', 'ผู้ใช้', 'ผลลัพธ์', 'รายละเอียด'],
  LNU: ['เลขบัตรประชาชน', 'LINE userId', 'ชื่อ LINE', 'ผูกเมื่อ', 'วิธีผูก', 'active'],
  LNL: ['เวลา', 'รหัส', 'เลขบัตรประชาชน', 'ประเภท', 'ผู้ส่ง', 'ข้อความ', 'ชื่อไฟล์', 'ลิงก์ไฟล์', 'ผลลัพธ์', 'รายละเอียด']
};
var KEYS = ['id', 'ts', 'prefix', 'first', 'last', 'cid', 'position', 'group', 'posNo', 'start', 'tenure', 'edu', 'title', 'link', 'phone', 'email', 'status', 'note', 'upd'];
var EDITABLE = ['prefix', 'first', 'last', 'cid', 'position', 'group', 'posNo', 'start', 'edu', 'title', 'link', 'phone', 'email', 'status', 'note'];
/* ประเภทข้อความ LINE ที่บันทึกใน LineLog: auto=อัตโนมัติเมื่อสถานะเปลี่ยน, manual=กดแจ้งเตือน(ข้อความสำเร็จรูป), typed=เจ้าหน้าที่พิมพ์เอง, bot=ระบบตอบในแชท, inbound=ผู้ยื่นพิมพ์เข้ามา, link=ผูกบัญชี */
var OUT_TYPES = ['auto', 'manual', 'typed'];
var FILE_MAX = 8 * 1024 * 1024;
var EXT_MIME = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', zip: 'application/zip', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
var SUBMIT_EXT = ['pdf', 'doc', 'docx', 'zip'];
var LINE_EXT = ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx', 'xls', 'xlsx'];

/* ---------- Entry ---------- */
var API = {
  config: apiConfig_, track: apiTrack_, lookup: apiLookup_, submit: apiSubmit_,
  login: apiLogin_, logout: apiLogout_, verify: apiVerify_,
  adminList: apiAdminList_, adminSave: apiAdminSave_, adminDelete: apiAdminDelete_,
  usersList: apiUsersList_, userAdd: apiUserAdd_, userToggle: apiUserToggle_, logList: apiLogList_,
  lineLinkReq: apiLineLinkReq_, lineLinkCheck: apiLineLinkCheck_,
  lineInfo: apiLineInfo_, lineSend: apiLineSend_, lineAdmin: apiLineAdmin_, lineCheck: apiLineCheck_, lineUnlink: apiLineUnlink_, lineAdd: apiLineAdd_
};
function doGet() { return json_({ ok: true, name: TITLE }); }
function doPost(e) {
  var out;
  try {
    var b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (b && Array.isArray(b.events)) return lineWebhook_(e, b);           // เรียกจาก LINE Platform
    if (!b.fn || !Object.prototype.hasOwnProperty.call(API, b.fn)) throw new Error('ไม่พบคำสั่งที่เรียก');
    out = API[b.fn].apply(null, b.args || []);
    if (out.ok === undefined) out.ok = true;
  } catch (err) { out = { ok: false, message: String(err.message || err) }; }
  return json_(out);
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ---------- Helpers ---------- */
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }
function ss_() { var id = prop_('SPREADSHEET_ID'); return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(key) {
  var ss = ss_(), name = SH[key], s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    s.getRange(1, 1, 1, HEAD[key].length).setValues([HEAD[key]]).setFontWeight('bold');
    s.setFrozenRows(1);
    s.getRange(1, 1, s.getMaxRows(), HEAD[key].length).setNumberFormat('@');
  }
  return s;
}
function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }
function digits_(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
function str_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm:ss');
  return String(v == null ? '' : v).trim();
}
function validCid_(c) {
  if (!/^\d{13}$/.test(c)) return false;
  for (var i = 0, s = 0; i < 12; i++) s += +c[i] * (13 - i);
  return (11 - (s % 11)) % 10 === +c[12];
}
function tenure_(start) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start || '');
  if (!m) return '';
  var d = new Date(), months = (d.getFullYear() - +m[1]) * 12 + d.getMonth() + 1 - +m[2];
  if (d.getDate() < +m[3]) months--;
  return months < 0 ? '' : Math.floor(months / 12) + ' ปี ' + (months % 12) + ' เดือน';
}
function stageOk_(k) { return STAGES.some(function (s) { return s.k === k; }); }
function stageObj_(k) { for (var i = 0; i < STAGES.length; i++) if (STAGES[i].k === k) return STAGES[i]; return { k: k, t: k, c: 'blue', h: '' }; }
function stageName_(k) { return stageObj_(k).t; }
function thaiDT_(d) {
  var M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  var p = Utilities.formatDate(d || new Date(), TZ, 'd|M|yyyy|HH:mm').split('|');
  return p[0] + ' ' + M[+p[1] - 1] + ' ' + (+p[2] + 543) + ' ' + p[3] + ' น.';
}
function rateOk_(key, max, ttl) {
  var c = CacheService.getScriptCache(), n = +c.get(key) || 0;
  if (n >= max) return false;
  c.put(key, String(n + 1), ttl);
  return true;
}
function subs_() {
  var s = sheet_('SUB'), n = s.getLastRow();
  if (n < 2) return [];
  return s.getRange(2, 1, n - 1, KEYS.length).getValues().map(function (r, i) {
    var o = { row: i + 2 };
    KEYS.forEach(function (k, j) { o[k] = (k === 'cid') ? digits_(r[j]) : str_(r[j]); });
    return o;
  });
}
function staffByCid_(cid) {
  var s = ss_().getSheetByName(SH.STAFF);
  if (!s || s.getLastRow() < 2) return null;
  var v = s.getRange(2, 1, s.getLastRow() - 1, 34).getValues();
  for (var i = 0; i < v.length; i++) if (digits_(v[i][32]) === cid)
    return { prefix: str_(v[i][1]), first: str_(v[i][2]), last: str_(v[i][3]), position: str_(v[i][4]), posNo: str_(v[i][8]), group: str_(v[i][19]), phone: str_(v[i][33]) };
  return null;
}
function log_(action, user, result, detail) {
  try { sheet_('LOG').appendRow([now_(), action, user || '', result || '', detail || '']); } catch (e) {}
}
function notify_(item, msg) {
  try {
    sheet_('NOT').appendRow([now_(), item.cid, item.id, msg]);
    if (item.email) MailApp.sendEmail(item.email, '[อวช.] ' + item.id, msg + '\n\nติดตามสถานะด้วยเลขบัตรประชาชนที่หน้าเว็บระบบ\n' + ORG);
  } catch (e) {}
}
function verifyRc_(tok) {
  var secret = prop_('RECAPTCHA_SECRET_KEY');
  if (!secret) return;
  if (!tok) throw new Error('กรุณายืนยัน "ฉันไม่ใช่หุ่นยนต์" ก่อน');
  var r = JSON.parse(UrlFetchApp.fetch('https://www.google.com/recaptcha/api/siteverify', { method: 'post', payload: { secret: secret, response: tok }, muteHttpExceptions: true }).getContentText());
  if (!r.success) throw new Error('ยืนยัน reCAPTCHA ไม่สำเร็จ กรุณาลองใหม่');
}
function hash_(salt, pw) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + pw, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
function auth_(token, needAdmin) {
  var c = CacheService.getScriptCache(), v = token && c.get('s_' + token);
  if (!v) throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  var u = JSON.parse(v);
  if (needAdmin && u.r !== 'admin') throw new Error('ต้องใช้สิทธิ์ผู้ดูแลระบบ');
  c.put('s_' + token, v, SESSION_TTL);
  return u;
}
function findSub_(id) { return subs_().filter(function (r) { return r.id === id; })[0]; }

/* ---------- ไฟล์แนบ: ตรวจสอบฝั่งเซิร์ฟเวอร์ (นามสกุล + ขนาด + ลายเซ็นไฟล์) แล้วบันทึกลง Drive ---------- */
function safeName_(n) {
  n = String(n || 'file').replace(/[\\\/:*?"<>|\r\n]+/g, '_').replace(/\s+/g, ' ').trim();
  return n.slice(-80) || 'file';
}
function sniffOk_(b, ext) {
  var h = []; for (var i = 0; i < 8 && i < b.length; i++) h.push(b[i] & 255);
  function is(a) { return a.every(function (x, i) { return h[i] === x; }); }
  if (ext === 'pdf') return is([0x25, 0x50, 0x44, 0x46]);
  if (ext === 'jpg' || ext === 'jpeg') return is([0xFF, 0xD8, 0xFF]);
  if (ext === 'png') return is([0x89, 0x50, 0x4E, 0x47]);
  if (ext === 'docx' || ext === 'xlsx' || ext === 'zip') return is([0x50, 0x4B]);
  if (ext === 'doc' || ext === 'xls') return is([0xD0, 0xCF, 0x11, 0xE0]);
  return false;
}
function saveUpload_(file, allowed, share) {
  var name = safeName_(file && file.name), m = /\.([A-Za-z0-9]+)$/.exec(name), ext = m ? m[1].toLowerCase() : '';
  if (allowed.indexOf(ext) < 0) throw new Error('ชนิดไฟล์ไม่รองรับ (รองรับ: ' + allowed.join(', ') + ')');
  var bytes = Utilities.base64Decode(String((file && file.data) || ''));
  if (!bytes.length) throw new Error('ไฟล์ว่างเปล่า');
  if (bytes.length > FILE_MAX) throw new Error('ไฟล์ใหญ่เกิน 8 MB กรุณาลดขนาดหรือใช้ลิงก์แทน');
  if (!sniffOk_(bytes, ext)) throw new Error('เนื้อหาไฟล์ไม่ตรงกับนามสกุล .' + ext);
  var fid = prop_('DRIVE_FOLDER_ID'), folder = fid ? DriveApp.getFolderById(fid) : DriveApp.getRootFolder();
  var f = folder.createFile(Utilities.newBlob(bytes, EXT_MIME[ext], name)), shared = false;
  if (share) { try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); shared = true; } catch (e) {} }
  return { id: f.getId(), name: name, url: f.getUrl(), isImg: /^image\//.test(EXT_MIME[ext]), shared: shared, size: bytes.length };
}

/* ======================================================================
 *  LINE Messaging API
 * ====================================================================== */
function lineEnabled_() { return !!prop_('LINE_CHANNEL_ACCESS_TOKEN'); }
function lineOaLink_() { var o = prop_('LINE_OA_ID'); return o ? 'https://line.me/R/ti/p/' + encodeURIComponent(o) : ''; }
function siteUrl_() { var u = prop_('SITE_URL'); return /^https:\/\//i.test(u) ? u : ''; }
function lineCall_(method, path, body, retryKey) {
  var h = { Authorization: 'Bearer ' + prop_('LINE_CHANNEL_ACCESS_TOKEN') };
  if (retryKey) h['X-Line-Retry-Key'] = retryKey;
  var o = { method: method, headers: h, muteHttpExceptions: true };
  if (body) { o.contentType = 'application/json'; o.payload = JSON.stringify(body); }
  var r = UrlFetchApp.fetch('https://api.line.me' + path, o), code = r.getResponseCode(), txt = r.getContentText(), j = {};
  try { j = JSON.parse(txt || '{}'); } catch (e) {}
  var err = '';
  if (code < 200 || code > 299) {
    err = (j.message || txt || ('HTTP ' + code)).slice(0, 200);
    if (code === 401) err = 'Channel access token ไม่ถูกต้องหรือหมดอายุ';
    else if (code === 429) err = 'เกินโควตาข้อความ LINE ของเดือนนี้/ส่งถี่เกินไป';
    else if (code === 400 && /friend|block|not\s*a\s*friend/i.test(err)) err = 'ผู้รับยังไม่ได้เพิ่มเพื่อน หรือบล็อกบัญชี LINE OA';
  }
  return { ok: !err, status: code, err: err, data: j };
}
function linePush_(uid, messages) { return lineCall_('post', '/v2/bot/message/push', { to: uid, messages: messages }, Utilities.getUuid()); }
function lineReply_(token, messages) { if (token) lineCall_('post', '/v2/bot/message/reply', { replyToken: token, messages: messages }); }
function lineProfile_(uid) { try { var r = lineCall_('get', '/v2/bot/profile/' + uid); return r.ok ? str_(r.data.displayName) : ''; } catch (e) { return ''; } }

/* --- Flex Message builders --- */
function tx_(s, n) { s = String(s == null ? '' : s).trim(); return s ? s.slice(0, n || 300) : '-'; }
function frow_(k, v) {
  return { type: 'box', layout: 'baseline', spacing: 'sm', margin: 'md', contents: [
    { type: 'text', text: k, color: '#51676f', size: 'sm', flex: 3 }, { type: 'text', text: tx_(v), wrap: true, size: 'sm', flex: 6 }] };
}
function ffoot_() {
  var u = siteUrl_();
  return u ? { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#0f766e', height: 'sm', action: { type: 'uri', label: 'ดูความคืบหน้า', uri: u + '#track' } }] } : null;
}
function fbubble_(headText, color, body) {
  var b = { type: 'bubble', size: 'mega',
    header: { type: 'box', layout: 'vertical', backgroundColor: color, paddingAll: '14px', contents: [{ type: 'text', text: headText, color: '#ffffff', weight: 'bold', size: 'md', wrap: true }] },
    body: { type: 'box', layout: 'vertical', contents: body } };
  var f = ffoot_(); if (f) b.footer = f;
  return b;
}
function flexStatus_(it, head) {
  var st = stageObj_(it.status), col = { blue: '#1d4ed8', orange: '#d97706', green: '#15803d' }[st.c] || '#0f766e';
  var body = [
    { type: 'text', text: tx_(st.t), weight: 'bold', size: 'xl', wrap: true, color: col },
    { type: 'text', text: tx_(st.h), size: 'sm', color: '#51676f', wrap: true, margin: 'sm' },
    { type: 'separator', margin: 'lg' }, frow_('รหัสติดตาม', it.id), frow_('ผลงาน', it.title)];
  if (it.note) body.push(frow_('หมายเหตุ', it.note));
  body.push(frow_('อัปเดตเมื่อ', thaiDT_()));
  return { type: 'flex', altText: ('อวช. ' + st.t + ' (' + it.id + ')').slice(0, 380), contents: fbubble_(head || 'อัปเดตสถานะ อวช.', col, body) };
}
function flexText_(it, text) {
  var body = [{ type: 'text', text: tx_(text, 1000), wrap: true, size: 'md' }, { type: 'separator', margin: 'lg' }, frow_('รหัสติดตาม', it.id), frow_('ผลงาน', it.title)];
  return { type: 'flex', altText: tx_(text, 380), contents: fbubble_('ข้อความจากกลุ่มงานทรัพยากรบุคคล', '#0f766e', body) };
}
function flexFile_(fi) {
  var b = { type: 'bubble', size: 'mega',
    body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [
      { type: 'text', text: fi.isImg ? 'รูปภาพแนบจากเจ้าหน้าที่' : 'ไฟล์แนบจากเจ้าหน้าที่', size: 'sm', color: '#51676f' },
      { type: 'text', text: tx_(fi.name, 100), weight: 'bold', wrap: true }] },
    footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'secondary', height: 'sm', action: { type: 'uri', label: fi.isImg ? 'เปิดรูปเต็ม' : 'เปิดไฟล์', uri: fi.url } }] } };
  if (fi.isImg && fi.shared) b.hero = { type: 'image', url: 'https://drive.google.com/thumbnail?id=' + fi.id + '&sz=w1000', size: 'full', aspectRatio: '4:3', aspectMode: 'cover', action: { type: 'uri', uri: fi.url } };
  return { type: 'flex', altText: 'ไฟล์แนบ: ' + tx_(fi.name, 100), contents: b };
}
function helpMsg_(text) {
  return { type: 'text', text: text, quickReply: { items: [
    { type: 'action', action: { type: 'message', label: 'สถานะ', text: 'สถานะ' } },
    { type: 'action', action: { type: 'message', label: 'ยกเลิกการผูก', text: 'ยกเลิกการผูก' } },
    { type: 'action', action: { type: 'message', label: 'ช่วยเหลือ', text: 'ช่วยเหลือ' } }] } };
}

/* --- ผู้ใช้ LINE ที่ผูกกับเลขบัตร --- */
function lnuRows_() {
  var s = sheet_('LNU'), n = s.getLastRow();
  if (n < 2) return [];
  return s.getRange(2, 1, n - 1, 6).getValues().map(function (r, i) {
    return { row: i + 2, cid: digits_(r[0]), uid: str_(r[1]), name: str_(r[2]), at: str_(r[3]), via: str_(r[4]), active: str_(r[5]) !== 'N' };
  });
}
function lineUsersByCid_(cid) { return lnuRows_().filter(function (r) { return r.cid === cid && r.active; }).map(function (r) { return r.uid; }); }
function linkLine_(cid, uid, name, via) {
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    var s = sheet_('LNU'), rows = lnuRows_(), found = false;
    rows.forEach(function (r) {                       // 1 บัญชี LINE = 1 คน: ปิดการผูกกับเลขบัตรอื่น
      if (r.uid === uid && r.cid !== cid && r.active) s.getRange(r.row, 6).setValue('N');
      if (r.uid === uid && r.cid === cid) { found = true; s.getRange(r.row, 3, 1, 4).setValues([[name || r.name, now_(), via, 'Y']]); }
    });
    var mine = rows.filter(function (r) { return r.cid === cid && r.active && r.uid !== uid; });
    if (mine.length >= 3) s.getRange(mine[0].row, 6).setValue('N');   // จำกัด 3 บัญชี/คน
    if (!found) s.appendRow([cid, uid, name || '', now_(), via, 'Y']);
  } finally { lock.releaseLock(); }
}
function unlinkLine_(cid, uid) {
  var s = sheet_('LNU'), n = 0;
  lnuRows_().forEach(function (r) { if (r.active && (uid ? r.uid === uid : r.cid === cid) && (!cid || r.cid === cid)) { s.getRange(r.row, 6).setValue('N'); n++; } });
  return n;
}
function lineLog_(id, cid, type, sender, text, file, result, detail) {
  try { sheet_('LNL').appendRow([now_(), id || '', cid || '', type, sender || '', String(text || '').slice(0, 1000), file ? file.name : '', file ? file.url : '', result, String(detail || '').slice(0, 300)]); } catch (e) {}
}
function lnlRows_(max) {
  var s = sheet_('LNL'), n = s.getLastRow();
  if (n < 2) return [];
  var from = Math.max(2, n - (max || 2000) + 1);
  return s.getRange(from, 1, n - from + 1, 10).getValues().map(function (r) {
    return { t: str_(r[0]), id: str_(r[1]), cid: digits_(r[2]), type: str_(r[3]), by: str_(r[4]), m: str_(r[5]), fn: str_(r[6]), fu: str_(r[7]), res: str_(r[8]), d: str_(r[9]) };
  });
}
/* ตรวจก่อนส่ง: คืน {ok, users, reason} และบันทึกประวัติ (รวมครั้งที่กดแต่ส่งไม่ได้) */
function linePre_(cid, id, type, sender, text) {
  if (!lineEnabled_()) { lineLog_(id, cid, type, sender, text, null, 'skipped', 'ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN'); return { ok: false, reason: 'disabled', msg: 'ยังไม่ได้ตั้งค่า LINE (ผู้ดูแลระบบต้องใส่ Channel access token)' }; }
  var users = lineUsersByCid_(cid);
  if (!users.length) { lineLog_(id, cid, type, sender, text, null, 'no_line', 'ผู้ยื่นยังไม่ได้เชื่อมต่อ LINE'); return { ok: false, reason: 'none', msg: 'ผู้ยื่นรายนี้ยังไม่ได้เชื่อมต่อ LINE' }; }
  return { ok: true, users: users };
}
function lineSend_(users, cid, id, type, sender, messages, text, file) {
  var res = { sent: 0, failed: 0, errors: [] };
  users.forEach(function (uid) {
    var r = linePush_(uid, messages);
    if (r.ok) { res.sent++; lineLog_(id, cid, type, sender, text, file, 'sent', ''); }
    else { res.failed++; res.errors.push(r.err); lineLog_(id, cid, type, sender, text, file, 'failed', r.err); }
  });
  return res;
}
/* แจ้งเตือนอัตโนมัติเมื่อสถานะ/หมายเหตุเปลี่ยน (หรือยื่นเอกสาร) — ไม่ throw เพื่อไม่ให้กระทบการบันทึกหลัก */
function autoNotify_(it, sender, head, file) {
  try {
    var text = (head || 'สถานะเปลี่ยนเป็น') + ' ' + stageName_(it.status) + (it.note ? ' — ' + it.note : '');
    var pre = linePre_(it.cid, it.id, 'auto', sender, text);
    if (!pre.ok) return { sent: 0, failed: 0, skipped: pre.reason, msg: pre.msg };
    var msgs = [flexStatus_(it, head === 'ยื่นเอกสารแล้ว' ? 'ได้รับเอกสารของท่านแล้ว' : 'อัปเดตสถานะ อวช.')];
    if (file) msgs.push(flexFile_(file));
    return lineSend_(pre.users, it.cid, it.id, 'auto', sender, msgs, text, file);
  } catch (e) { log_('line_auto', sender, 'error', String(e.message || e)); return { sent: 0, failed: 1, errors: [String(e.message || e)] }; }
}

/* --- Webhook (LINE → GAS) --- */
function webhookKey_() {
  var k = prop_('LINE_WEBHOOK_KEY');
  if (!k) { k = Utilities.getUuid().replace(/-/g, ''); PropertiesService.getScriptProperties().setProperty('LINE_WEBHOOK_KEY', k); }
  return k;
}
function lineWebhook_(e, b) {
  var key = prop_('LINE_WEBHOOK_KEY');
  // GAS อ่าน header X-Line-Signature ไม่ได้ จึงใช้รหัสลับใน URL (?k=) แทน
  if (!key || !e.parameter || e.parameter.k !== key) { log_('line_webhook', '', 'rejected', ''); return json_({ ok: false }); }
  (b.events || []).forEach(function (ev) { try { lineEvent_(ev); } catch (err) { log_('line_event', '', 'error', String(err.message || err)); } });
  return json_({ ok: true });
}
function lineEvent_(ev) {
  var uid = ev.source && ev.source.userId; if (!uid) return;
  var rows = lnuRows_().filter(function (r) { return r.uid === uid; }), mine = rows.filter(function (r) { return r.active; })[0];
  var s = sheet_('LNU');
  if (ev.type === 'unfollow') { rows.forEach(function (r) { s.getRange(r.row, 6).setValue('N'); }); lineLog_('', mine ? mine.cid : '', 'link', '', 'ผู้ใช้บล็อก/เลิกติดตาม LINE OA', null, 'info', ''); return; }
  if (ev.type === 'follow') {
    var back = rows.filter(function (r) { return !r.active; })[0];
    lineReply_(ev.replyToken, [helpMsg_('ยินดีต้อนรับสู่ระบบแจ้งเตือน อวช. ' + ORG + '\n\nวิธีเชื่อมต่อ: เปิดเว็บติดตามสถานะ → กด "เชื่อมต่อ LINE" → รับรหัส 6 หลัก แล้วพิมพ์รหัสนั้นที่แชทนี้' + (back ? '\n\n(พิมพ์ "สถานะ" เพื่อดูสถานะล่าสุด)' : ''))]);
    return;
  }
  if (ev.type !== 'message' || !ev.message || ev.message.type !== 'text') {
    if (ev.type === 'message') lineReply_(ev.replyToken, [helpMsg_('ระบบรับเฉพาะข้อความตัวอักษร พิมพ์ "ช่วยเหลือ" เพื่อดูคำสั่ง')]);
    return;
  }
  var t = str_(ev.message.text).replace(/\s+/g, ' '), cid = mine ? mine.cid : '';
  lineLog_('', cid, 'inbound', '', t, null, 'received', '');
  if (/^\d{6}$/.test(t)) return lineConsume_(ev, uid, t);
  if (/^(สถานะ|status|ติดตาม|เช็คสถานะ)$/i.test(t)) {
    if (!cid) return lineReply_(ev.replyToken, [helpMsg_('ยังไม่ได้เชื่อมต่อบัญชี กรุณาเปิดเว็บ → ติดตามสถานะ → "เชื่อมต่อ LINE" เพื่อรับรหัส 6 หลัก')]);
    var items = subs_().filter(function (r) { return r.cid === cid; }).reverse().slice(0, 5);
    if (!items.length) return lineReply_(ev.replyToken, [helpMsg_('ยังไม่พบรายการยื่นผลงานของท่าน')]);
    var m = items.map(function (it) { return flexStatus_(it, 'สถานะผลงานของท่าน'); });
    lineLog_(items[0].id, cid, 'bot', '', 'ตอบสถานะ ' + items.length + ' รายการ', null, 'sent', '');
    return lineReply_(ev.replyToken, m);
  }
  if (/^(ยกเลิกการผูก|ยกเลิก|unlink)$/i.test(t)) {
    if (!cid) return lineReply_(ev.replyToken, [helpMsg_('บัญชี LINE นี้ยังไม่ได้เชื่อมต่อ')]);
    unlinkLine_(cid, uid); lineLog_('', cid, 'link', '', 'ผู้ใช้ยกเลิกการผูกเอง', null, 'info', '');
    return lineReply_(ev.replyToken, [{ type: 'text', text: 'ยกเลิกการเชื่อมต่อแล้ว จะไม่ได้รับแจ้งเตือนอีก หากต้องการกลับมาใช้ ให้เชื่อมต่อใหม่จากหน้าเว็บ' }]);
  }
  lineReply_(ev.replyToken, [helpMsg_(cid ? 'คำสั่งที่ใช้ได้:\n• สถานะ — ดูสถานะผลงานล่าสุด\n• ยกเลิกการผูก — หยุดรับแจ้งเตือน' : 'ยังไม่ได้เชื่อมต่อบัญชี กรุณาเปิดเว็บ → ติดตามสถานะ → "เชื่อมต่อ LINE" แล้วพิมพ์รหัส 6 หลักที่ได้รับที่นี่')]);
}
function lineConsume_(ev, uid, code) {
  var c = CacheService.getScriptCache();
  if (!rateOk_('la_' + uid, 6, 600)) return lineReply_(ev.replyToken, [{ type: 'text', text: 'พิมพ์รหัสผิดหลายครั้ง กรุณารอ 10 นาทีแล้วลองใหม่' }]);
  var cid = c.get('lc_' + code);
  if (!cid) return lineReply_(ev.replyToken, [helpMsg_('รหัสไม่ถูกต้องหรือหมดอายุ (รหัสใช้ได้ 10 นาที) กรุณากดขอรหัสใหม่ที่หน้าเว็บ')]);
  linkLine_(cid, uid, lineProfile_(uid), 'code');
  c.remove('lc_' + code); c.put('lk_' + code, '1', 600);
  lineLog_('', cid, 'link', '', 'ผูกบัญชี LINE สำเร็จ (ผ่านรหัส)', null, 'success', '');
  log_('line_link', '', 'success', 'cid …' + cid.slice(-4));
  lineReply_(ev.replyToken, [helpMsg_('เชื่อมต่อสำเร็จ ✅\nต่อไปนี้ท่านจะได้รับแจ้งเตือนเมื่อสถานะผลงาน อวช. เปลี่ยน\nพิมพ์ "สถานะ" เพื่อดูสถานะล่าสุดได้ทุกเมื่อ')]);
}

/* ======================================================================
 *  Public API
 * ====================================================================== */
function apiConfig_() {
  return { org: ORG, title: TITLE, stages: STAGES, recaptcha: prop_('RECAPTCHA_SITE_KEY'), line: { enabled: lineEnabled_(), oaLink: lineOaLink_(), oaId: prop_('LINE_OA_ID') } };
}
/* ติดตามสถานะ: เข้าได้ทุกคนที่มีเลขบัตรประชาชนอยู่ในระบบ (allstaff หรือเคยยื่นเอกสาร) */
function apiTrack_(cidRaw, rc) {
  var cid = digits_(cidRaw);
  if (cid.length !== 13) throw new Error('กรุณากรอกเลขบัตรประชาชน 13 หลัก');
  verifyRc_(rc);
  var mine = subs_().filter(function (r) { return r.cid === cid; });
  var staff = staffByCid_(cid);
  if (!mine.length && !staff) { log_('track', '', 'not_found', ''); throw new Error('ไม่พบเลขบัตรประชาชนนี้ในระบบ'); }
  var his = sheet_('HIS'), hv = his.getLastRow() > 1 ? his.getRange(2, 1, his.getLastRow() - 1, 5).getValues() : [];
  var items = mine.map(function (r) {
    return {
      id: r.id, ts: r.ts, title: r.title, position: r.position, group: r.group, posNo: r.posNo, tenure: r.tenure, edu: r.edu, hasFile: !!r.link,
      status: r.status, note: r.note, upd: r.upd,
      history: hv.filter(function (h) { return str_(h[0]) === r.id; }).map(function (h) { return { t: str_(h[1]), s: str_(h[2]), n: str_(h[3]), by: str_(h[4]) }; })
    };
  }).reverse();
  var notes = lnlRows_().filter(function (n) { return n.cid === cid && OUT_TYPES.indexOf(n.type) > -1 && n.res !== 'skipped' && n.res !== 'no_line'; })
    .map(function (n) { return { t: n.t, id: n.id, type: n.type, m: n.m, fn: n.fn, fu: n.fu, ok: n.res === 'sent' }; }).reverse().slice(0, 40);
  var p = staff || mine[mine.length - 1] || {};
  log_('track', '', 'success', items.length + ' รายการ');
  return {
    name: (p.prefix || '') + (p.first || '') + ' ' + (p.last || ''), position: p.position || '', group: p.group || '',
    items: items, notes: notes, nowMs: Date.now(),
    line: { enabled: lineEnabled_(), linked: lineUsersByCid_(cid).length > 0, oaLink: lineOaLink_() }
  };
}
function apiLookup_(cidRaw) {
  var cid = digits_(cidRaw);
  if (!validCid_(cid)) throw new Error('เลขบัตรประชาชนไม่ถูกต้อง');
  var s = staffByCid_(cid);
  return { found: !!s, staff: s };
}
function apiSubmit_(p, rc) {
  p = p || {};
  verifyRc_(rc);
  var f = {};
  ['prefix', 'first', 'last', 'position', 'group', 'posNo', 'start', 'edu', 'title', 'link', 'phone', 'email'].forEach(function (k) { f[k] = str_(p[k]); });
  f.cid = digits_(p.cid);
  ['prefix', 'first', 'last', 'position', 'group', 'edu', 'title'].forEach(function (k) { if (!f[k]) throw new Error('กรุณากรอกข้อมูลให้ครบถ้วน'); });
  if (!validCid_(f.cid)) throw new Error('เลขบัตรประชาชนไม่ถูกต้อง');
  if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) throw new Error('รูปแบบอีเมลไม่ถูกต้อง');
  if (f.link && !/^https?:\/\//i.test(f.link)) throw new Error('ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://');
  if (!(p.file && p.file.data) && !f.link) throw new Error('กรุณาแนบไฟล์หรือใส่ลิงก์ผลงาน');
  var up = (p.file && p.file.data) ? saveUpload_(p.file, SUBMIT_EXT, false) : null;   // ตรวจไฟล์ก่อนเข้าล็อก
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  var id, it;
  try {
    if (up) f.link = up.url;
    var sh = sheet_('SUB'), n = sh.getLastRow(); var taken = {}; subs_().forEach(function (r) { taken[r.id] = 1; }); var day = Utilities.formatDate(new Date(), TZ, 'yyyyMMdd'); do { id = 'AWC-' + day + '-' + ('000' + n).slice(-4); n++; } while (taken[id]);   // กัน รหัสซ้ำเมื่อมีการลบแถว
    var t = now_();
    sh.appendRow([id, t, f.prefix, f.first, f.last, f.cid, f.position, f.group, f.posNo, f.start, tenure_(f.start), f.edu, f.title, f.link, f.phone, f.email, 'submitted', '', t]);
    sheet_('HIS').appendRow([id, t, 'submitted', 'ยื่นเอกสาร', f.first + ' ' + f.last]);
    it = { id: id, cid: f.cid, email: f.email, title: f.title, status: 'submitted', note: '' };
    notify_(it, 'ระบบได้รับเอกสารผลงานของท่านแล้ว รหัส ' + id);
    log_('submit', f.first, 'success', id);
  } finally { lock.releaseLock(); }
  var line = autoNotify_(it, f.first + ' ' + f.last, 'ยื่นเอกสารแล้ว', null);
  return { id: id, line: { sent: line.sent || 0 } };
}

/* ---------- Auth ---------- */
function apiLogin_(username, password, rc) {
  var u = str_(username), pw = String(password || '');
  try { verifyRc_(rc); } catch (e) { log_('login', u, 'fail_recaptcha', ''); throw e; }
  if (!rateOk_('lg_' + u.toLowerCase(), 10, 900)) throw new Error('พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอ 15 นาที');
  var sess = null, boot = prop_('ADMIN_PASSWORD');
  var s = sheet_('USR'), n = s.getLastRow(), v = n > 1 ? s.getRange(2, 1, n - 1, 6).getValues() : [];
  for (var i = 0; i < v.length; i++) if (str_(v[i][0]) === u && str_(v[i][5]) !== 'N' && hash_(str_(v[i][3]), pw) === str_(v[i][4])) sess = { u: u, n: str_(v[i][1]), r: str_(v[i][2]) };
  if (!sess && u === 'admin' && boot && pw === boot) sess = { u: 'admin', n: 'ผู้ดูแลระบบ', r: 'admin' };
  if (!sess) { log_('login', u, 'fail_password', ''); throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'); }
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put('s_' + token, JSON.stringify(sess), SESSION_TTL);
  log_('login', u, 'success', '');
  return { token: token, user: sess };
}
function apiLogout_(token) { if (token) CacheService.getScriptCache().remove('s_' + token); return {}; }
function apiVerify_(token) { return { user: auth_(token) }; }

/* ---------- Admin: ข้อมูล ---------- */
function apiAdminList_(token) {
  auth_(token);
  var rows = subs_().reverse(), counts = {}, linked = {};
  lnuRows_().forEach(function (r) { if (r.active) linked[r.cid] = 1; });
  rows.forEach(function (r) { counts[r.status] = (counts[r.status] || 0) + 1; r.lk = !!linked[r.cid]; });
  return { rows: rows, counts: counts, total: rows.length, lineEnabled: lineEnabled_() };
}
/* บันทึกสถานะ/ข้อมูล — ประวัติสถานะ (HIS) เป็นแหล่งข้อมูลเดียวกับหน้าติดตามของผู้ยื่น และส่ง LINE อัตโนมัติ (แนบไฟล์ได้) */
function apiAdminSave_(token, id, f) {
  var u = auth_(token);
  f = f || {};
  if (f.status !== undefined && !stageOk_(f.status)) throw new Error('สถานะไม่ถูกต้อง');
  if (f.cid !== undefined) { f.cid = digits_(f.cid); if (!validCid_(f.cid)) throw new Error('เลขบัตรประชาชนไม่ถูกต้อง'); }
  var hasFile = !!(f.attach && f.attach.data);
  var up = hasFile ? saveUpload_(f.attach, LINE_EXT, true) : null;
  var lock = LockService.getScriptLock(), cur, changed = [];
  lock.waitLock(15000);
  try {
    cur = findSub_(id);
    if (!cur) throw new Error('ไม่พบรายการ');
    var sh = sheet_('SUB');
    EDITABLE.forEach(function (k) {
      if (f[k] === undefined) return;
      var val = str_(f[k]);
      if (val === cur[k]) return;
      sh.getRange(cur.row, KEYS.indexOf(k) + 1).setValue(val); cur[k] = val; changed.push(k);
    });
    if (changed.indexOf('start') > -1) { cur.tenure = tenure_(cur.start); sh.getRange(cur.row, KEYS.indexOf('tenure') + 1).setValue(cur.tenure); }
    if (changed.length) {
      sh.getRange(cur.row, KEYS.indexOf('upd') + 1).setValue(now_());
      if (changed.indexOf('status') > -1 || changed.indexOf('note') > -1) {
        sheet_('HIS').appendRow([id, now_(), cur.status, cur.note, u.n]);
        notify_(cur, 'สถานะผลงาน ' + id + ' เปลี่ยนเป็น "' + stageName_(cur.status) + '"' + (cur.note ? ' — ' + cur.note : ''));
      }
      log_('admin_save', u.u, 'success', id + ': ' + changed.join(','));
    }
  } finally { lock.releaseLock(); }
  var line = null, trig = changed.indexOf('status') > -1 || changed.indexOf('note') > -1 || hasFile;
  if (trig && f.sendLine !== false) line = autoNotify_(cur, u.n, (changed.indexOf('status') > -1 || changed.indexOf('note') > -1) ? 'สถานะเปลี่ยนเป็น' : 'ไฟล์แนบจากเจ้าหน้าที่ สถานะปัจจุบัน', up);
  return { changed: changed, line: line, file: up ? { name: up.name, url: up.url } : null };
}
function apiAdminDelete_(token, id) {
  var u = auth_(token, true), cur = findSub_(id);
  if (!cur) throw new Error('ไม่พบรายการ');
  sheet_('SUB').deleteRow(cur.row);
  log_('admin_delete', u.u, 'success', id);
  return {};
}

/* ---------- Admin: ผู้ใช้ / ประวัติการใช้งาน ---------- */
function apiUsersList_(token) {
  auth_(token, true);
  var s = sheet_('USR'), n = s.getLastRow(), v = n > 1 ? s.getRange(2, 1, n - 1, 6).getValues() : [];
  return { users: v.map(function (r) { return { username: str_(r[0]), name: str_(r[1]), role: str_(r[2]), active: str_(r[5]) !== 'N' }; }) };
}
function apiUserAdd_(token, p) {
  var u = auth_(token, true);
  var un = str_(p.username), pw = String(p.password || ''), role = p.role === 'admin' ? 'admin' : 'officer';
  if (!/^[A-Za-z0-9_.-]{3,30}$/.test(un) || un === 'admin') throw new Error('ชื่อผู้ใช้ต้องเป็นอังกฤษ/ตัวเลข 3-30 ตัว และห้ามใช้คำว่า admin');
  if (pw.length < 8) throw new Error('รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร');
  if (!str_(p.name)) throw new Error('กรุณากรอกชื่อ-สกุล');
  var s = sheet_('USR'), n = s.getLastRow(), v = n > 1 ? s.getRange(2, 1, n - 1, 1).getValues() : [];
  if (v.some(function (r) { return str_(r[0]) === un; })) throw new Error('มีชื่อผู้ใช้นี้แล้ว');
  var salt = Utilities.getUuid();
  s.appendRow([un, str_(p.name), role, salt, hash_(salt, pw), 'Y']);
  log_('admin_user_add', u.u, 'success', un + ' (' + role + ')');
  return {};
}
function apiUserToggle_(token, username) {
  var u = auth_(token, true), s = sheet_('USR'), n = s.getLastRow();
  var v = n > 1 ? s.getRange(2, 1, n - 1, 6).getValues() : [];
  for (var i = 0; i < v.length; i++) if (str_(v[i][0]) === username) {
    var on = str_(v[i][5]) !== 'N';
    s.getRange(i + 2, 6).setValue(on ? 'N' : 'Y');
    log_('admin_user_toggle', u.u, 'success', username + (on ? ' ปิดใช้งาน' : ' เปิดใช้งาน'));
    return {};
  }
  throw new Error('ไม่พบผู้ใช้');
}
function apiLogList_(token) {
  auth_(token, true);
  var s = sheet_('LOG'), n = s.getLastRow();
  if (n < 2) return { rows: [] };
  var from = Math.max(2, n - 199);
  return { rows: s.getRange(from, 1, n - from + 1, 5).getValues().map(function (r) { return r.map(str_); }).reverse() };
}

/* ======================================================================
 *  LINE: ผู้ยื่น (สาธารณะ) — ขอรหัสผูกบัญชี
 * ====================================================================== */
function phonesOf_(cid) {
  var out = [], st = staffByCid_(cid);
  if (st && digits_(st.phone).length >= 4) out.push(digits_(st.phone));
  subs_().forEach(function (r) { if (r.cid === cid && digits_(r.phone).length >= 4) out.push(digits_(r.phone)); });
  return out;
}
/* ยืนยันตัวตน 2 ปัจจัย: เลขบัตร + เลข 4 ตัวท้ายของเบอร์โทรที่มีในระบบ (ป้องกันผู้อื่นผูก LINE แทนเจ้าของ) */
function apiLineLinkReq_(cidRaw, last4) {
  if (!lineEnabled_()) throw new Error('ระบบ LINE ยังไม่เปิดใช้งาน กรุณาติดต่อ HR');
  var cid = digits_(cidRaw), l4 = digits_(last4);
  if (cid.length !== 13 || l4.length !== 4) throw new Error('กรุณากรอกเลขบัตร 13 หลัก และเลขท้ายเบอร์โทร 4 หลัก');
  if (!rateOk_('lr_' + cid, 5, 900)) throw new Error('ขอรหัสบ่อยเกินไป กรุณารอ 15 นาที');
  var known = !!staffByCid_(cid) || subs_().some(function (r) { return r.cid === cid; });
  var ph = phonesOf_(cid);
  if (!known || !ph.some(function (p) { return p.slice(-4) === l4; })) {
    log_('line_linkreq', '', 'fail', 'cid …' + cid.slice(-4));
    throw new Error(known && !ph.length ? 'ยังไม่มีเบอร์โทรของท่านในระบบ กรุณาติดต่อ HR เพื่อผูกบัญชี LINE' : 'ข้อมูลไม่ตรงกับในระบบ กรุณาตรวจสอบเลขบัตรและเลขท้ายเบอร์โทร');
  }
  var c = CacheService.getScriptCache(), code = '';
  for (var i = 0; i < 8; i++) { code = ('00000' + Math.floor(Math.random() * 1000000)).slice(-6); if (!c.get('lc_' + code)) break; }
  c.put('lc_' + code, cid, 600);
  log_('line_linkreq', '', 'success', 'cid …' + cid.slice(-4));
  return { code: code, ttl: 600, oaLink: lineOaLink_(), oaId: prop_('LINE_OA_ID') };
}
function apiLineLinkCheck_(code) {
  code = digits_(code);
  if (code.length !== 6) return { state: 'invalid' };
  var c = CacheService.getScriptCache();
  if (c.get('lk_' + code)) return { state: 'linked' };
  return { state: c.get('lc_' + code) ? 'pending' : 'expired' };
}

/* ======================================================================
 *  LINE: เจ้าหน้าที่ HR
 * ====================================================================== */
/* ข้อมูล LINE ของรายการเดียว: ผู้รับ + ประวัติการแจ้งเตือน/การกดทั้งหมด */
function apiLineInfo_(token, id) {
  auth_(token);
  var cur = findSub_(id);
  if (!cur) throw new Error('ไม่พบรายการ');
  var users = lnuRows_().filter(function (r) { return r.cid === cur.cid && r.active; });
  var log = lnlRows_().filter(function (r) { return r.id === id || (!r.id && r.cid === cur.cid); }).reverse().slice(0, 40);
  return { enabled: lineEnabled_(), linked: users.length, names: users.map(function (r) { return r.name || 'LINE'; }), log: log, status: cur.status, note: cur.note, title: cur.title };
}
/* กดแจ้งเตือน: mode=status (ส่งการ์ดสถานะปัจจุบัน) | text (ข้อความที่พิมพ์/สำเร็จรูป) + แนบไฟล์ได้ */
function apiLineSend_(token, id, p) {
  var u = auth_(token); p = p || {};
  var cur = findSub_(id);
  if (!cur) throw new Error('ไม่พบรายการ');
  var type = p.kind === 'manual' ? 'manual' : 'typed', mode = p.mode === 'status' ? 'status' : 'text', text = str_(p.text);
  if (mode === 'text') { if (!text) throw new Error('กรุณาพิมพ์ข้อความ'); if (text.length > 1000) throw new Error('ข้อความยาวเกิน 1,000 ตัวอักษร'); }
  else { type = 'manual'; text = 'ส่งสถานะปัจจุบัน: ' + stageName_(cur.status); }
  if (!rateOk_('ls_' + id, 10, 3600)) throw new Error('ส่งแจ้งเตือนรายการนี้ครบ 10 ครั้ง/ชั่วโมงแล้ว กรุณารอสักครู่');
  if (!rateOk_('ld_' + id + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text + (p.file && p.file.name || ''))).slice(0, 10), 1, 15)) throw new Error('ข้อความเดียวกันเพิ่งถูกส่งไป กรุณารอสักครู่');
  var pre = linePre_(cur.cid, id, type, u.n, text);
  if (!pre.ok) throw new Error(pre.msg);
  var up = (p.file && p.file.data) ? saveUpload_(p.file, LINE_EXT, true) : null;
  var msgs = [mode === 'status' ? flexStatus_(cur, 'แจ้งสถานะปัจจุบัน') : flexText_(cur, text)];
  if (up) msgs.push(flexFile_(up));
  var r = lineSend_(pre.users, cur.cid, id, type, u.n, msgs, text, up);
  log_('line_send', u.u, r.sent ? 'success' : 'fail', id + ' ' + type + (up ? ' +file' : ''));
  if (!r.sent) throw new Error('ส่งไม่สำเร็จ: ' + (r.errors[0] || 'ไม่ทราบสาเหตุ'));
  return { sent: r.sent, failed: r.failed, file: up ? { name: up.name, shared: up.shared } : null };
}
/* ภาพรวม LINE (ผู้ดูแลระบบ): ผู้ใช้ที่ผูกแล้ว + ประวัติการแจ้งเตือนทั้งหมด */
function apiLineAdmin_(token) {
  auth_(token, true);
  var users = lnuRows_().reverse().map(function (r) { return { cid: r.cid, uid: r.uid, name: r.name, at: r.at, via: r.via, active: r.active }; });
  return { enabled: lineEnabled_(), users: users, log: lnlRows_(500).reverse() };
}
function apiLineCheck_(token) {
  auth_(token, true);
  var out = { token: false, bot: null, error: '', webhookUrl: '', siteUrl: siteUrl_(), oaId: prop_('LINE_OA_ID') };
  try { out.webhookUrl = ScriptApp.getService().getUrl() + '?k=' + webhookKey_(); } catch (e) {}
  if (!lineEnabled_()) { out.error = 'ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN ใน Script Properties'; return out; }
  var r = lineCall_('get', '/v2/bot/info');
  if (r.ok) { out.token = true; out.bot = { name: str_(r.data.displayName), id: str_(r.data.basicId) }; } else out.error = r.err;
  return out;
}
function apiLineUnlink_(token, cid, uid) {
  var u = auth_(token, true), n = unlinkLine_(digits_(cid), str_(uid));
  lineLog_('', digits_(cid), 'link', u.n, 'ผู้ดูแลยกเลิกการผูก', null, 'info', '');
  log_('line_unlink', u.u, 'success', 'cid …' + digits_(cid).slice(-4));
  return { n: n };
}
function apiLineAdd_(token, cid, uid) {
  var u = auth_(token, true); cid = digits_(cid); uid = str_(uid);
  if (!/^U[0-9a-f]{32}$/i.test(uid)) throw new Error('LINE userId ต้องขึ้นต้นด้วย U ตามด้วยตัวอักษร 32 ตัว');
  if (!validCid_(cid) || !(staffByCid_(cid) || subs_().some(function (r) { return r.cid === cid; }))) throw new Error('ไม่พบเลขบัตรนี้ในระบบ');
  linkLine_(cid, uid, lineProfile_(uid), 'admin:' + u.u);
  lineLog_('', cid, 'link', u.n, 'ผู้ดูแลผูกบัญชีให้', null, 'success', '');
  log_('line_add', u.u, 'success', 'cid …' + cid.slice(-4));
  return {};
}

/* ======================================================================
 *  ติดตั้ง (รันจากตัวแก้ไข Apps Script ครั้งแรก)
 * ====================================================================== */
/** 1) กดรันเพื่ออนุญาตสิทธิ์ + สร้างแท็บทั้งหมด */
function setup() {
  ['SUB', 'HIS', 'USR', 'NOT', 'LOG', 'LNU', 'LNL'].forEach(sheet_);
  DriveApp.getRootFolder(); MailApp.getRemainingDailyQuota(); UrlFetchApp.fetch('https://api.line.me/', { muteHttpExceptions: true });
  Logger.log('พร้อมใช้งาน — สร้างแท็บเรียบร้อย');
}
/** 2) กดรันเพื่อสร้างรหัสลับ และดู Webhook URL สำหรับวางใน LINE Developers (Messaging API > Webhook URL) */
function setupLine() {
  var url = ScriptApp.getService().getUrl() + '?k=' + webhookKey_();
  Logger.log('Webhook URL: ' + url);
  Logger.log('ถ้า URL ขึ้นต้น /a/macros/โดเมน/ แล้ว LINE Verify ไม่ผ่าน ให้ใช้รูปแบบ https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?k=... แทน');
  return url;
}
