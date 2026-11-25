/**
 * Line.gs — ระบบ LINE ทั้งหมดของ อวช. รวมไว้ไฟล์เดียว (webhook · ตัวจัดคำสั่ง · ตอบกลับ · ผูกบัญชี · การ์ด · แจ้งเตือน · เครื่องมือผู้ดูแล · ตรวจ/ติดตั้ง)
 * วางเป็นไฟล์ Line.gs คู่กับ Code.gs และ Fte.gs ในโปรเจกต์ Apps Script เดียวกัน (ไม่มีการเปลี่ยนชื่อฟังก์ชันที่ Code.gs เรียกใช้)
 * เส้นทาง: LINE → Vercel /api/line (ตรวจลายเซ็น) → doPost ใน Code.gs → lineWebhook_ → lineEvent_ → lineEventCore_ → lineReply_ → LINE
 * Script Properties ที่ใช้: LINE_CHANNEL_ACCESS_TOKEN · LINE_WEBHOOK_KEY · LINE_OA_ID · SITE_URL · MANUAL_URL · LINE_BIND_MODE
 */
/* ======================================================================
 *  LINE Messaging API
 * ====================================================================== */
function lineEnabled_() { return !!prop_('LINE_CHANNEL_ACCESS_TOKEN'); }
function lineOaLink_() { var o = prop_('LINE_OA_ID'); return o ? 'https://line.me/R/ti/p/' + encodeURIComponent(o) : ''; }
var SITE_DEFAULT = 'https://hrsansaihospital.vercel.app/';
function siteUrl_() { var u = prop_('SITE_URL'); return /^https:\/\//i.test(u) ? u : SITE_DEFAULT; }
function lineCall_(method, path, body, retryKey) {
  var h = { Authorization: 'Bearer ' + prop_('LINE_CHANNEL_ACCESS_TOKEN') };
  if (retryKey) h['X-Line-Retry-Key'] = retryKey;
  var o = { method: method, headers: h, muteHttpExceptions: true };
  if (body) { o.contentType = 'application/json'; o.payload = JSON.stringify(body); }
  var r, code, txt, j = {};
  try { r = UrlFetchApp.fetch('https://api.line.me' + path, o); code = r.getResponseCode(); txt = r.getContentText(); }
  catch (fe) { return { ok: false, status: 0, err: ('เชื่อมต่อ LINE ไม่ได้: ' + String(fe.message || fe)).slice(0, 200), data: {} }; }   // เดิม throw ทำให้ทั้งเหตุการณ์ล้มและผู้ใช้ไม่ได้รับคำตอบ
  try { j = JSON.parse(txt || '{}'); } catch (e) {}
  var err = '';
  if (code < 200 || code > 299) {
    err = (j.message || txt || ('HTTP ' + code)).slice(0, 200);
    if (code === 401) err = 'Channel access token ไม่ถูกต้องหรือหมดอายุ';
    else if (code === 429) err = 'เกินโควตาข้อความ LINE ของเดือนนี้/ส่งถี่เกินไป';
    else if (code === 400 && /friend|block|not\s*a\s*friend/i.test(err)) err = 'ผู้รับยังไม่ได้เพิ่มเพื่อน หรือบล็อกบัญชี LINE OA';
    else if (code === 400 && j.details && j.details.length) err = (err + ' ' + JSON.stringify(j.details)).slice(0, 300);   // บอกว่าข้อความ/การ์ดผิดตรงไหน
  }
  return { ok: !err, status: code, err: err, data: j };
}
function linePush_(uid, messages) {
  var key = Utilities.getUuid(), r = lineCall_('post', '/v2/bot/message/push', { to: uid, messages: messages }, key);
  if (!r.ok && (r.status === 0 || r.status >= 500)) { Utilities.sleep(800); r = lineCall_('post', '/v2/bot/message/push', { to: uid, messages: messages }, key); }   // ลองซ้ำ 1 ครั้ง (Retry-Key เดียวกัน LINE ไม่ส่งซ้ำ)
  return r;
}
/* ===== คู่มือเชื่อมต่อ LINE: ส่งอัตโนมัติ 3 กรณี =====
 *  1) เพิ่มเพื่อนครั้งแรก (follow)                      → แนบคู่มือพร้อมข้อความต้อนรับ
 *  2) ผู้ใช้พิมพ์ "ช่วยเหลือ" / "คู่มือ" / help           → ส่งคำสั่งที่ใช้ได้ + คู่มือ
 *  3) บัญชีที่ยังไม่เชื่อมต่อ ส่งข้อความมาแล้วยังไม่สำเร็จ ครบ NOLINK_MANUAL_AT ครั้ง → แนบคู่มือท้ายข้อความตอบกลับ
 *     (นับเป็นรายบัญชี LINE · ไม่ส่งซ้ำภายใน NOLINK_MANUAL_COOLDOWN วินาที · เชื่อมต่อสำเร็จแล้วรีเซ็ตตัวนับ)
 *  ตั้ง Script Property MANUAL_URL เพื่อเปลี่ยนลิงก์คู่มือ (ค่าเริ่มต้น = SITE_URL + /manual/line.html) */
var NOLINK_MANUAL_AT = 2;
var NOLINK_MANUAL_COOLDOWN = 21600;   // วินาที (CacheService เก็บได้สูงสุด 6 ชม.)
var NUDGE_UID_ = '';                   // uid ที่ต้องแนบคู่มือในการตอบกลับครั้งนี้ (ตั้งใน lineEvent_)
function manualUrl_() { return prop_('MANUAL_URL') || (siteUrl_().replace(/\/+$/, '') + '/manual/line.html'); }
function manualMsg_(lead) {   // lead (ไม่บังคับ) = ข้อความนำสั้น ๆ เหนือรายละเอียด ใช้ตอนส่งแบบ push เพื่อให้ได้ครบในข้อความเดียว (ประหยัดโควตา)
  var u = manualUrl_(), body = [
    { type: 'text', text: '📖 คู่มือเชื่อมต่อ LINE', weight: 'bold', size: 'md', color: '#0b5a54' },
    { type: 'text', text: 'ภาพประกอบชี้ทุกขั้นตอน อ่านไม่ถึง 1 นาที\nวิธี ก: พิมพ์เลขบัตร 13 หลักในแชท\nวิธี ข: รับรหัส 6 หลักที่เว็บ', wrap: true, size: 'sm', color: '#51676f' }];
  if (lead) body.splice(1, 0, { type: 'text', text: lead, wrap: true, size: 'sm', color: '#1f2d33' });
  return { type: 'flex', altText: 'คู่มือเชื่อมต่อ LINE (ภาพประกอบ): ' + u, contents: { type: 'bubble', size: 'kilo',
    body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: body },
    footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#0f766e', height: 'sm', action: { type: 'uri', label: 'เปิดอ่านคู่มือ', uri: u } }] } } };
}
function noLinkTick_(uid) {           // นับครั้งที่บัญชีที่ยังไม่เชื่อมต่อส่งข้อความมา
  try {
    var c = CacheService.getScriptCache(), n = (parseInt(c.get('nl_' + uid), 10) || 0) + 1;
    c.put('nl_' + uid, String(n), 21600);
    if (n >= NOLINK_MANUAL_AT && !c.get('nm_' + uid)) NUDGE_UID_ = uid;
  } catch (e) {}
}
function withManual_(messages) {      // แนบคู่มือท้ายข้อความ ถ้าเข้าเงื่อนไข (เชื่อมต่อสำเร็จ = ไม่แนบ + รีเซ็ตตัวนับ)
  if (!NUDGE_UID_) return messages;
  var uid = NUDGE_UID_, j = JSON.stringify(messages);
  try {
    var c = CacheService.getScriptCache();
    if (j.indexOf('เชื่อมต่อสำเร็จ') >= 0) { c.remove('nl_' + uid); NUDGE_UID_ = ''; return messages; }
    if (j.indexOf('/manual/line') >= 0 || messages.length >= 5) { NUDGE_UID_ = ''; return messages; }
    c.put('nm_' + uid, '1', NOLINK_MANUAL_COOLDOWN); c.remove('nl_' + uid);
  } catch (e) {}
  NUDGE_UID_ = '';
  return messages.concat([manualMsg_()]);
}
/* ===== ตอบกลับผู้ใช้ (reply) พร้อมระบบสำรอง — แก้ปัญหา "กดริชเมนูแล้วเงียบ" =====
 *  1) reply ปกติ  2) ถ้า replyToken หมดอายุ/ไม่มี → push ข้อความเดิมถึง userId  3) ถ้าการ์ด (Flex) ถูก LINE ปฏิเสธ → ส่งเป็นข้อความธรรมดาแทน
 *  ทุกกรณีที่ล้มเหลวบันทึกใน ActivityLog (action = line_reply) พร้อมสาเหตุจาก LINE */
var CUR_UID_ = '';        // LINE userId ของเหตุการณ์ที่กำลังประมวลผล (ใช้ push สำรอง)
var REPLIED_ = false;     // เหตุการณ์นี้ตอบผู้ใช้สำเร็จแล้วหรือยัง
var TESTCAP_ = null;      // ไม่ใช่ null = แท็บ "ทดสอบ LINE" กำลังเก็บผลการส่งแต่ละขั้น
function cap_(via, r) { if (TESTCAP_) TESTCAP_.push({ via: via, ok: !!r.ok, status: r.status || 0, err: r.err || '' }); }
function msgsPlain_(messages) {
  return (messages || []).map(function (m) { return m && m.type === 'text' ? m.text : ((m && m.altText) || ''); }).filter(String).join('\n\n').slice(0, 4800);
}
function lineReply_(token, messages) {
  messages = withManual_(messages).slice(0, 5);
  if (token && /^0+$/.test(token)) return;                              // เหตุการณ์ทดสอบของ LINE Verify
  var uid = CUR_UID_, r = null;
  if (token) { r = lineCall_('post', '/v2/bot/message/reply', { replyToken: token, messages: messages }); cap_('reply', r); if (r.ok) { REPLIED_ = true; return; } }
  var why = r ? (r.err || ('HTTP ' + r.status)) : 'ไม่มี replyToken';
  if (!uid) { log_('line_reply', '', 'fail', String(why).slice(0, 150)); return; }
  var plain = [{ type: 'text', text: msgsPlain_(messages) || 'ขออภัย ระบบแสดงข้อความไม่สำเร็จ กรุณาพิมพ์ "สถานะ" อีกครั้ง' }];
  var tokenBad = !r || /reply token/i.test(r.err || ''), ok = false, r2;
  if (tokenBad) { r2 = linePush_(uid, messages); cap_('push', r2); ok = r2.ok; }
  else { r2 = lineCall_('post', '/v2/bot/message/reply', { replyToken: token, messages: plain }); cap_('reply (ข้อความธรรมดา)', r2); ok = r2.ok; }
  if (!ok) { r2 = linePush_(uid, plain); cap_('push (ข้อความธรรมดา)', r2); ok = r2.ok; }
  if (ok) REPLIED_ = true;
  if (!TESTCAP_) log_('line_reply', '…' + uid.slice(-6), ok ? 'fallback_ok' : 'fallback_fail', (String(why) + (ok ? ' → ส่งสำรองสำเร็จ' : ' → ส่งสำรองไม่สำเร็จ: ' + (r2.err || ''))).slice(0, 250));
}
function lineProfile_(uid) { try { var r = lineCall_('get', '/v2/bot/profile/' + uid); return r.ok ? str_(r.data.displayName) : ''; } catch (e) { return ''; } }

/* --- Flex Message builders --- */
function tx_(s, n) { s = String(s == null ? '' : s).trim(); return s ? s.slice(0, n || 300) : '-'; }
/* ชื่อ-นามสกุลผู้ยื่น (คำนำหน้า+ชื่อ+นามสกุล) — แสดงคู่กับรหัสติดตามในการ์ด LINE */
function fullName_(it) { return ((it && it.prefix) || '') + ((it && it.first) || '') + ' ' + ((it && it.last) || ''); }
function idRows_(it) { var n = fullName_(it).trim(); return n ? [frow_('รหัสติดตาม', it.id), frow_('ผู้ยื่น', n)] : [frow_('รหัสติดตาม', it.id)]; }
function frow_(k, v) {
  return { type: 'box', layout: 'baseline', spacing: 'sm', margin: 'md', contents: [
    { type: 'text', text: k, color: '#51676f', size: 'sm', flex: 3 }, { type: 'text', text: tx_(v), wrap: true, size: 'sm', flex: 6 }] };
}
function logoUrl_() { var u = siteUrl_(); return u ? u.replace(/\/+$/, '') + '/assets/logo.png' : ''; }
function ffoot_(label) {
  var u = siteUrl_();
  return u ? { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#0f766e', height: 'sm', action: { type: 'uri', label: label || 'ดูความคืบหน้า', uri: u + '#track' } }] } : null;
}
function fbubble_(headText, color, body, footLabel) {
  var logo = logoUrl_();
  var title = { type: 'text', text: headText, color: '#ffffff', weight: 'bold', size: 'md', wrap: true, flex: 1, gravity: 'center' };
  var head = logo
    ? { type: 'box', layout: 'horizontal', spacing: 'md', alignItems: 'center', contents: [{ type: 'image', url: logo, size: '40px', aspectMode: 'cover', flex: 0 }, title] }
    : { type: 'box', layout: 'vertical', contents: [title] };
  var b = { type: 'bubble', size: 'mega',
    header: { type: 'box', layout: 'vertical', backgroundColor: color, paddingAll: '14px', contents: [head] },
    body: { type: 'box', layout: 'vertical', contents: body } };
  var f = ffoot_(footLabel); if (f) b.footer = f;
  return b;
}
function flexStatus_(it, head) {
  var st = stageObj_(it.status), col = { blue: '#1d4ed8', orange: '#d97706', green: '#15803d' }[st.c] || '#0f766e';
  var body = [
    { type: 'text', text: tx_(stageLabel_(it)), weight: 'bold', size: 'xl', wrap: true, color: col },
    { type: 'text', text: tx_(stDesc_(st, it)), size: 'sm', color: '#51676f', wrap: true, margin: 'sm' },
    { type: 'separator', margin: 'lg' }].concat(idRows_(it));
  if (it.title) body.push(frow_('ชื่อผลงาน', it.title));
  if (stRng_(st, it)) body.push(frow_('ระยะเวลาขั้นตอนนี้', stRng_(st, it)));
  if (it.note) body.push(frow_('หมายเหตุ', it.note));
  body.push(frow_('อัปเดตเมื่อ', thaiDT_()));
  return svWrap_(it, { type: 'flex', altText: ('อวช. ' + stageLabel_(it) + ' (' + it.id + (fullName_(it).trim() ? ' · ' + fullName_(it).trim() : '') + ')').slice(0, 380), contents: fbubble_(head || 'อัปเดตสถานะ อวช.', col, body) });
}
/* ระยะเวลาในขั้นตอนปัจจุบัน + วันคงเหลือของกำหนดส่งเล่ม 2 (180 วัน) — ใช้ในข้อความ "เช็คสถานะ" */
function stageClock_(it) {
  var st = stageObj_(it.status), cur = normKey_(it.status), mine = hisMine_(it.id, 3), firstSigned = '', k180 = start180Key_(it.track);
  mine.forEach(function (h) { if (h.s === k180 && !firstSigned) firstSigned = h.t; });
  function days_(s) { var d = new Date(String(s).replace(' ', 'T') + '+07:00'); return isNaN(d) ? null : Math.floor((Date.now() - d.getTime()) / 864e5); }
  /* นับจากวันที่เข้าขั้นตอนปัจจุบัน (ไม่ใช่วันที่ยื่น) */
  var inStage = days_(sinceOfCurrent_(mine, cur, it.upd || it.ts)), left = null;
  if (!st.end && (st.k === k180 || st.clk === k180) && firstSigned) { var e = days_(firstSigned); if (e !== null) left = 180 - e; }
  return { inStage: inStage, left: left };
}
/* ข้อความตอบเมื่อผู้ใช้กด "เช็คสถานะ" (Rich Menu): สถานะปัจจุบัน + รายละเอียดเบื้องต้น + ลิงก์ไปเว็บแอป */
function flexCheck_(it) {
  var st = stageObj_(it.status), col = { blue: '#1d4ed8', orange: '#d97706', green: '#15803d' }[st.c] || '#0f766e', c = stageClock_(it);
  var body = [
    { type: 'text', text: tx_(stageLabel_(it)), weight: 'bold', size: 'xl', wrap: true, color: col },
    { type: 'text', text: tx_(stDesc_(st, it)), size: 'sm', color: '#51676f', wrap: true, margin: 'sm' },
    { type: 'separator', margin: 'lg' }].concat(idRows_(it));
  if (it.title) body.push(frow_('ชื่อผลงาน', it.title));
  if (st.o) body.push(frow_('ผู้รับผิดชอบ', st.o));
  if (!st.end && c.inStage !== null) body.push(frow_('อยู่ในขั้นนี้ (นับจากวันเข้าขั้นตอน)', c.inStage + ' วัน'));
  if (stRng_(st, it)) body.push(frow_('ระยะเวลาขั้นตอนนี้', stRng_(st, it)));
  if (!st.end && st.sla && c.inStage !== null && c.inStage > st.sla && !(st.fix && !st.sla)) body.push(frow_('เทียบเกณฑ์', 'เกินเกณฑ์ ' + (c.inStage - st.sla) + ' วัน'));
  if (c.left !== null) body.push(frow_('กำหนดส่งเล่ม 2', c.left >= 0 ? 'ส่งภายใน 180 วัน (เหลือ ' + c.left + ' วัน)' : 'เกินกำหนด 180 วันแล้ว ' + (-c.left) + ' วัน'));
  if (it.note) body.push(frow_('หมายเหตุ', it.note));
  body.push(frow_('ข้อมูล ณ', thaiDT_()));
  body.push({ type: 'text', text: siteUrl_() ? 'ดูรายละเอียดครบถ้วนและประวัติทุกขั้นตอนได้ที่เว็บแอป (กดปุ่มด้านล่าง)' : 'กรุณาตรวจสอบรายละเอียดล่าสุดบนเว็บแอปติดตามสถานะ อวช.', size: 'xs', color: '#51676f', wrap: true, margin: 'lg' });
  return svWrap_(it, { type: 'flex', altText: ('เช็คสถานะ อวช. ' + stageLabel_(it) + ' (' + it.id + (fullName_(it).trim() ? ' · ' + fullName_(it).trim() : '') + ')').slice(0, 380), contents: fbubble_('แจ้งสถานะปัจจุบัน', col, body, 'ตรวจสอบบนเว็บแอป') });
}
function ms_(s) { var d = new Date(String(s || '').replace(' ', 'T') + '+07:00'); return isNaN(d) ? null : d.getTime(); }
function spanTh_(ms) {
  if (ms === null || ms === undefined || isNaN(ms)) return '-';
  var m = Math.max(0, Math.floor(ms / 6e4)); if (m < 1) return 'ไม่ถึง 1 นาที';
  var d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), n = m % 60;
  if (d) return d + ' วัน' + (h ? ' ' + h + ' ชั่วโมง' : '');
  if (h) return h + ' ชั่วโมง' + (n ? ' ' + n + ' นาที' : '');
  return n + ' นาที';
}
/* ระยะเวลารวมปัจจุบัน: เล่ม 1 (ยื่นเอกสาร→ผู้ว่าฯ ลงนามชี้ตัว) | ช่วงจัดทำเล่ม 2 (180 วัน) | เล่ม 2 (ยื่นเล่ม 2→ได้รับหนังสือแจ้งผล) | ออกคำสั่งเลื่อนระดับ (ได้รับผลเล่ม 2→ผู้ว่าฯ ลงนามคำสั่ง) | รวมตั้งแต่เริ่มต้น→ปัจจุบัน/ปิดเคส */
/* เวลาที่เข้าขั้นตอนแรกสุดของเล่มที่ระบุ (ไม่นับยกเลิก) ; ไม่มี = undefined */
function firstOfBook_(first, book) {
  var m;
  STAGES.forEach(function (x) { if (x.book === book && !x.cancel && first[x.k] !== undefined && (m === undefined || first[x.k] < m)) m = first[x.k]; });
  return m;
}
function durationInfo_(it) {
  var sh = sheet_('HIS'), hv = sh.getLastRow() > 1 ? V_(sh.getRange(2, 1, sh.getLastRow() - 1, 3)) : [], first = {}, firstAny = null, lastCx = null;
  hv.forEach(function (h) { if (str_(h[0]) !== it.id) return; var k = normKey_(str_(h[2])), t = ms_(str_(h[1])); if (t === null) return; if (k === 'cancelled') lastCx = t; if (firstAny === null || t < firstAny) firstAny = t; if (first[k] === undefined || t < first[k]) first[k] = t; });
  var now = Date.now(), sub = first.b1_submit !== undefined ? first.b1_submit : (ms_(it.ts) !== null ? ms_(it.ts) : firstAny);
  var o = { rows: [], total: null, totalLabel: '', closed: first.promoted !== undefined };
  if (sub === null || sub === undefined) return o;
  var b1End = first.b1_signed, b2Start = first.b2_submit, b2End = first.b2_signed !== undefined ? first.b2_signed : (b2Start !== undefined ? firstOfBook_(first, 3) : undefined), cmdEnd = first.cmd_gov_ok !== undefined ? first.cmd_gov_ok : first.promoted, closed = first.promoted;
  o.rows.push({ k: 'เล่ม 1 : ยื่นเอกสาร → ผู้ว่าราชการจังหวัดลงนามชี้ตัว', v: spanTh_((b1End !== undefined ? b1End : now) - sub), s: b1End !== undefined ? 'เสร็จสิ้นแล้ว' : 'กำลังดำเนินการ (นับถึงปัจจุบัน)', done: b1End !== undefined });
  if (b1End !== undefined) {
    var gStart = b1End, aEnd = first.b1_acting;
    if (gateOn_(it.track)) {
      /* เส้นทางชำนาญการ → ชำนาญการพิเศษ : ผวจ.ชี้ตัว → HR ออกคำสั่งรักษาการ (ยังไม่นับ 180 วัน) แล้วจึงเริ่มนับ 180 วันส่งเล่ม 2 ; ข้อมูลเก่าที่ยื่นเล่ม 2 แล้วโดยไม่มี b1_acting นับจาก ผวจ.ชี้ตัวเหมือนเดิม */
      if (aEnd !== undefined || b2Start === undefined) o.rows.push({ k: 'คำสั่งรักษาการในตำแหน่ง : ผู้ว่าฯ ชี้ตัว → HR ออกคำสั่งและอัปเดตสถานะ', v: spanTh_((aEnd !== undefined ? aEnd : now) - b1End), s: aEnd !== undefined ? 'เสร็จสิ้นแล้ว · เริ่มนับ 180 วันส่งเล่ม 2' : 'กำลังดำเนินการ (ยังไม่เริ่มนับ 180 วัน)', done: aEnd !== undefined });
      gStart = aEnd !== undefined ? aEnd : (b2Start !== undefined ? b1End : undefined);
    }
  }
  if (b1End !== undefined && gStart !== undefined) {
    var gapEnd = b2Start !== undefined ? b2Start : now, gd = Math.floor((gapEnd - gStart) / 864e5);
    o.rows.push({ k: 'ช่วงจัดทำเล่ม 2 : ' + (gateOn_(it.track) && aEnd !== undefined ? 'ออกคำสั่งรักษาการ' : 'อนุมัติเล่ม 1') + ' → ยื่นเล่ม 2', v: spanTh_(gapEnd - gStart), s: b2Start !== undefined ? 'ยื่นเล่ม 2 แล้ว' + (gd > 180 ? ' (เกินกำหนด 180 วัน)' : '') : (gd <= 180 ? 'ยังไม่ยื่นเล่ม 2 · เหลืออีก ' + (180 - gd) + ' วัน (กำหนด 180 วัน)' : 'ยังไม่ยื่นเล่ม 2 · เกินกำหนด 180 วันแล้ว ' + (gd - 180) + ' วัน'), done: b2Start !== undefined });
  }
  if (b2Start !== undefined) o.rows.push({ k: 'เล่ม 2 : ยื่นเอกสาร → ได้รับหนังสือแจ้งผลการพิจารณา', v: spanTh_((b2End !== undefined ? b2End : now) - b2Start), s: b2End !== undefined ? 'เสร็จสิ้นแล้ว' : 'กำลังดำเนินการ (นับถึงปัจจุบัน)', done: b2End !== undefined });
  if (b2End !== undefined) o.rows.push({ k: 'ออกคำสั่งเลื่อนระดับ : ได้รับผลเล่ม 2 → ผู้ว่าฯ ลงนามคำสั่ง', v: spanTh_((cmdEnd !== undefined ? cmdEnd : now) - b2End), s: cmdEnd !== undefined ? 'เสร็จสิ้นแล้ว' : 'กำลังดำเนินการ (นับถึงปัจจุบัน)', done: cmdEnd !== undefined });
  if (closed === undefined && normKey_(it.status) === 'cancelled' && lastCx !== null) closed = lastCx;
  if (closed !== undefined) o.closed = true;
  o.total = (closed !== undefined ? closed : now) - sub;
  o.totalLabel = closed !== undefined ? 'รวมตั้งแต่เริ่มต้นจนปิดเคส' : 'รวมตั้งแต่ยื่นเอกสารเล่ม 1 ถึงปัจจุบัน';
  return o;
}
function flexDuration_(it) {
  var st = stageObj_(it.status), col = { blue: '#1d4ed8', orange: '#d97706', green: '#15803d' }[st.c] || '#0f766e', d = durationInfo_(it), c = stageClock_(it);
  var body = [{ type: 'text', text: 'เลขที่เอกสาร ' + it.id, size: 'sm', color: '#51676f', wrap: true },
    { type: 'text', text: tx_(stageLabel_(it)), weight: 'bold', size: 'md', wrap: true, color: col, margin: 'xs' }, { type: 'separator', margin: 'lg' }];
  function drow(k, v, s, ok) {
    var kids = [{ type: 'text', text: k, size: 'xs', color: '#51676f', wrap: true }, { type: 'text', text: v, weight: 'bold', size: 'lg', color: ok ? '#15803d' : '#1f2d33', wrap: true }];
    if (s) kids.push({ type: 'text', text: s, size: 'xs', color: '#64748b', wrap: true });
    return { type: 'box', layout: 'vertical', margin: 'lg', spacing: 'xs', contents: kids };
  }
  d.rows.forEach(function (r) { body.push(drow(r.k, r.v, r.s, r.done)); });
  if (!st.end && c.inStage !== null) body.push(drow('อยู่ในขั้นตอนปัจจุบันมาแล้ว', c.inStage + ' วัน', '', false));
  if (d.total !== null) { body.push({ type: 'separator', margin: 'lg' }); body.push(drow(d.totalLabel, spanTh_(d.total), d.closed ? 'ปิดเคสแล้ว' : 'นับต่อเนื่องรวมช่วงจัดทำเล่ม 2 และช่วงส่งต่อระหว่างหน่วยงาน', d.closed)); }
  else body.push(drow('ยังไม่มีข้อมูลเวลา', '-', '', false));
  body.push(frow_('ข้อมูล ณ', thaiDT_()));
  return svWrap_(it, { type: 'flex', altText: ('ระยะเวลารวมปัจจุบัน ' + it.id + (d.total !== null ? ': ' + spanTh_(d.total) : '')).slice(0, 380), contents: fbubble_('ระยะเวลารวมปัจจุบัน', col, body, 'ดูรายละเอียดบนเว็บ') });
}
/* สร้างการ์ดทีละรายการ — ถ้ารายการใดสร้างไม่ได้ (ข้อมูลผิดรูปแบบ ฯลฯ) ส่งข้อความธรรมดาแทน แทนที่จะล้มทั้งคำตอบ */
function safeFlex_(build, it) {
  try { return build(it); }
  catch (e) {
    log_('line_flex', '', 'error', ((it && it.id) || '') + ': ' + String(e && e.message || e).slice(0, 150));
    var lab = ''; try { lab = stageLabel_(it); } catch (e2) {}
    return { type: 'text', text: 'รหัสติดตาม ' + ((it && it.id) || '-') + '\nสถานะปัจจุบัน: ' + (lab || '-') + '\nดูรายละเอียดที่ ' + siteUrl_() };
  }
}
function lineDurationReply_(ev, cid) {
  if (!cid) return lineReply_(ev.replyToken, [helpMsg_('ยังไม่ได้เชื่อมต่อบัญชี กรุณาเปิดเว็บ → ติดตามสถานะ → "เชื่อมต่อ LINE" เพื่อรับรหัส หรือพิมพ์เลขบัตรประชาชน 13 หลักในแชทนี้')]);
  var items = subs_().filter(function (r) { return r.cid === cid; }).reverse().slice(0, 3);
  if (!items.length) return lineReply_(ev.replyToken, [helpMsg_('ยังไม่พบรายการยื่นผลงานของท่าน')]);
  lineLog_(items[0].id, cid, 'bot', '', 'ระยะเวลารวม ' + items.length + ' รายการ', null, 'sent', '');
  return lineReply_(ev.replyToken, items.map(function (x) { return safeFlex_(flexDuration_, x); }));
}
function lineStatusReply_(ev, cid) {
  if (!cid) return lineReply_(ev.replyToken, [helpMsg_('ยังไม่ได้เชื่อมต่อบัญชี กรุณาเปิดเว็บ → ติดตามสถานะ → "เชื่อมต่อ LINE" เพื่อรับรหัส 6 หลัก')]);
  var items = subs_().filter(function (r) { return r.cid === cid; }).reverse().slice(0, 5);
  if (!items.length) return lineReply_(ev.replyToken, [helpMsg_('ยังไม่พบรายการยื่นผลงานของท่าน')]);
  lineLog_(items[0].id, cid, 'bot', '', 'เช็คสถานะ ' + items.length + ' รายการ', null, 'sent', '');
  return lineReply_(ev.replyToken, items.map(function (x) { return safeFlex_(flexCheck_, x); }));
}
function flexText_(it, text, head) {
  var body = [{ type: 'text', text: tx_(text, 1000), wrap: true, size: 'md' }, { type: 'separator', margin: 'lg' }].concat(idRows_(it));
  return svWrap_(it, { type: 'flex', altText: tx_(text, 380), contents: fbubble_(head || 'ข้อความจากกลุ่มงานทรัพยากรบุคคล', '#0f766e', body) });
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
/* ข้อความต้อนรับเมื่อเพิ่มเพื่อน: ข้อความตัวอักษรของ LINE ทำตัวหนา/สีไม่ได้ จึงใช้การ์ด Flex — กล่องเน้นด้านบนบอกให้พิมพ์เลขบัตรประชาชนก่อน */
function welcomeMsg_(back) {
  var hl = { type: 'box', layout: 'vertical', backgroundColor: '#fff4d6', cornerRadius: '10px', paddingAll: '14px', contents: [
    { type: 'text', text: 'ขั้นตอนแรก', size: 'xs', color: '#92400e', weight: 'bold' },
    { type: 'text', text: 'กรุณาพิมพ์เลขบัตรประชาชน 13 หลัก มาก่อน', size: 'lg', weight: 'bold', color: '#b45309', wrap: true, margin: 'xs' },
    { type: 'text', text: 'ระบบจะเชื่อมต่อและส่งสถานะปัจจุบันให้ทันที ไม่ต้องยืนยันอะไรเพิ่ม', size: 'xs', color: '#92400e', wrap: true, margin: 'sm' }] };
  var body = [
    { type: 'text', text: 'ยินดีต้อนรับสู่ระบบแจ้งเตือน อวช.', weight: 'bold', size: 'md', wrap: true },
    { type: 'text', text: ORG, size: 'xs', color: '#51676f', wrap: true },
    hl,
    { type: 'text', text: 'ถ้าพิมพ์เลขบัตรไม่ได้หรือไม่สำเร็จ', weight: 'bold', size: 'sm', margin: 'lg', wrap: true },
    { type: 'text', text: 'เปิดเว็บติดตามสถานะ → "เชื่อมต่อ LINE" → รับรหัส 6 หลักด้วยตนเอง แล้วพิมพ์รหัสที่นี่', size: 'sm', color: '#51676f', wrap: true, margin: 'xs' },
    { type: 'text', text: 'หากเชื่อมต่อไม่ได้ เจ้าหน้าที่ HR สามารถผูกบัญชีให้ได้', size: 'sm', color: '#51676f', wrap: true, margin: 'md' }];
  if (back) body.push({ type: 'text', text: '(พิมพ์ "สถานะ" เพื่อดูสถานะล่าสุด)', size: 'xs', color: '#51676f', wrap: true, margin: 'md' });
  var m = { type: 'flex', altText: 'กรุณาพิมพ์เลขบัตรประชาชน 13 หลัก มาก่อน เพื่อเชื่อมต่อระบบแจ้งเตือน อวช.', contents: { type: 'bubble', size: 'mega', body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: body } } };
  m.quickReply = helpMsg_('').quickReply;
  return m;
}
function helpMsg_(text) {
  return { type: 'text', text: text, quickReply: { items: [
    { type: 'action', action: { type: 'message', label: 'แจ้งสถานะปัจจุบัน', text: 'แจ้งสถานะปัจจุบัน' } },
    { type: 'action', action: { type: 'message', label: 'ระยะเวลารวมปัจจุบัน', text: 'ระยะเวลารวมปัจจุบัน' } },
    { type: 'action', action: { type: 'message', label: 'ยกเลิกการผูก', text: 'ยกเลิกการผูก' } },
    { type: 'action', action: { type: 'message', label: 'ช่วยเหลือ', text: 'ช่วยเหลือ' } }] } };
}

/* --- ผู้ใช้ LINE ที่ผูกกับเลขบัตร --- */
/* อ่านแท็บ LineUsers — ถ้าแท็บนี้ถูกจัดประเภทคอลัมน์ (Table) แล้ว Google โยน error ให้ข้ามไปเป็น "ยังไม่มีผู้ผูก LINE" แทนที่จะทำให้ติดตามสถานะพังทั้งหน้า */
function lnuRows_() {
  var s, n, vals;
  try {
    s = sheet_('LNU'); n = s.getLastRow();
    if (n < 2) return [];
    vals = V_(s.getRange(2, 1, n - 1, 6));
  } catch (e) { try { log_('lnu_read_fail', 'system', 'error', String(e.message || e).slice(0, 200)); } catch (e2) {} return []; }
  return vals.map(function (r, i) {
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
      if (r.uid === uid && r.cid === cid) { found = true; s.getRange(r.row, 3).setValue(name || r.name); setText_(s.getRange(r.row, 4), now_()); s.getRange(r.row, 5, 1, 2).setValues([[via, 'Y']]); }
    });
    var mine = rows.filter(function (r) { return r.cid === cid && r.active && r.uid !== uid; });
    if (mine.length >= 3) s.getRange(mine[0].row, 6).setValue('N');   // จำกัด 3 บัญชี/คน
    if (!found) appendText_(s, [cid, uid, name || '', now_(), via, 'Y']);
  } finally { lock.releaseLock(); }
  pendUpsert_(uid, name, null, 'linked', cid);
}
function unlinkLine_(cid, uid) {
  var s = sheet_('LNU'), n = 0;
  lnuRows_().forEach(function (r) { if (r.active && (uid ? r.uid === uid : r.cid === cid) && (!cid || r.cid === cid)) { s.getRange(r.row, 6).setValue('N'); n++; } });
  return n;
}
/* ระหว่างประมวลผล webhook: เก็บงานเขียนชีท (ประวัติ/LinePending) ไว้ก่อน แล้วค่อยเขียนหลังตอบผู้ใช้ — ผู้ใช้ได้คำตอบเร็วขึ้น replyToken ไม่หมดอายุ */
var DEFER_ = false, DEFERQ_ = [];
function defer_(fn) { if (DEFER_) DEFERQ_.push(fn); else { try { fn(); } catch (e) {} } }
function flushDefer_() { DEFER_ = false; HISV_ = null; var q = DEFERQ_; DEFERQ_ = []; q.forEach(function (fn) { try { fn(); } catch (e) {} }); }
function lineLog_(id, cid, type, sender, text, file, result, detail) {
  var row = [now_(), id || '', cid || '', type, sender || '', String(text || '').slice(0, 1000), file ? file.name : '', file ? file.url : '', result, String(detail || '').slice(0, 300)];
  defer_(function () { appendText_(sheet_('LNL'), row); });
}
function lnlRows_(max) {
  var s = sheet_('LNL'), n = s.getLastRow();
  if (n < 2) return [];
  var from = Math.max(2, n - (max || 2000) + 1);
  var rows = V_(s.getRange(from, 1, n - from + 1, 10)).map(function (r) {
    return { t: str_(r[0]), id: str_(r[1]), cid: digits_(r[2]), type: str_(r[3]), by: str_(r[4]), m: str_(r[5]), fn: str_(r[6]), fu: str_(r[7]), res: str_(r[8]), d: str_(r[9]) };
  });
  return sortByTime_(rows, function (r) { return r.t; });   // เรียงเก่า → ใหม่ตามเวลาจริง (ผู้เรียกใช้ .reverse() ให้ใหม่สุดขึ้นก่อน)
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
    var text = (head || 'สถานะเปลี่ยนเป็น') + ' ' + stageLabel_(it) + (it.note ? ' — ' + it.note : '');
    var pre = linePre_(it.cid, it.id, 'auto', sender, text);
    if (!pre.ok) return { sent: 0, failed: 0, skipped: pre.reason, msg: pre.msg };
    var msgs = [safeFlex_(function (z) { return flexStatus_(z, head === 'ยื่นเอกสารแล้ว' ? 'ได้รับเอกสารของท่านแล้ว' : 'อัปเดตสถานะ อวช.'); }, it)];
    var ackId = ackNewId_(); if (!ackBtn_(msgs[0], ackId)) ackId = '';   // ปุ่ม "รับทราบ" (ไม่บังคับ) — สร้างรายการในแท็บ รับทราบ หลังส่งสำเร็จเท่านั้น
    if (file && file.shared) msgs.push(flexFile_(file));          // ถ้า Drive ไม่อนุญาตแชร์ลิงก์ ผู้ยื่นจะเปิดไม่ได้ จึงไม่ส่งการ์ดไฟล์
    var res = lineSend_(pre.users, it.cid, it.id, 'auto', sender, msgs, text, file);
    if (ackId && res.sent > 0) { try { ackAdd_({ id: ackId, title: ACK_ST + stageLabel_(it), items: [], due: '' }, it, sender); } catch (e3) { log_('line_ack', sender, 'error', String(e3.message || e3)); } }
    return res;
  } catch (e) { log_('line_auto', sender, 'error', String(e.message || e)); return { sent: 0, failed: 1, errors: [String(e.message || e)] }; }
}

/* ======================================================================
 *  ข้อความ "ต้องดำเนินการ" + ปุ่ม "รับทราบ" (สื่อสารสองทาง)
 *  HR ส่งการ์ดสีแดงพร้อมรายการที่ต้องทำ → ผู้ยื่นกดปุ่ม "รับทราบ" ใน LINE (ไม่บังคับ) → ระบบบันทึกเวลา/บัญชีที่กด ลงแท็บ "รับทราบ"
 *  ไม่มีการเตือนซ้ำ (ไม่รบกวนผู้ยื่น) — ผู้ที่ไม่กดก็ยังเห็นข้อความตามปกติ
 *  postback data = a=ack&m=ACK-yyMMdd-XXXXX  (ไม่ใช้คำว่า status/check/time เพื่อไม่ชนกับ lineIntent_)
 *  ปลอดภัยเมื่อกดซ้ำ (ไม่เขียนทับเวลาแรก) และตรวจว่าผู้กดคือบัญชี LINE ที่ผูกกับเลขบัตรของข้อความนั้น
 * ====================================================================== */
var ACK_WAIT = 'ยังไม่กดรับทราบ', ACK_DONE = 'รับทราบแล้ว', ACK_FAIL = 'ส่งไม่สำเร็จ';
function ackNewId_() { return 'ACK-' + Utilities.formatDate(new Date(), TZ, 'yyMMdd') + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 5).toUpperCase(); }
function ackDueTh_(d) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || '')); if (!m) return '';
  var M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return (+m[3]) + ' ' + M[+m[2] - 1] + ' ' + (+m[1] + 543);
}
function ackRows_(max) {
  var s = sheet_('ACK'), n = s.getLastRow(); if (n < 2) return [];
  var from = Math.max(2, n - (max || 1000) + 1);
  return V_(s.getRange(from, 1, n - from + 1, 11)).map(function (r, i) {
    var items = []; try { items = JSON.parse(str_(r[6])) || []; } catch (e) {}
    return { row: from + i, id: str_(r[0]), t: str_(r[1]), sid: str_(r[2]), cid: digits_(r[3]), by: str_(r[4]), title: str_(r[5]), items: items, due: str_(r[7]), st: str_(r[8]), at: str_(r[9]), uid: str_(r[10]) };
  });
}
function ackPub_(a) { return { id: a.id, t: a.t, sid: a.sid, title: a.title, items: a.items, due: a.due, st: a.st, at: a.at, k: ackIsSt_(a) ? 'st' : 'act' }; }
function ackClean_(p) {
  var title = str_(p.title).replace(/\s+/g, ' ').slice(0, 60);
  if (!title) throw new Error('กรุณาระบุหัวข้อเรื่องที่ต้องดำเนินการ');
  var items = [], raw = Array.isArray(p.items) ? p.items : [];
  raw.slice(0, 6).forEach(function (x) {
    var k = str_(x && x[0]).replace(/\s+/g, ' ').slice(0, 80), v = str_(x && x[1]).replace(/\s+/g, ' ').slice(0, 24);
    if (k) items.push([k, v]);
  });
  if (!items.length) throw new Error('กรุณาระบุรายการที่ต้องทำอย่างน้อย 1 ข้อ');
  var due = str_(p.due); if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error('รูปแบบวันกำหนดไม่ถูกต้อง');
  return { title: title, items: items, due: due, ack: p.ack !== false, msg: str_(p.msg).replace(/\s+/g, ' ').slice(0, 160), id: '' };
}
function ackAdd_(a, cur, sender) {
  appendText_(sheet_('ACK'), [a.id, now_(), cur.id, cur.cid, sender || '', a.title, JSON.stringify(a.items), a.due || '', ACK_WAIT, '', '']);
}
function ackSet_(row, col, v) { setText_(sheet_('ACK').getRange(row, col), v); }
/* ปุ่ม "รับทราบ" บนการ์ดแจ้งสถานะทุกใบ (ไม่บังคับ) — ใช้ระบบรับทราบเดิม เพิ่มคำนำหน้าหัวข้อเพื่อแยกจากการ์ด "ต้องดำเนินการ" */
var ACK_ST = 'รับทราบสถานะ: ';
function ackIsSt_(a) { return String(a && a.title || '').indexOf(ACK_ST) === 0; }
function ackBtn_(msg, id) {   /* ใส่ปุ่มรองท้ายการ์ด (คงปุ่มเดิมของการ์ดไว้ เช่น ดูรายละเอียด / ประเมินความพึงพอใจ) คืน true ถ้าใส่สำเร็จ */
  try {
    if (!msg || msg.type !== 'flex' || !msg.contents) return false;
    var b = msg.contents, btn = { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: 'รับทราบ', data: 'a=ack&m=' + id, displayText: 'รับทราบ' } };
    if (!b.footer || !Array.isArray(b.footer.contents)) b.footer = { type: 'box', layout: 'vertical', spacing: 'sm', contents: [] };
    b.footer.contents.unshift(btn);
    return true;
  } catch (e) { return false; }
}
/* การ์ด "ต้องดำเนินการ" สีแดง — a = {id,title,items,due,ack} */
function flexAction_(it, a) {
  var items = (a.items || []).map(function (x, i) {
    var row = [
      { type: 'box', layout: 'vertical', width: '24px', height: '24px', cornerRadius: '12px', backgroundColor: '#fee2e2', justifyContent: 'center', alignItems: 'center', flex: 0,
        contents: [{ type: 'text', text: String(i + 1), size: 'xs', weight: 'bold', color: '#991b1b', align: 'center' }] },
      { type: 'text', text: tx_(x[0], 80), size: 'md', weight: 'bold', wrap: true, flex: 1, color: '#1f2d33' }];
    if (x[1]) row.push({ type: 'box', layout: 'vertical', flex: 0, backgroundColor: '#fef3c7', cornerRadius: '12px', paddingStart: '10px', paddingEnd: '10px', paddingTop: '3px', paddingBottom: '3px',
      contents: [{ type: 'text', text: tx_(x[1], 24), size: 'sm', weight: 'bold', color: '#78350f' }] });
    return { type: 'box', layout: 'horizontal', spacing: 'md', alignItems: 'center', margin: 'md', contents: row };
  });
  var body = [
    { type: 'text', text: ORG, size: 'xs', color: '#51676f', wrap: true },
    { type: 'text', text: tx_(a.title, 60), size: 'xl', weight: 'bold', wrap: true, color: '#b91c1c', margin: 'sm' }];
  if (a.msg) body.push({ type: 'text', text: tx_(a.msg, 160), size: 'sm', wrap: true, color: '#1f2d33', margin: 'md' });
  body = body.concat(items);
  var due = ackDueTh_(a.due);
  if (due) body.push({ type: 'box', layout: 'vertical', margin: 'lg', backgroundColor: '#fff7ed', cornerRadius: '8px', paddingAll: '10px',
    contents: [{ type: 'text', text: '📅 กำหนด ' + due, size: 'sm', weight: 'bold', color: '#7c2d12', wrap: true }] });
  body.push({ type: 'separator', margin: 'lg' });
  body = body.concat(idRows_(it));
  var title = { type: 'text', text: '⚠️ ต้องดำเนินการ', color: '#ffffff', weight: 'bold', size: 'md', wrap: true, flex: 1, gravity: 'center' }, logo = logoUrl_();
  var hbox = logo
    ? { type: 'box', layout: 'horizontal', spacing: 'md', alignItems: 'center', contents: [{ type: 'image', url: logo, size: '40px', aspectMode: 'cover', flex: 0 }, title] }
    : { type: 'box', layout: 'vertical', contents: [title] };
  var b = { type: 'bubble', size: 'mega',
    header: { type: 'box', layout: 'vertical', backgroundColor: '#b91c1c', paddingAll: '14px', contents: [hbox] },
    body: { type: 'box', layout: 'vertical', contents: body } };
  var foot = [], u = siteUrl_();
  if (a.ack && a.id) foot.push({ type: 'button', style: 'primary', color: '#15803d', height: 'md', action: { type: 'postback', label: 'รับทราบ', data: 'a=ack&m=' + a.id, displayText: 'รับทราบ' } });
  if (u) foot.push({ type: 'button', style: 'link', height: 'sm', action: { type: 'uri', label: 'ดูรายละเอียดในระบบ', uri: u + '#track' } });
  if (foot.length) b.footer = { type: 'box', layout: 'vertical', spacing: 'sm', contents: foot };
  var sum = (a.items || []).map(function (x) { return x[0] + (x[1] ? ' ' + x[1] : ''); }).join(' · ');
  return { type: 'flex', altText: ('⚠️ ต้องดำเนินการ: ' + a.title + (sum ? ' (' + sum + ')' : '')).slice(0, 380), contents: b };
}
/* การ์ดสีเขียวตอบกลับเมื่อผู้ยื่นกดรับทราบ (already=true → กดซ้ำ แสดงเวลาที่รับทราบครั้งแรก) */
function flexAckDone_(a, already) {
  var d = null; if (a.at) { d = new Date(String(a.at).replace(' ', 'T') + '+07:00'); if (isNaN(d)) d = null; }
  var body = [
    { type: 'text', text: tx_(a.title, 60), size: 'lg', weight: 'bold', wrap: true, color: '#15803d' },
    { type: 'text', text: (already ? 'ท่านรับทราบข้อความนี้ไว้แล้วเมื่อ ' : 'กลุ่มงานทรัพยากรบุคคลได้รับการยืนยันของท่านแล้ว เมื่อ ') + (d ? thaiDT_(d) : '-'), size: 'sm', color: '#51676f', wrap: true, margin: 'md' },
    { type: 'text', text: 'หากมีข้อสงสัย ติดต่อกลุ่มงานทรัพยากรบุคคลได้ในวันและเวลาราชการ', size: 'xs', color: '#51676f', wrap: true, margin: 'md' }];
  return { type: 'flex', altText: ((already ? 'รับทราบไว้แล้ว: ' : 'บันทึกการรับทราบแล้ว: ') + a.title).slice(0, 380), contents: { type: 'bubble', size: 'kilo',
    header: { type: 'box', layout: 'vertical', backgroundColor: '#15803d', paddingAll: '12px', contents: [{ type: 'text', text: '✅ ' + (already ? 'รับทราบแล้ว' : 'บันทึกการรับทราบแล้ว'), color: '#ffffff', weight: 'bold', size: 'md', wrap: true }] },
    body: { type: 'box', layout: 'vertical', contents: body } } };
}
/* ผู้ยื่นกดปุ่ม "รับทราบ" (mid = รหัสข้อความ) หรือพิมพ์ "รับทราบ" (ไม่มี mid → ข้อความที่ยังไม่กดล่าสุด) */
function lineAck_(ev, mine, mid) {
  if (!mine) return lineReply_(ev.replyToken, [helpMsg_('ยังไม่ได้เชื่อมต่อบัญชี พิมพ์เลขบัตรประชาชน 13 หลักที่นี่เพื่อเชื่อมต่อ แล้วกดรับทราบอีกครั้ง')]);
  var lock = LockService.getScriptLock(), got = false;
  try { got = lock.tryLock(8000); } catch (e) {}
  try {
    var all = ackRows_(3000), a, left = 0;
    if (mid) a = all.filter(function (r) { return r.id === mid; })[0];
    else {   /* พิมพ์ "รับทราบ": ให้ความสำคัญกับการ์ด "ต้องดำเนินการ" ก่อน ถ้าไม่มี จึงรับทราบการ์ดสถานะล่าสุด · ตัวนับ "ยังมีอีก" นับเฉพาะการ์ดต้องดำเนินการ */
      var pend = all.filter(function (r) { return r.cid === mine.cid && r.st === ACK_WAIT; }), pact = pend.filter(function (r) { return !ackIsSt_(r); });
      a = pact.length ? pact[pact.length - 1] : pend[pend.length - 1]; left = Math.max(0, pact.length - 1);
    }
    if (!a) {
      if (!mid) return;   // พิมพ์ "รับทราบ" แต่ไม่มีข้อความค้าง: ไม่ตอบ
      return lineReply_(ev.replyToken, [helpMsg_('ไม่พบข้อความที่ต้องรับทราบ (อาจถูกลบแล้ว) กรุณาติดต่อกลุ่มงานทรัพยากรบุคคล')]);   // กดปุ่มจากการ์ดที่หายไป: ยังแจ้ง
    }
    if (a.cid !== mine.cid) {
      lineLog_(a.sid, mine.cid, 'ack', '', 'บัญชี LINE นี้ไม่ใช่ผู้รับข้อความ ' + a.id, null, 'failed', 'ปฏิเสธการรับทราบ');
      return lineReply_(ev.replyToken, [helpMsg_('บัญชี LINE นี้ไม่ใช่ผู้รับข้อความดังกล่าว จึงรับทราบแทนไม่ได้')]);
    }
    if (a.st === ACK_DONE) return lineReply_(ev.replyToken, [flexAckDone_(a, true)]);
    var nowS = now_();
    ackSet_(a.row, 9, ACK_DONE); ackSet_(a.row, 10, nowS); ackSet_(a.row, 11, CUR_UID_ || mine.uid);
    a.st = ACK_DONE; a.at = nowS;
    lineLog_(a.sid, a.cid, 'ack', '', 'ผู้ยื่นกดรับทราบ: ' + a.title, null, 'success', a.id);
    var msgs = [flexAckDone_(a, false)];
    if (left > 0) msgs.push({ type: 'text', text: 'ยังมีอีก ' + left + ' ข้อความที่ยังไม่ได้กดรับทราบ หากต้องการ กดปุ่ม "รับทราบ" ในการ์ดแต่ละใบได้เลย' });
    lineReply_(ev.replyToken, msgs);
  } finally { if (got) { try { lock.releaseLock(); } catch (e2) {} } }
}
/* รายการรับทราบ: ระบุ id = ของรายการนั้น | ไม่ระบุ = ข้อความที่ยังไม่มีผู้กดรับทราบ (พร้อมชื่อผู้ยื่น) */
function apiAckList_(token, id) {
  auth_(token);
  var rows = ackRows_(1500), out;
  if (id) return { rows: rows.filter(function (r) { return r.sid === id; }).reverse().slice(0, 20).map(ackPub_) };
  var names = {}; subs_().forEach(function (s) { names[s.id] = (fullName_(s).trim() || s.id); });
  out = rows.filter(function (r) { return r.st === ACK_WAIT && !ackIsSt_(r); }).reverse().slice(0, 100).map(function (r) { var o = ackPub_(r); o.name = names[r.sid] || ''; return o; });
  return { rows: out };
}

/* --- Webhook (LINE → GAS) --- */
function webhookKey_() {
  var k = prop_('LINE_WEBHOOK_KEY');
  if (!k) { k = Utilities.getUuid().replace(/-/g, ''); setProp_('LINE_WEBHOOK_KEY', k); }
  return k;
}
function lineWebhook_(e, b) {
  var key = prop_('LINE_WEBHOOK_KEY').trim();
  // GAS อ่าน header X-Line-Signature ไม่ได้ จึงใช้รหัสลับแทน (ฝั่ง Vercel /api/line ตรวจลายเซ็นของ LINE ให้แล้ว)
  //   รับรหัสได้ 2 ทาง: 1) ?k= ท้าย URL  2) ฟิลด์ _k ใน body ที่ /api/line แนบมา
  var got = String((e && e.parameter && e.parameter.k) || '').trim(), src = 'url';
  try { got = decodeURIComponent(got); } catch (x) {}
  if (!got && b && b._k != null) { got = String(b._k).trim(); src = 'body'; }
  if (!key || !got || got !== key) {
    log_('line_webhook', '', 'rejected', !key ? 'ไม่มี LINE_WEBHOOK_KEY (รัน setupLine() ใน Apps Script)' : (!got ? 'ไม่ได้รับรหัส k เลย → ตรวจ Vercel env LINE_WEBHOOK_KEY แล้ว Redeploy' : 'k ไม่ตรง: รับ ' + got.length + ' ตัว/คาด ' + key.length + ' ตัว, 4 ตัวแรก' + (got.slice(0, 4) === key.slice(0, 4) ? 'ตรง' : 'ไม่ตรง') + ', ที่มา=' + src));
    return json_({ ok: false, reason: 'key' });
  }
  var evs = (b && b.events) || [];
  if (evs.length) { try { setProp_('LINE_LAST_HIT', now_() + ' | ' + evs.map(function (v) { return v.type + (v.type === 'postback' ? ':' + str_(v.postback && v.postback.data).slice(0, 30) : v.type === 'message' ? ':' + str_(v.message && v.message.type) : ''); }).join(', ')); } catch (x2) {} }   // หลักฐานว่าการกดถึง Apps Script (ดูใน lineDiag)
  var cache = CacheService.getScriptCache();
  evs.forEach(function (ev) {
    var eid = ev && ev.webhookEventId;                                     // LINE ส่งซ้ำ (redelivery) เมื่อตอบช้า → กันประมวลผล/ตอบซ้ำ
    if (eid) { if (cache.get('we_' + eid)) return; cache.put('we_' + eid, '1', 3600); }
    try { lineEvent_(ev); } catch (err) { log_('line_event', '', 'error', String(err.message || err)); }
  });
  return json_({ ok: true, n: evs.length });
}
function maskT_(t) { return String(t).replace(/\d[\d\- ]{11,15}\d/g, function (m) { var d = digits_(m); return d.length === 13 ? 'x-xxxx-xxxxx-xx-' + d.slice(-1) : m; }); }
/* เก็บ LINE userId ของทุกคนที่เพิ่มเพื่อนตั้งแต่ต้น (แท็บ LinePending) เพื่อให้เจ้าหน้าที่ผูกให้ได้ แม้ผู้ยื่นยังไม่ได้รับรหัส */
function pendUpsert_(uid, name, last, status, cid) { defer_(function () { pendUpsertNow_(uid, name, last, status, cid); }); }
function pendUpsertNow_(uid, name, last, status, cid) {
  try {
    var s = sheet_('LNP'), n = s.getLastRow(), v = n > 1 ? V_(s.getRange(2, 1, n - 1, 6)) : [], row = 0, cur = null;
    for (var i = 0; i < v.length; i++) if (str_(v[i][0]) === uid) { row = i + 2; cur = v[i]; break; }
    if (!row) { appendText_(s, [uid, name || lineProfile_(uid), now_(), last || '', status, cid || '']); return; }
    if (name) s.getRange(row, 2).setValue(name);
    if (last != null) s.getRange(row, 4).setValue(String(last).slice(0, 80));
    /* คำขอที่รอ HR (claim) / ที่ HR ไม่อนุมัติ (dismissed) ต้องไม่ถูกเขียนทับกลับเป็น pending เมื่อผู้ใช้พิมพ์ข้อความอื่นตามมา */
    if (status === 'pending' && !cid && (str_(cur[4]) === 'claim' || str_(cur[4]) === 'dismissed')) return;
    var rg = s.getRange(row, 5, 1, 2); fmt_(rg, '@'); rg.setValues([[status, cid || '']]);
  } catch (e) {}
}
/* ผู้ยื่นส่งสติกเกอร์มาในแชท LINE → ระบบไม่ตอบกลับ (เรียกใช้ที่ต้น lineEventCore_) */
function isStickerEvent_(ev) {
  return !!(ev && ev.type === 'message' && ev.message && ev.message.type === 'sticker');
}
/* กดรันจากเมนู Apps Script เพื่อตรวจ (ไม่ส่งข้อความจริง ดูผลที่ Execution log) */
function testStickerIgnore() {
  var cases = [
    ['sticker', { type: 'message', message: { type: 'sticker', packageId: '1', stickerId: '1' } }, true],
    ['text', { type: 'message', message: { type: 'text', text: 'สถานะ' } }, false],
    ['image', { type: 'message', message: { type: 'image' } }, false],
    ['postback', { type: 'postback', postback: { data: 'action=status' } }, false],
    ['follow', { type: 'follow' }, false],
    ['empty', null, false]
  ], bad = 0;
  cases.forEach(function (c) { var got = isStickerEvent_(c[1]); if (got !== c[2]) bad++; Logger.log((got === c[2] ? 'ผ่าน ' : 'ไม่ผ่าน ') + c[0] + ' → ' + got); });
  Logger.log(bad ? 'มี ' + bad + ' กรณีไม่ผ่าน' : 'ผ่านทุกกรณี');
}
/* ทางเข้าเหตุการณ์ LINE: ครอบด้วย try/catch — ถ้าเกิดข้อผิดพลาดกลางทาง ผู้ใช้ยังได้ข้อความตอบ (เดิมเงียบ) และบันทึกสาเหตุใน ActivityLog */
function lineEvent_(ev) {
  CUR_UID_ = str_(ev && ev.source && ev.source.userId); REPLIED_ = false; DEFER_ = true; DEFERQ_ = []; HISV_ = null;
  var t0 = Date.now();
  try {
    if (ev && ev.mode === 'standby') return;
    lineEventCore_(ev);
  } catch (err) {
    log_('line_event', '', 'error', (String(err && err.message || err) + ' | ' + String((err && err.stack) || '').split('\n')[0]).slice(0, 250));
    if (!REPLIED_ && ev && ev.replyToken && ev.type !== 'unfollow') { try { lineReply_(ev.replyToken, [helpMsg_('ขออภัย ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งในอีกสักครู่ หรือพิมพ์ "ช่วยเหลือ"')]); } catch (e2) {} }
  } finally {
    flushDefer_();
    var ms = Date.now() - t0; if (ms > 8000) log_('line_slow', '', 'warn', String(ev && ev.type) + ' ใช้เวลา ' + ms + ' ms');
    CUR_UID_ = '';
  }
}
function lineEventCore_(ev) {
  var uid = ev.source && ev.source.userId; if (!uid) return;
  if (isStickerEvent_(ev)) return;   // สติกเกอร์: ไม่ตอบ ไม่นับว่ายังไม่เชื่อมต่อ ไม่บันทึกประวัติ
  var rows = lnuRows_().filter(function (r) { return r.uid === uid; }), mine = rows.filter(function (r) { return r.active; })[0];
  var s = sheet_('LNU'), c = CacheService.getScriptCache();
  NUDGE_UID_ = '';
  if (ev.type === 'message' && !mine && ev.source.type === 'user') noLinkTick_(uid);   // ยังไม่เชื่อมต่อ: นับ ครบ NOLINK_MANUAL_AT → แนบคู่มือ
  if (ev.type === 'unfollow') { rows.forEach(function (r) { s.getRange(r.row, 6).setValue('N'); }); pendUpsert_(uid, '', null, 'unfollow', ''); lineLog_('', mine ? mine.cid : '', 'link', '', 'ผู้ใช้บล็อก/เลิกติดตาม LINE OA', null, 'info', ''); return; }
  if (ev.type === 'follow') { lineLog_('', mine ? mine.cid : '', 'link', '', 'เพิ่มเพื่อน LINE OA', null, 'info', 'userId=' + uid);
    pendUpsert_(uid, '', null, mine ? 'linked' : 'pending', mine ? mine.cid : '');
    var back = rows.filter(function (r) { return !r.active; })[0];
    lineReply_(ev.replyToken, [welcomeMsg_(!!back)].concat(mine || back ? [] : [manualMsg_()]));   // เพิ่มเพื่อนครั้งแรก: การ์ดต้อนรับเน้นให้พิมพ์เลขบัตรก่อน + แนบคู่มือให้อ่านทันที
    return;
  }
  /* Rich Menu แบบ Postback: ตั้ง data = action=status */
  if (ev.type === 'postback') {
    var am = /(?:^|&)a=ack&m=(ACK-\d{6}-[0-9A-F]{5})(?:&|$)/.exec(str_(ev.postback && ev.postback.data));   // ปุ่ม "รับทราบ" — ตรวจก่อน lineIntent_ ซึ่งจับคำแบบหลวม ๆ
    if (am) return lineAck_(ev, mine, am[1]);
    var pd = str_(ev.postback && ev.postback.data), pi = lineIntent_(pd);       // รับ data หลายรูปแบบ (action=status, status, JSON, ภาษาไทย ฯลฯ)
    lineLog_('', mine ? mine.cid : '', 'inbound', '', 'postback: ' + pd.slice(0, 200), null, 'received', pi ? '' : 'ไม่รู้จักคำสั่ง — ตั้ง data ของปุ่มเป็น action=status หรือ action=duration');
    if (!mine && ev.source.type === 'user') noLinkTick_(uid);
    if (pi === 'status') return lineStatusReply_(ev, mine ? mine.cid : '');
    if (pi === 'duration') return lineDurationReply_(ev, mine ? mine.cid : '');
    if (pi === 'help') return lineReply_(ev.replyToken, [helpMsg_(helpTxtFor_(mine ? mine.cid : '')), manualMsg_()]);
    return lineReply_(ev.replyToken, [helpMsg_(mine ? 'ปุ่มนี้ยังไม่มีคำสั่งรองรับ กรุณาพิมพ์ "สถานะ" เพื่อดูสถานะปัจจุบัน หรือ "ช่วยเหลือ" เพื่อดูคำสั่งทั้งหมด' : 'ยังไม่ได้เชื่อมต่อบัญชี พิมพ์เลขบัตรประชาชน 13 หลักที่นี่เพื่อเชื่อมต่อ')]);
  }
  if (ev.type !== 'message' || !ev.message || ev.message.type !== 'text') {
    if (ev.type === 'message') lineReply_(ev.replyToken, [helpMsg_('ระบบรับเฉพาะข้อความตัวอักษร พิมพ์ "ช่วยเหลือ" เพื่อดูคำสั่ง')]);
    return;
  }
  var t = str_(ev.message.text).replace(/\s+/g, ' '), cid = mine ? mine.cid : '';
  lineLog_('', cid, 'inbound', '', maskT_(t), null, 'received', '');
  if (/^รับทราบ(ครับ|ค่ะ|คะ)?$/.test(t)) return lineAck_(ev, mine, '');   // พิมพ์ "รับทราบ" แทนการกดปุ่ม
  var tn = t.normalize('NFKC').replace(/[๐-๙]/g, function (d) { return String(d.charCodeAt(0) - 0x0E50); });   // เลขไทย/เลขเต็มความกว้าง → เลขอารบิก (ใช้กับเลขบัตรและรหัส 6 หลัก)
  var dg = digits_(tn), docm = /^AWC-\d{8}-\d{4}$/i.exec(t);
  if ((/^[\d\- ]{13,17}$/.test(tn) && dg.length === 13) || docm) {
    if (!cid && !docm && ev.source.type === 'user' && bindMode_() === 'cid' && lineBindByCid_(ev, uid, dg)) return;   // ผูกจากเลขบัตรทันที (บันทึก userId)
    if (!cid) pendUpsert_(uid, '', maskT_(t), 'pending', '');
    return lineLookup_(ev, uid, cid, docm ? t.toUpperCase() : '', dg);
  }
  if (!cid) {
    pendUpsert_(uid, '', maskT_(t), 'pending', '');
    if (/^\d{4}$/.test(t) && c.get('lw_' + uid)) return lineVerifyPhone_(ev, uid, t);
  }
  /* รหัส 6 หลัก: รับรูปแบบที่ผู้ใช้คัดลอก/พิมพ์มา เช่น "123 456", "123-456", "รหัส 123456", เลขไทย/เลขเต็มความกว้าง */
  var cm = /^(?:รหัส|code)?\s*[:：]?\s*(\d{3})[\s\-]?(\d{3})$/i.exec(tn);
  if (cm) return lineConsume_(ev, uid, cm[1] + cm[2]);
  var qm = /^(?:ถาม|ask)(?:\s*[:：]\s*|\s+|$)([\s\S]*)$/i.exec(t);
  if (qm) return lineAskStaff_(ev, cid, qm[1]);                                   // "ถาม <ข้อความ>" → ส่งถึงเจ้าหน้าที่ HR (แท็บ ถามตอบ)
  if (/^(ยกเลิกการผูก|ยกเลิก|unlink)$/i.test(t)) {
    if (!cid) return lineReply_(ev.replyToken, [helpMsg_('บัญชี LINE นี้ยังไม่ได้เชื่อมต่อ')]);
    unlinkLine_(cid, uid); pendUpsert_(uid, '', null, 'pending', ''); lineLog_('', cid, 'link', '', 'ผู้ใช้ยกเลิกการผูกเอง', null, 'info', '');
    return lineReply_(ev.replyToken, [{ type: 'text', text: 'ยกเลิกการเชื่อมต่อแล้ว จะไม่ได้รับแจ้งเตือนอีก หากต้องการกลับมาใช้ ให้พิมพ์เลขบัตรประชาชนที่นี่หรือเชื่อมต่อใหม่จากหน้าเว็บ' }]);
  }
  var li = t.length <= 40 ? lineIntent_(t) : '';                                   // ข้อความจากปุ่ม/ผู้ใช้ที่พิมพ์คล้ายคำสั่ง เช่น "ตรวจสอบสถานะ" "ดูสถานะ อวช."
  if (li === 'status') return lineStatusReply_(ev, cid);
  if (li === 'duration') return lineDurationReply_(ev, cid);
  if (li === 'help') return lineReply_(ev.replyToken, [helpMsg_(helpTxtFor_(cid)), manualMsg_()]);
  var helpTxt_ = helpTxtFor_(cid);
  if (/^(ช่วยเหลือ|ช่วยด้วย|วิธีใช้|วิธีเชื่อมต่อ|คู่มือ|help|manual|\?)$/i.test(t)) { NUDGE_UID_ = ''; return lineReply_(ev.replyToken, [helpMsg_(helpTxt_), manualMsg_()]); }   // ขอความช่วยเหลือ → ส่งคู่มือเสมอ
  if (cid) return;   // ผูก LINE แล้ว: พิมพ์ข้อความอิสระ ระบบไม่ตอบ (ยังบันทึกในประวัติ LINE ตามเดิม)
  lineReply_(ev.replyToken, [helpMsg_(helpTxt_)]);
}
function helpTxtFor_(cid) { return (cid ? 'คำสั่งที่ใช้ได้:\n• สถานะ (หรือ แจ้งสถานะปัจจุบัน) — ดูความคืบหน้าปัจจุบัน (หรือพิมพ์เลขบัตร/รหัสเอกสาร AWC-… เพื่อค้นหา)\n• ระยะเวลารวมปัจจุบัน — ดูระยะเวลาของเล่ม 1 / เล่ม 2 และรวมตั้งแต่เริ่มต้น\n• ถาม <ข้อความ> — ส่งคำถามถึงเจ้าหน้าที่ HR (เฉพาะเรื่องสำคัญ)\n• ยกเลิกการผูก — หยุดรับแจ้งเตือน' : 'ยังไม่ได้เชื่อมต่อบัญชี พิมพ์เลขบัตรประชาชน 13 หลักที่นี่เพื่อเชื่อมต่อ หรือขอรหัส 6 หลักที่หน้าเว็บแล้วพิมพ์รหัสที่นี่'); }
/* จัดกลุ่มคำสั่งแบบหลวม ๆ จากข้อความ/ข้อมูล postback ของ Rich Menu → 'status' | 'duration' | 'help' | '' */
function lineIntent_(s) {
  s = String(s == null ? '' : s);
  try { s = decodeURIComponent(s); } catch (e) {}
  try { s = s.normalize('NFKC'); } catch (e2) {}
  s = s.toLowerCase();
  if (/duration|total_?time|elapsed|ระยะเวลา|(^|[^a-z])time([^a-z]|$)/.test(s)) return 'duration';
  if (/status|สถานะ|ติดตาม|ความคืบหน้า|progress|(^|[^a-z])check([^a-z]|$)|เช็ค/.test(s)) return 'status';
  if (/help|ช่วยเหลือ|วิธีใช้|คู่มือ|manual/.test(s)) return 'help';
  return '';
}
/* โหมดผูกเมื่อพิมพ์เลขบัตร: 'cid' (ค่าเริ่มต้น) = บันทึก LINE userId ทันที | 'phone' = ต้องยืนยันเลข 4 ตัวท้ายเบอร์โทรก่อน (ตั้งที่ Script Properties: LINE_BIND_MODE) */
function bindMode_() { return prop_('LINE_BIND_MODE') === 'phone' ? 'phone' : 'cid'; }
/* พิมพ์เลขบัตร 13 หลักจากบัญชี LINE ที่ยังไม่ผูก → บันทึก userId ลงแท็บ LineUsers (วิธีผูก = cid) แล้วตอบสถานะ
 * คืน true = จัดการและตอบแล้ว | false = ให้ไหลไปขั้นตอนเดิม (ตรวจเบอร์โทร) เช่น เลขบัตรนี้มีบัญชี LINE อื่นผูกอยู่แล้ว */
function lineBindByCid_(ev, uid, cid) {
  if (!lineEnabled_()) return false;
  if (!rateOk_('lb_' + uid, 6, 900)) { lineReply_(ev.replyToken, [{ type: 'text', text: 'ลองหลายครั้งเกินไป กรุณารอ 15 นาที หรือแจ้งเจ้าหน้าที่ HR ให้ผูกบัญชีให้' }]); return true; }
  if (!validCid_(cid)) { lineReply_(ev.replyToken, [helpMsg_('เลขบัตรประชาชนไม่ถูกต้อง ตรวจสอบตัวเลขอีกครั้ง')]); return true; }
  var items = subs_().filter(function (r) { return r.cid === cid; });
  if (!staffByCid_(cid) && !items.length) {
    pendUpsert_(uid, '', maskT_(cid), 'pending', '');
    lineReply_(ev.replyToken, [helpMsg_('ไม่พบเลขบัตรนี้ในระบบ ตรวจสอบตัวเลขอีกครั้ง หรือหากยังไม่เคยยื่นเอกสาร ให้ยื่นเอกสารที่หน้าเว็บก่อน')]); return true;
  }
  var other = lnuRows_().some(function (r) { return r.cid === cid && r.active && r.uid !== uid; });
  if (other) return false;                                  // เลขบัตรนี้มี LINE อื่นผูกอยู่แล้ว → ไม่ให้ผูกเพิ่มด้วยเลขบัตรอย่างเดียว (กันผู้อื่นสวมรอย) ใช้ขั้นยืนยันเบอร์โทร
  linkLine_(cid, uid, lineProfile_(uid), 'cid');            // บันทึก LINE userId + เลขบัตร (แท็บ LineUsers) และอัปเดตแท็บ LinePending
  lineLog_('', cid, 'link', '', 'ผูกบัญชี LINE สำเร็จ (พิมพ์เลขบัตรในแชท)', null, 'success', 'userId=' + uid);
  log_('line_link', '', 'success', 'cid-chat cid …' + cid.slice(-4));
  var msgs = [helpMsg_('เชื่อมต่อสำเร็จ ✅\nต่อไปนี้ท่านจะได้รับแจ้งเตือนเมื่อสถานะผลงาน อวช. เปลี่ยน\nพิมพ์ "สถานะ" เพื่อดูสถานะล่าสุด หรือ "ถาม ..." เพื่อส่งคำถามถึงเจ้าหน้าที่' + (items.length ? '' : '\n\n(ยังไม่พบรายการยื่นผลงาน อวช. ของท่าน)'))];
  items.reverse().slice(0, 4).forEach(function (it) { msgs.push(safeFlex_(function (z) { return flexStatus_(z, 'สถานะผลงาน ' + z.id); }, it)); });
  lineReply_(ev.replyToken, msgs);
  return true;
}
/* ผูกในแชทโดยตรง (กรณีเพิ่มเพื่อนก่อนได้รับรหัส): เลขบัตร → ถามเลข 4 ตัวท้ายเบอร์โทร (ปัจจัยเดียวกับหน้าเว็บ) */
/* พิมพ์เลขบัตร 13 หลัก หรือรหัสเอกสาร (AWC-yyyymmdd-nnnn) → ตอบสถานะปัจจุบัน (ข้อมูลระดับเดียวกับหน้าติดตามสถานะที่เปิดสาธารณะ)
 * ถ้าบัญชี LINE นี้ยังไม่ผูก จะชวนผูกต่อด้วยเลข 4 ตัวท้ายเบอร์โทร */
function lineLookup_(ev, uid, mineCid, code, cid) {
  if (!rateOk_('lq_' + uid, 15, 600)) return lineReply_(ev.replyToken, [{ type: 'text', text: 'ค้นหาบ่อยเกินไป กรุณารอ 10 นาทีแล้วลองใหม่' }]);
  var items = [];
  if (code) { var one = findSub_(code); if (one) { items = [one]; cid = one.cid; } }
  else if (validCid_(cid)) items = subs_().filter(function (r) { return r.cid === cid; }).reverse().slice(0, 4);
  else return lineReply_(ev.replyToken, [helpMsg_('เลขบัตรประชาชนไม่ถูกต้อง ตรวจสอบตัวเลขอีกครั้ง')]);
  var hasPh = phonesOf_(cid).length, claimable = !mineCid && !code && lineEnabled_() && !hasPh && (!!staffByCid_(cid) || items.length > 0);   // เลขบัตรมีในระบบ แต่ไม่มีเบอร์ให้ยืนยัน → ส่งเป็นคำขอให้ HR อนุมัติ
  if (!items.length) {
    var known = cid && !code && !!staffByCid_(cid);
    if (claimable) { lineClaim_(uid, cid); return lineReply_(ev.replyToken, [helpMsg_(CLAIM_TXT_ + '\n\n(ยังไม่พบรายการยื่นผลงาน อวช. ของท่าน)')]); }
    return lineReply_(ev.replyToken, [helpMsg_(known ? 'พบข้อมูลของท่านในทะเบียน แต่ยังไม่พบรายการยื่นผลงาน อวช. หากยังไม่เคยยื่น ให้ยื่นเอกสารที่หน้าเว็บ' : 'ไม่พบข้อมูล กรุณาตรวจสอบเลขบัตรหรือรหัสเอกสารอีกครั้ง')]);
  }
  var msgs = items.map(function (it) { return safeFlex_(function (z) { return flexStatus_(z, 'สถานะผลงาน ' + z.id); }, it); });
  if (!mineCid && lineEnabled_()) {
    var tip;
    if (hasPh) { tip = 'ต้องการรับแจ้งเตือนอัตโนมัติเมื่อสถานะเปลี่ยน? พิมพ์เลข 4 ตัวท้ายของเบอร์โทรที่ลงทะเบียนไว้ (ภายใน 10 นาที)'; CacheService.getScriptCache().put('lw_' + uid, cid, 600); }
    else if (claimable) { lineClaim_(uid, cid); tip = CLAIM_TXT_; }
    else tip = 'ต้องการรับแจ้งเตือนอัตโนมัติ? ยังไม่มีเบอร์โทรในระบบ กรุณาแจ้งเจ้าหน้าที่ HR ให้ผูกบัญชี LINE นี้ให้';
    msgs.push(helpMsg_(tip));
  }
  lineLog_(items[0].id, cid, 'bot', '', 'ตอบสถานะจากการพิมพ์' + (code ? 'รหัสเอกสาร' : 'เลขบัตร') + ' ' + items.length + ' รายการ', null, 'sent', '');
  lineReply_(ev.replyToken, msgs);
}
/* เลขบัตรอยู่ในทะเบียน (allstaff หรือแท็บยื่นอวช) แต่ไม่มีเบอร์โทรให้ยืนยันตัวตน (เช่น ผู้ยื่นก่อนมีระบบ / ผูกด้วยเลขบัตรไม่ได้เพราะมี LINE อื่นผูกอยู่)
 * → ไม่ผูกอัตโนมัติ (กันผู้อื่นสวมรอย) แต่บันทึกเป็น "คำขอผูก" สถานะ claim ในแท็บ LinePending พร้อมเลขบัตรที่พิมพ์มา
 *   เจ้าหน้าที่เห็นที่แท็บ LINE → "เพิ่มเพื่อนแล้วแต่ยังไม่ผูก" ตรวจแล้วกด "อนุมัติ" ระบบผูกให้และส่งข้อความแจ้งผู้ใช้ (ไม่ต้องพิมพ์ซ้ำ) */
var CLAIM_TXT_ = 'ยังไม่มีเบอร์โทรของท่านในทะเบียน จึงยืนยันตัวตนอัตโนมัติไม่ได้\nระบบส่งคำขอผูกบัญชี LINE นี้ให้เจ้าหน้าที่ HR ตรวจสอบแล้ว เมื่อเจ้าหน้าที่ผูกให้ ท่านจะได้รับข้อความยืนยันที่นี่ ไม่ต้องพิมพ์ซ้ำ\nหากต้องการให้เร็วขึ้น แจ้งเจ้าหน้าที่ HR ว่าได้ส่งคำขอแล้ว';
function lineClaim_(uid, cid) {
  var pr = pendRow_(uid);
  pendUpsert_(uid, '', 'คำขอผูก: ' + maskT_(cid), 'claim', cid);
  if (!(pr && pr.st === 'claim' && pr.cid === cid)) lineLog_('', cid, 'link', '', 'ผู้ใช้ขอให้ HR ผูกบัญชี LINE (เลขบัตรอยู่ในทะเบียนแต่ไม่มีเบอร์โทรให้ยืนยัน)', null, 'info', 'userId=' + uid);
}
function pendRow_(uid) {
  try {
    var s = sheet_('LNP'), n = s.getLastRow(); if (n < 2) return null;
    var v = V_(s.getRange(2, 1, n - 1, 8));
    for (var i = 0; i < v.length; i++) if (str_(v[i][0]) === uid) return { row: i + 2, st: str_(v[i][4]), cid: digits_(v[i][5]), sent: str_(v[i][6]), cnt: parseInt(v[i][7], 10) || 0 };
  } catch (e) {}
  return null;
}
function lineVerifyPhone_(ev, uid, l4) {
  var c = CacheService.getScriptCache(), cid = c.get('lw_' + uid);
  if (!cid) return lineReply_(ev.replyToken, [helpMsg_('หมดเวลาแล้ว กรุณาพิมพ์เลขบัตรประชาชน 13 หลักใหม่อีกครั้ง')]);
  if (!rateOk_('lwr_' + uid, 8, 900)) return lineReply_(ev.replyToken, [{ type: 'text', text: 'ลองหลายครั้งเกินไป กรุณารอ 15 นาที หรือแจ้งเจ้าหน้าที่ HR ให้ผูกบัญชีให้' }]);
  if (!phonesOf_(cid).some(function (p) { return p.slice(-4) === l4; })) return lineReply_(ev.replyToken, [{ type: 'text', text: 'เลข 4 ตัวท้ายไม่ตรงกับในระบบ ลองพิมพ์ใหม่ได้ หรือแจ้งเจ้าหน้าที่ HR ให้ผูกให้' }]);
  c.remove('lw_' + uid);
  linkLine_(cid, uid, lineProfile_(uid), 'chat');
  lineLog_('', cid, 'link', '', 'ผูกบัญชี LINE สำเร็จ (ยืนยันในแชท)', null, 'success', '');
  log_('line_link', '', 'success', 'chat cid …' + cid.slice(-4));
  lineReply_(ev.replyToken, [helpMsg_('เชื่อมต่อสำเร็จ ✅\nต่อไปนี้ท่านจะได้รับแจ้งเตือนเมื่อสถานะผลงาน อวช. เปลี่ยน\nพิมพ์ "สถานะ" เพื่อดูสถานะล่าสุด หรือ "ถาม ..." เพื่อส่งคำถามถึงเจ้าหน้าที่')]);
}
function lineConsume_(ev, uid, code) {
  var c = CacheService.getScriptCache();
  if (!rateOk_('la_' + uid, 6, 600)) return lineReply_(ev.replyToken, [{ type: 'text', text: 'พิมพ์รหัสผิดหลายครั้ง กรุณารอ 10 นาทีแล้วลองใหม่' }]);
  var cid = c.get('lc_' + code);
  if (!cid) { log_('line_link', '', 'fail_code', 'รหัสไม่พบ/หมดอายุ uid …' + uid.slice(-4)); lineLog_('', '', 'link', '', 'พิมพ์รหัสผูกบัญชีแต่ไม่พบรหัสหรือหมดอายุ', null, 'fail', ''); }
  if (!cid) return lineReply_(ev.replyToken, [helpMsg_('รหัสไม่ถูกต้องหรือหมดอายุ (รหัสใช้ได้ 10 นาที) กรุณากดขอรหัสใหม่ที่หน้าเว็บ')]);
  linkLine_(cid, uid, lineProfile_(uid), 'code');
  c.remove('lc_' + code); c.put('lk_' + code, '1', 600);
  lineLog_('', cid, 'link', '', 'ผูกบัญชี LINE สำเร็จ (ผ่านรหัส)', null, 'success', '');
  log_('line_link', '', 'success', 'cid …' + cid.slice(-4));
  lineReply_(ev.replyToken, [helpMsg_('เชื่อมต่อสำเร็จ ✅\nต่อไปนี้ท่านจะได้รับแจ้งเตือนเมื่อสถานะผลงาน อวช. เปลี่ยน\nพิมพ์ "สถานะ" เพื่อดูสถานะล่าสุดได้ทุกเมื่อ')]);
}

/* "ถาม <ข้อความ>" ในแชท LINE → บันทึกลงแท็บ "ถามตอบ" (ช่องทาง line) ของรายการล่าสุดของผู้ยื่น เจ้าหน้าที่ตอบจากหน้าเว็บแล้วระบบส่งคำตอบกลับทาง LINE (apiQaReply_)
 * ใช้กติกาเดียวกับหน้าเว็บ (qaAdd_): 2-500 ตัวอักษร · รอตอบได้ไม่เกิน 3 ข้อความ · ส่งได้ 6 ครั้ง/ชั่วโมง */
function lineAskStaff_(ev, cid, text) {
  if (!cid) return lineReply_(ev.replyToken, [helpMsg_('ยังไม่ได้เชื่อมต่อบัญชี กรุณาพิมพ์เลขบัตรประชาชน 13 หลักที่นี่เพื่อเชื่อมต่อก่อน แล้วจึงพิมพ์ "ถาม ..." ได้')]);
  var q = String(text || '').trim();
  if (!q) return lineReply_(ev.replyToken, [helpMsg_('พิมพ์ "ถาม" ตามด้วยข้อความ เช่น\nถาม เอกสารเล่ม 2 ต้องส่งภายในวันที่เท่าไร\n(เฉพาะเรื่องสำคัญของรายการยื่นผลงานของท่าน)')]);
  var items = subs_().filter(function (r) { return r.cid === cid; });
  if (!items.length) return lineReply_(ev.replyToken, [helpMsg_('ยังไม่พบรายการยื่นผลงานของท่าน จึงยังส่งคำถามถึงเจ้าหน้าที่ไม่ได้')]);
  var open = items.filter(function (r) { return r.status !== 'cancelled'; }), it = (open.length ? open : items).slice(-1)[0];   // รายการล่าสุดที่ยังไม่ยกเลิก
  try { qaAdd_(it, 'applicant', (it.first + ' ' + it.last).trim(), q, 'line'); }
  catch (err) { return lineReply_(ev.replyToken, [helpMsg_(String(err.message || err))]); }
  log_('qa_ask', '', 'success', it.id + ' (LINE)');
  lineLog_(it.id, cid, 'bot', '', 'รับคำถามจาก LINE ส่งถึงเจ้าหน้าที่', null, 'sent', '');
  lineReply_(ev.replyToken, [helpMsg_('ส่งคำถามถึงเจ้าหน้าที่ HR แล้ว (รายการ ' + it.id + ')\nเจ้าหน้าที่จะตอบกลับทาง LINE นี้ · พิมพ์ "สถานะ" เพื่อดูความคืบหน้าระหว่างรอ')]);
}

/* ======================================================================
 *  LINE: ผู้ยื่น (สาธารณะ) — ขอรหัสผูกบัญชี
 * ====================================================================== */
function phonesOf_(cid) {
  var st = staffByCid_(cid);
  if (st) return digits_(st.phone).length >= 4 ? [digits_(st.phone)] : [];   // บุคลากรใน allstaff: ใช้เบอร์ในทะเบียนเท่านั้น (กันผู้อื่นยื่นเอกสารแล้วใส่เบอร์ตัวเองเพื่อผูก LINE แทน)
  var first = subs_().filter(function (r) { return r.cid === cid && digits_(r.phone).length >= 4; })[0];   // ไม่อยู่ใน allstaff: ใช้เบอร์จากการยื่นครั้งแรกเท่านั้น
  return first ? [digits_(first.phone)] : [];
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
  var acks = []; try { acks = ackRows_(1500).filter(function (r) { return r.sid === id; }).reverse().slice(0, 20).map(ackPub_); } catch (e) {}
  return { enabled: lineEnabled_(), linked: users.length, names: users.map(function (r) { return r.name || 'LINE'; }), log: log, status: cur.status, note: cur.note, acks: acks };
}
/* กดแจ้งเตือน: mode=status | text | action (การ์ด "ต้องดำเนินการ" + ปุ่มรับทราบ: p.title, p.items=[[ชื่อ,จำนวน]], p.due=yyyy-MM-dd, p.ack) + แนบไฟล์ได้ */
function apiLineSend_(token, id, p) {
  var u = auth_(token); p = p || {};
  var cur = findSub_(id);
  if (!cur) throw new Error('ไม่พบรายการ');
  var type = p.kind === 'manual' ? 'manual' : 'typed', mode = p.mode === 'status' ? 'status' : (p.mode === 'action' ? 'action' : 'text'), text = str_(p.text), act = null;
  if (mode === 'action') {
    act = ackClean_(p); type = 'manual';
    text = 'ต้องดำเนินการ: ' + act.title + ' (' + act.items.map(function (x) { return x[0] + (x[1] ? ' ' + x[1] : ''); }).join(', ') + ')';
  } else if (mode === 'text') { if (!text) throw new Error('กรุณาพิมพ์ข้อความ'); if (text.length > 1000) throw new Error('ข้อความยาวเกิน 1,000 ตัวอักษร'); }
  else if (mode === 'status') { type = 'manual'; text = 'ส่งสถานะปัจจุบัน: ' + stageLabel_(cur); }
  if (!rateOk_('ls_' + id, 10, 3600)) throw new Error('ส่งแจ้งเตือนรายการนี้ครบ 10 ครั้ง/ชั่วโมงแล้ว กรุณารอสักครู่');
  if (!rateOk_('ld_' + id + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text + (p.file && p.file.name || ''))).slice(0, 10), 1, 15)) throw new Error('ข้อความเดียวกันเพิ่งถูกส่งไป กรุณารอสักครู่');
  var pre = linePre_(cur.cid, id, type, u.n, text);
  if (!pre.ok) throw new Error(pre.msg);
  var up = (p.file && p.file.data) ? saveUpload_(p.file, LINE_EXT, true) : null;
  if (act && act.ack) { act.id = ackNewId_(); ackAdd_(act, cur, u.n); }   // บันทึกแถวก่อนส่ง เพื่อให้ปุ่มในการ์ดอ้างรหัสได้ทันที
  var msgs = [mode === 'status' ? flexStatus_(cur, 'แจ้งสถานะปัจจุบัน') : mode === 'action' ? safeFlex_(function (z) { return flexAction_(z, act); }, cur) : flexText_(cur, text)];
  if (up && up.shared) msgs.push(flexFile_(up));
  var r = lineSend_(pre.users, cur.cid, id, type, u.n, msgs, text, up);
  if (act && act.id && !r.sent) { try { var ar = ackRows_(50).filter(function (x) { return x.id === act.id; })[0]; if (ar) ackSet_(ar.row, 9, ACK_FAIL); } catch (e) {} }
  log_('line_send', u.u, r.sent ? 'success' : 'fail', id + ' ' + type + (up ? ' +file' : ''));
  if (!r.sent) throw new Error('ส่งไม่สำเร็จ: ' + (r.errors[0] || 'ไม่ทราบสาเหตุ'));
  return { sent: r.sent, failed: r.failed, ack: act && act.id || '', file: up ? { name: up.name, url: up.url, shared: up.shared } : null };
}
/* ภาพรวม LINE (ผู้ดูแลระบบ): ผู้ใช้ที่ผูกแล้ว + ประวัติการแจ้งเตือนทั้งหมด */
function apiLineAdmin_(token) {
  auth_(token, true);
  var users = lnuRows_().reverse().map(function (r) { return { cid: r.cid, uid: r.uid, name: r.name, at: r.at, via: r.via, active: r.active }; });
  return { enabled: lineEnabled_(), users: users, log: lnlRows_(500).reverse() };
}
/* จัดรูปแบบพื้นที่กดของ Rich Menu + ตรวจว่าระบบรู้จักคำสั่งหรือไม่ (ใช้กับแท็บ "ทดสอบ LINE") */
function richMenuRows_(m) {
  return (m.areas || []).map(function (a, i) {
    var ac = (a && a.action) || {}, k = str_(ac.type), val = '', intent = '', ok = false, tip = '';
    if (k === 'postback') { val = str_(ac.data); intent = lineIntent_(val); ok = !!intent; if (!ok) tip = 'ระบบไม่รู้จัก data นี้ — ตั้งเป็น action=status หรือ action=duration'; }
    else if (k === 'message') { val = str_(ac.text); intent = lineIntent_(val); ok = !!intent || /^(ช่วยเหลือ|ช่วยด้วย|วิธีใช้|วิธีเชื่อมต่อ|คู่มือ|help|manual|\?|ยกเลิกการผูก|ยกเลิก|unlink)$/i.test(val) || /^(?:ถาม|ask)/i.test(val); if (!ok) tip = 'ระบบไม่รู้จักข้อความนี้ — ตั้งเป็น "แจ้งสถานะปัจจุบัน" หรือ "ระยะเวลารวมปัจจุบัน"'; }
    else if (k === 'uri') { val = str_(ac.uri); ok = true; tip = 'เปิดลิงก์ (ไม่ส่งเหตุการณ์มาที่ระบบ)'; }
    else if (k === 'richmenuswitch') { val = str_(ac.richMenuAliasId); ok = true; tip = 'สลับเมนู'; }
    else { val = JSON.stringify(ac).slice(0, 80); }
    return { n: i + 1, label: str_(ac.label), kind: k, val: val, intent: intent, ok: ok, tip: tip };
  });
}
function apiLineCheck_(token, uid) {
  auth_(token, true);
  var out = { token: false, bot: null, error: '', webhookUrl: '', siteUrl: siteUrl_(), oaId: prop_('LINE_OA_ID'), lastHit: prop_('LINE_LAST_HIT'), endpoint: null, quota: null, richMenus: [], defaultMenu: '', userMenu: '' };
  try { out.webhookUrl = ScriptApp.getService().getUrl() + '?k=' + webhookKey_(); } catch (e) {}
  if (!lineEnabled_()) { out.error = 'ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN ใน Script Properties'; return out; }
  var r = lineCall_('get', '/v2/bot/info');
  if (r.ok) { out.token = true; out.bot = { name: str_(r.data.displayName), id: str_(r.data.basicId) }; } else { out.error = r.err; return out; }
  try {
    var e1 = lineCall_('get', '/v2/bot/channel/webhook/endpoint');
    if (e1.ok) out.endpoint = { url: str_(e1.data.endpoint), active: !!e1.data.active };
    var q = lineCall_('get', '/v2/bot/message/quota'), cu = lineCall_('get', '/v2/bot/message/quota/consumption');
    if (q.ok) out.quota = { type: str_(q.data.type), value: q.data.value === undefined ? null : q.data.value, used: cu.ok ? cu.data.totalUsage : null };
    var l = lineCall_('get', '/v2/bot/richmenu/list');
    if (l.ok) out.richMenus = (l.data.richmenus || []).map(function (m) { return { id: str_(m.richMenuId), name: str_(m.name), chatBar: str_(m.chatBarText), rows: richMenuRows_(m) }; });
    var d = lineCall_('get', '/v2/bot/user/all/richmenu'); out.defaultMenu = d.ok ? str_(d.data.richMenuId) : '';
    if (uid && /^U[0-9a-f]{32}$/i.test(uid)) { var um = lineCall_('get', '/v2/bot/user/' + uid + '/richmenu'); out.userMenu = um.ok ? str_(um.data.richMenuId) : ''; }
  } catch (ex) { out.diagErr = String(ex.message || ex).slice(0, 150); }
  return out;
}
/* ให้ LINE ยิง Webhook ทดสอบไปยัง URL ที่ตั้งไว้ (Vercel /api/line) แล้วรายงานผล */
function apiLineWebhookTest_(token) {
  auth_(token, true);
  if (!lineEnabled_()) throw new Error('ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN');
  var r = lineCall_('post', '/v2/bot/channel/webhook/test', {});
  if (!r.ok) throw new Error(r.err || 'ทดสอบ Webhook ไม่สำเร็จ');
  return { success: !!r.data.success, statusCode: r.data.statusCode, reason: str_(r.data.reason), detail: str_(r.data.detail) };
}
/* ===== แท็บ "ทดสอบ LINE" (ผู้ดูแลระบบ): ส่งข้อความทดสอบถึงบัญชีที่ผูกไว้ในแท็บ LineUsers ===== */
function apiLineTestInfo_(token) {
  auth_(token, true);
  var cnt = {}; subs_().forEach(function (x) { cnt[x.cid] = (cnt[x.cid] || 0) + 1; });
  return { enabled: lineEnabled_(), users: lnuRows_().reverse().map(function (r) { return { cid: r.cid, uid: r.uid, name: r.name, at: r.at, via: r.via, active: r.active, n: cnt[r.cid] || 0 }; }) };
}
var LT_MODE_ = { text: 'ข้อความตัวอักษร', action: 'การ์ดต้องดำเนินการ + ปุ่มรับทราบ (กดได้จริง)', status: 'การ์ดแจ้งสถานะปัจจุบัน', duration: 'การ์ดระยะเวลารวมปัจจุบัน', sim_status_pb: 'จำลองกดริชเมนู (postback) แจ้งสถานะปัจจุบัน', sim_status_msg: 'จำลองกดริชเมนู (ข้อความ) แจ้งสถานะปัจจุบัน', sim_duration_msg: 'จำลองกดริชเมนู ระยะเวลารวมปัจจุบัน', sim_help_msg: 'จำลองพิมพ์ ช่วยเหลือ' };
function apiLineTest_(token, p) {
  var u = auth_(token, true); p = p || {};
  if (!lineEnabled_()) throw new Error('ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN ใน Script Properties');
  var uid = str_(p.uid), mode = str_(p.mode);
  if (!LT_MODE_[mode]) throw new Error('ไม่รู้จักรูปแบบทดสอบ');
  var me = lnuRows_().filter(function (r) { return r.uid === uid && r.active; })[0];     // ส่งได้เฉพาะบัญชีที่ผูกไว้ในแท็บ LineUsers เท่านั้น
  if (!me) throw new Error('ไม่พบบัญชี LINE นี้ในแท็บ LineUsers (หรือถูกยกเลิกการผูกแล้ว)');
  if (!rateOk_('lt_' + u.u, 20, 600)) throw new Error('ทดสอบบ่อยเกินไป กรุณารอสักครู่');
  var cid = me.cid, t0 = Date.now(), note = '', steps = [], err = null;
  TESTCAP_ = [];
  try {
    if (mode === 'text') {
      var tx = str_(p.text);
      if (!tx) throw new Error('กรุณาพิมพ์ข้อความ');
      if (tx.length > 500) throw new Error('ข้อความยาวเกิน 500 ตัวอักษร');
      cap_('push', linePush_(uid, [{ type: 'text', text: '[ทดสอบ] ' + tx }]));
    } else if (mode === 'action') {
      /* การ์ด "ต้องดำเนินการ" ตัวอย่าง — ปุ่มรับทราบใช้งานได้จริง กดแล้วบันทึกลงแท็บ "รับทราบ" (หัวข้อขึ้นต้น [ทดสอบ] เพื่อแยกจากข้อความจริง) */
      var mine = subs_().filter(function (x) { return x.cid === cid; }).reverse()[0] || { id: 'ทดสอบ', cid: cid, prefix: '', first: me.name || 'ผู้ทดสอบ', last: '' };
      var tact = { title: '[ทดสอบ] ถ่ายสำเนาเอกสาร', items: [['เล่มบุคคล', '1 เล่ม'], ['เล่มผลงาน', '5 เล่ม'], ['เล่มแนวคิด', '5 เล่ม']], due: Utilities.formatDate(new Date(Date.now() + 7 * 864e5), TZ, 'yyyy-MM-dd'), ack: true, id: ackNewId_() };
      ackAdd_(tact, mine, u.n);
      cap_('push', linePush_(uid, [safeFlex_(function (z) { return flexAction_(z, tact); }, mine)]));
      note = 'ปุ่ม "รับทราบ" ในการ์ดใช้งานได้จริง — ลองกดในแชท LINE แล้วดูผลที่แท็บ "รับทราบ" ในชีท (รหัส ' + tact.id + ')';
    } else if (mode === 'status' || mode === 'duration') {
      var items = subs_().filter(function (x) { return x.cid === cid; }).reverse().slice(0, mode === 'status' ? 3 : 2), msgs;
      if (!items.length) { msgs = [{ type: 'text', text: '[ทดสอบ] บัญชีนี้ยังไม่มีรายการยื่นผลงาน อวช. — ระบบส่งข้อความถึงท่านได้ตามปกติ' }]; note = 'ผู้รับนี้ไม่มีรายการยื่นผลงาน จึงส่งข้อความธรรมดาแทนการ์ด'; }
      else msgs = items.map(function (x) { return safeFlex_(mode === 'status' ? flexCheck_ : flexDuration_, x); });
      cap_('push', linePush_(uid, msgs));
    } else {
      var ev = { type: 'message', mode: 'active', replyToken: '', source: { type: 'user', userId: uid }, message: { type: 'text', text: mode === 'sim_duration_msg' ? 'ระยะเวลารวมปัจจุบัน' : mode === 'sim_help_msg' ? 'ช่วยเหลือ' : 'แจ้งสถานะปัจจุบัน' } };
      if (mode === 'sim_status_pb') ev = { type: 'postback', mode: 'active', replyToken: '', source: { type: 'user', userId: uid }, postback: { data: 'action=status&src=admin_test' } };
      lineEvent_(ev);          // เดินเส้นทางเดียวกับที่ผู้ใช้กดริชเมนูจริง (ไม่มี replyToken จึงส่งผลทาง push)
      if (!TESTCAP_.length) note = 'ระบบไม่ได้ส่งข้อความตอบกลับ — ดูสาเหตุที่แท็บ "ประวัติการใช้งาน" (line_event / line_flex)';
    }
  } catch (e) { err = e; }
  steps = TESTCAP_ || []; TESTCAP_ = null;
  if (err) throw err;
  var ok = steps.some(function (x) { return x.ok; }), why = steps.filter(function (x) { return !x.ok; }).map(function (x) { return x.via + ': ' + x.err; }).join(' | ');
  lineLog_('', cid, 'test', u.n, 'ทดสอบ: ' + LT_MODE_[mode] + (mode === 'text' ? ' — ' + str_(p.text).slice(0, 80) : ''), null, ok ? 'sent' : 'failed', why.slice(0, 280));
  log_('line_test', u.u, ok ? 'success' : 'fail', mode + ' …' + uid.slice(-6));
  return { delivered: ok, ms: Date.now() - t0, mode: mode, name: me.name || 'LINE', note: note, steps: steps };
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
  var pr = pendRow_(uid), wasClaim = !!(pr && pr.st === 'claim' && pr.cid === cid);   // ผู้ใช้ส่งคำขอไว้ในแชท → แจ้งผลกลับ
  linkLine_(cid, uid, lineProfile_(uid), 'admin:' + u.u);
  lineLog_('', cid, 'link', u.n, wasClaim ? 'ผู้ดูแลอนุมัติคำขอผูกบัญชี' : 'ผู้ดูแลผูกบัญชีให้', null, 'success', '');
  log_('line_add', u.u, 'success', 'cid …' + cid.slice(-4));
  /* แจ้งผู้ยื่นทาง LINE ทุกครั้งที่ HR ผูกให้สำเร็จ (ทั้งอนุมัติคำขอและผูกให้เอง) — 1 ข้อความ นับโควตา push
   * แสดงเลขบัตรแบบปิดบัง เพื่อให้เจ้าของบัญชีทักท้วงได้ถ้า HR ผูกผิดคน (ไม่แสดงชื่อ เพื่อไม่เปิดเผยข้อมูลของผู้อื่นหากผูกผิด) */
  var notified = false, notifyErr = '';
  if (lineEnabled_()) {
    var r = linePush_(uid, [helpMsg_('เจ้าหน้าที่ HR ผูกบัญชี LINE นี้กับเลขบัตร ' + maskT_(cid) + ' เรียบร้อยแล้ว ✅\nต่อไปนี้ท่านจะได้รับแจ้งเตือนเมื่อสถานะผลงาน อวช. เปลี่ยน พิมพ์ \"สถานะ\" เพื่อดูสถานะล่าสุด\nหากไม่ใช่เลขบัตรของท่าน กรุณาแจ้งเจ้าหน้าที่ HR ทันที')]);
    notified = !!r.ok; if (!r.ok) notifyErr = ((r.err || ('HTTP ' + r.status)) + '').slice(0, 120);
    lineLog_('', cid, 'bot', u.n, 'แจ้งผู้ใช้ว่า HR ผูกบัญชีให้แล้ว', null, notified ? 'sent' : 'fail', notified ? 'userId=' + uid : notifyErr + ' userId=' + uid);
  }
  return { notified: notified, notifyErr: notifyErr };
}

/* ======================================================================
 *  ระบบสำรอง: รายชื่อผู้เพิ่มเพื่อน LINE ที่ยังไม่ผูก (เจ้าหน้าที่ผูกให้เอง) — เสนอชื่อผู้ยื่นที่น่าจะตรงจากชื่อ LINE
 * ====================================================================== */
function apiLinePending_(token) {
  auth_(token, true);
  var s = sheet_('LNP'), n = s.getLastRow(), v = n > 1 ? V_(s.getRange(2, 1, n - 1, 8)) : [], linked = {}, linkedUid = {};
  lnuRows_().forEach(function (r) { if (r.active) { linked[r.cid] = 1; linkedUid[r.uid] = 1; } });
  var cand = subs_().filter(function (r) { return !linked[r.cid]; });
  var rows = v.map(function (r) { return { uid: str_(r[0]), name: str_(r[1]), at: str_(r[2]), last: str_(r[3]), st: str_(r[4]), claimCid: digits_(r[5]), sent: str_(r[6]) }; })
    .filter(function (r) { return (r.st === 'pending' || r.st === 'claim') && !linkedUid[r.uid]; }).reverse().slice(0, 100);
  rows.sort(function (a, b) { return (a.st === 'claim' ? 0 : 1) - (b.st === 'claim' ? 0 : 1); });   // คำขอที่รอ HR อนุมัติขึ้นก่อน
  rows.forEach(function (r) {
    if (r.st === 'claim' && validCid_(r.claimCid)) {
      var sf = staffByCid_(r.claimCid), sb = sf ? null : subs_().filter(function (x) { return x.cid === r.claimCid; })[0];
      r.claim = { cid: r.claimCid, name: sf ? (sf.prefix + sf.first + ' ' + sf.last).trim() : (sb ? (sb.prefix + sb.first + ' ' + sb.last).trim() : ''), src: sf ? 'allstaff' : 'ยื่นอวช' };
    }
    delete r.claimCid;
    var nm = r.name.replace(/\s+/g, ''), seen = {}; r.cands = [];
    if (nm.length < 2) return;
    cand.forEach(function (c) { if (r.cands.length < 3 && !seen[c.cid] && ((c.first && nm.indexOf(c.first) > -1) || (c.last && nm.indexOf(c.last) > -1))) { seen[c.cid] = 1; r.cands.push({ cid: c.cid, name: c.prefix + c.first + ' ' + c.last, id: c.id }); } });
  });
  return { rows: rows };
}

/* ======================================================================
 *  แท็บ LINE (ผู้ดูแล): ส่งคู่มือเชื่อมต่อให้ผู้ที่เพิ่มเพื่อนแล้วแต่ยังไม่ผูก — รายคน หรือทั้งกลุ่ม
 *  - ส่งได้เฉพาะ LINE userId ในแท็บ LinePending (สถานะ pending/claim/dismissed) ที่ยังไม่ผูก และไม่ได้เลิกติดตาม
 *    ผู้ยื่นที่ยังไม่ได้เพิ่มเพื่อน LINE OA ไม่มี userId จึงส่งไม่ได้ (ต้องให้เพิ่มเพื่อนก่อน)
 *  - ส่ง 1 ข้อความ/คน (การ์ดคู่มือพร้อมข้อความนำ) นับโควตา push · ทั้งกลุ่ม: ข้ามคนที่เพิ่งส่งไปภายใน MANUAL_GAP_HOURS ชม. · ส่งไม่เกิน REMIND_MAX_PER_RUN คน/ครั้ง
 *    และไม่เกินโควตาที่เหลือของเดือน (อ่านจาก LINE) · บันทึกเวลาส่งล่าสุดไว้คอลัมน์ \"เตือนล่าสุด\" (ไม่นับเป็นจำนวนครั้งเตือนอัตโนมัติ)
 *  p = { uid } ส่งรายคน | { all: true } ส่งทั้งกลุ่ม (สถานะ pending เท่านั้น ไม่รวมคนที่รอ HR อนุมัติ) | เพิ่ม dry: true เพื่อดูจำนวนก่อน ไม่ส่งจริง
 * ====================================================================== */
var MANUAL_GAP_HOURS = 24;
var MANUAL_LEAD_ = 'บัญชี LINE นี้ยังไม่ได้เชื่อมต่อกับระบบติดตามสถานะ อวช. จึงยังไม่ได้รับแจ้งเตือนเมื่อสถานะผลงานเปลี่ยน เจ้าหน้าที่ HR ส่งคู่มือให้เพื่อเชื่อมต่อ';
function lineQuotaLeft_() {   // โควตา push ที่เหลือของเดือน (-1 = ไม่ทราบ/ไม่จำกัด)
  try {
    var q = lineCall_('get', '/v2/bot/message/quota'), cu = lineCall_('get', '/v2/bot/message/quota/consumption');
    if (q.ok && cu.ok && q.data.type === 'limited' && q.data.value !== undefined) return Math.max(0, q.data.value - (cu.data.totalUsage || 0));
  } catch (e) {}
  return -1;
}
function apiLineManual_(token, p) {
  var u = auth_(token, true); p = p || {};
  if (!lineEnabled_()) throw new Error('ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN ใน Script Properties');
  var one = str_(p.uid), all = !one, dry = !!p.dry;
  if (!all && !/^U[0-9a-f]{32}$/i.test(one)) throw new Error('LINE userId ไม่ถูกต้อง');
  var lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) throw new Error('มีงานส่งข้อความกำลังทำงานอยู่ กรุณารอสักครู่แล้วลองใหม่');
  try {
    var s = sheet_('LNP'), n = s.getLastRow(), linked = {}, now = Date.now(), rows = [];
    lnuRows_().forEach(function (r) { if (r.active) linked[r.uid] = 1; });
    if (n > 1) V_(s.getRange(2, 1, n - 1, 8)).forEach(function (r, i) {
      var uid = str_(r[0]), st = str_(r[4]);
      if (!/^U[0-9a-f]{32}$/i.test(uid) || linked[uid] || st === 'linked' || st === 'unfollow') return;
      if (all ? st !== 'pending' : uid !== one) return;
      var last = Date.parse(str_(r[6]).replace(' ', 'T') + '+07:00');
      if (all && !isNaN(last) && now - last < MANUAL_GAP_HOURS * 36e5) return;
      rows.push({ row: i + 2, uid: uid });
    });
    if (!all && !rows.length) throw new Error('ไม่พบบัญชี LINE นี้ในรายชื่อที่ยังไม่ผูก (อาจผูกแล้ว หรือเลิกติดตาม/บล็อกแล้ว)');
    if (!all && !rateOk_('lm_' + one, 3, 3600)) throw new Error('ส่งคู่มือให้บัญชีนี้ครบ 3 ครั้ง/ชั่วโมงแล้ว กรุณารอสักครู่');
    var left = lineQuotaLeft_(), todo = rows.slice(0, all ? REMIND_MAX_PER_RUN : 1), out = { eligible: rows.length, sent: 0, failed: 0, quotaLeft: left, more: Math.max(0, rows.length - todo.length), dry: dry };
    if (left >= 0 && todo.length > left) { out.limited = todo.length - left; todo = todo.slice(0, left); }
    out.willSend = todo.length;
    if (dry) return out;
    if (!all && !todo.length) throw new Error('โควตาข้อความ LINE ของเดือนนี้หมดแล้ว');
    var firstErr = '';
    for (var i = 0; i < todo.length; i++) {
      var t = todo[i], r = linePush_(t.uid, [manualMsg_(MANUAL_LEAD_)]);
      if (r.ok) {
        out.sent++; var rg = s.getRange(t.row, 7); fmt_(rg, '@'); rg.setValue(now_());
        lineLog_('', '', 'bot', u.n, 'ผู้ดูแลส่งคู่มือเชื่อมต่อ LINE ให้ผู้ที่ยังไม่ผูก', null, 'sent', 'userId=' + t.uid);
      } else {
        out.failed++; firstErr = firstErr || ((r.err || ('HTTP ' + r.status)) + '').slice(0, 150);
        lineLog_('', '', 'bot', u.n, 'ผู้ดูแลส่งคู่มือเชื่อมต่อ LINE ไม่สำเร็จ', null, 'fail', firstErr + ' userId=' + t.uid);
        if (r.status === 429) break;   // โควตาหมด หยุดทันที
      }
    }
    out.err = firstErr;
    log_('line_manual', u.u, out.sent ? 'success' : 'fail', (all ? 'ทั้งกลุ่ม' : 'รายคน') + ' ส่ง ' + out.sent + ' / ไม่สำเร็จ ' + out.failed);
    if (!all && !out.sent) throw new Error('ส่งไม่สำเร็จ: ' + (firstErr || 'ไม่ทราบสาเหตุ'));
    return out;
  } finally { lock.releaseLock(); }
}
/* ไม่อนุมัติ/ซ่อนรายการในรายชื่อรอผูก (เช่น คำขอที่ชื่อไม่ตรง) — ไม่ลบข้อมูล ตั้งสถานะ dismissed ผู้ใช้พิมพ์เลขบัตรใหม่ภายหลังจะกลับมาเป็นคำขอได้ */
function apiLineDismiss_(token, uid) {
  var u = auth_(token, true); uid = str_(uid);
  var pr = pendRow_(uid); if (!pr) throw new Error('ไม่พบรายการนี้');
  pendUpsertNow_(uid, '', null, 'dismissed', '');
  lineLog_('', pr.cid, 'link', u.n, 'ผู้ดูแลไม่อนุมัติ/ซ่อนคำขอผูกบัญชี', null, 'info', 'userId=' + uid);
  log_('line_dismiss', u.u, 'success', 'uid …' + uid.slice(-6));
  return {};
}

/* ======================================================================
 *  ส่งข้อความเตือน "ผู้ที่เพิ่มเพื่อน LINE แล้วแต่ยังไม่ได้ผูก / ผูกไม่สำเร็จ" พร้อมแนบคู่มือ
 *  ข้อความบอกว่า: 1) พิมพ์เลขบัตรประชาชน 13 หลักในแชทก่อน  2) ถ้าไม่ได้ ให้ไปรับรหัส 6 หลักที่เว็บ  (+ การ์ดคู่มือ)
 *  ใช้งาน (รันจาก Apps Script editor):
 *    remindUnlinkedDryRun()   ดูก่อนว่าจะส่งถึงกี่คน (ไม่ส่งจริง)
 *    remindUnlinked()         ส่งจริง (ครั้งละไม่เกิน REMIND_MAX_PER_RUN คน)
 *    installRemindTrigger()   ตั้งให้รันเองทุกวันจันทร์ 09:00 · removeRemindTrigger() ยกเลิก
 *  หมายเหตุ: ข้อความแบบ Push นับโควตา LINE OA (แผนฟรีของ OA นี้ 300 ข้อความ/เดือน — ดูค่าจริงที่แท็บ "ตรวจสอบการเชื่อมต่อ") จึงจำกัดจำนวนครั้ง/คน และไม่ส่งซ้ำถี่
 * ====================================================================== */
var REMIND_MIN_HOURS = 2;       // เพิ่มเพื่อนแล้วอย่างน้อยกี่ชั่วโมงจึงเตือน (ให้เวลาทำตามข้อความต้อนรับก่อน)
var REMIND_GAP_DAYS = 3;        // เตือนซ้ำได้ไม่ถี่กว่ากี่วัน
var REMIND_MAX_TIMES = 2;       // เตือนได้มากสุดกี่ครั้งต่อบัญชี LINE
var REMIND_MAX_PER_RUN = 50;    // ส่งสูงสุดกี่คนต่อการรัน 1 ครั้ง (กันโควตาหมด)
function remindText_(tried) {
  var site = siteUrl_().replace(/\/+$/, '');
  return (tried ? 'ดูเหมือนการเชื่อมต่อ LINE ยังไม่สำเร็จ' : 'บัญชี LINE นี้ยังไม่ได้เชื่อมต่อกับระบบติดตามสถานะ อวช.') +
    ' จึงยังไม่ได้รับแจ้งเตือนเมื่อสถานะผลงานเปลี่ยน\n\nวิธีเชื่อมต่อ (เลือกวิธีใดวิธีหนึ่ง)\n' +
    '1) พิมพ์เลขบัตรประชาชน 13 หลักของท่านที่นี่ในแชทนี้ก่อน ระบบเชื่อมต่อให้ทันที (ต้องเคยยื่นเอกสารในระบบแล้ว)\n' +
    '2) ถ้าเชื่อมต่อด้วยเลขบัตรไม่ได้ ให้ไปรับรหัสในระบบเอง: เปิด ' + site + ' → ติดตามสถานะ → กด "เชื่อมต่อ LINE" รับรหัส 6 หลัก แล้วพิมพ์รหัสที่นี่\n\n' +
    'ดูคู่มือภาพประกอบได้ที่การ์ดด้านล่าง หากยังไม่สำเร็จ พิมพ์ "ช่วยเหลือ" หรือแจ้งเจ้าหน้าที่ HR ให้ผูกให้ได้';
}
function remindUnlinked_(dry) {
  if (!lineEnabled_()) return { ok: false, err: 'ยังไม่ได้ตั้งค่า LINE (LINE_CHANNEL_ACCESS_TOKEN)' };
  var lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) return { ok: false, err: 'มีงานส่งข้อความเตือนกำลังทำงานอยู่' };
  try {
    var s = sheet_('LNP'), n = s.getLastRow(); if (n < 2) return { ok: true, eligible: 0, sent: 0, failed: 0, dry: !!dry };
    var linked = {}; lnuRows_().forEach(function (r) { if (r.active) linked[r.uid] = 1; });
    var v = V_(s.getRange(2, 1, n - 1, 8)), now = Date.now(), todo = [];
    v.forEach(function (r, i) {
      var uid = str_(r[0]), st = str_(r[4]); if (!uid || st !== 'pending' || linked[uid]) return;     // เฉพาะที่ยังไม่ผูก (ไม่รวมผูกแล้ว/เลิกติดตาม)
      var added = Date.parse(str_(r[2]).replace(' ', 'T') + '+07:00'), last = Date.parse(str_(r[6]).replace(' ', 'T') + '+07:00'), cnt = parseInt(r[7], 10) || 0;
      if (cnt >= REMIND_MAX_TIMES) return;
      if (!isNaN(added) && now - added < REMIND_MIN_HOURS * 36e5) return;
      if (!isNaN(last) && now - last < REMIND_GAP_DAYS * 864e5) return;
      todo.push({ row: i + 2, uid: uid, tried: !!str_(r[3]), cnt: cnt });
    });
    var out = { ok: true, eligible: todo.length, sent: 0, failed: 0, dry: !!dry, left: Math.max(0, todo.length - REMIND_MAX_PER_RUN) };
    if (dry) return out;
    todo.slice(0, REMIND_MAX_PER_RUN).forEach(function (t) {
      var r = linePush_(t.uid, [{ type: 'text', text: remindText_(t.tried) }, manualMsg_()]);
      if (r.ok) {
        out.sent++;
        var rg = s.getRange(t.row, 7, 1, 2); fmt_(rg, '@'); rg.setValues([[now_(), String(t.cnt + 1)]]);
        lineLog_('', '', 'bot', 'ระบบ', 'ส่งข้อความเตือนให้เชื่อมต่อ LINE + คู่มือ (ครั้งที่ ' + (t.cnt + 1) + ')', null, 'sent', 'userId=' + t.uid);
      } else {
        out.failed++;
        lineLog_('', '', 'bot', 'ระบบ', 'ส่งข้อความเตือนให้เชื่อมต่อ LINE ไม่สำเร็จ', null, 'fail', ((r.err || ('HTTP ' + r.status)) + '').slice(0, 150) + ' userId=' + t.uid);
      }
    });
    log_('line_remind', '', 'success', 'ส่ง ' + out.sent + ' / ไม่สำเร็จ ' + out.failed + ' / ผู้มีสิทธิ์ ' + out.eligible);
    return out;
  } finally { lock.releaseLock(); }
}
function remindUnlinkedDryRun() { var r = remindUnlinked_(true); Logger.log('ทดสอบ (ยังไม่ส่งจริง): ' + JSON.stringify(r)); return r; }
function remindUnlinked() { return sandRun_('เตือนผู้ยังไม่ผูก LINE', remindUnlinkedMain_); }
function remindUnlinkedMain_() { var r = remindUnlinked_(false); Logger.log('ผลการส่ง: ' + JSON.stringify(r)); return r; }
function installRemindTrigger() {
  removeRemindTrigger();
  ScriptApp.newTrigger('remindUnlinked').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).inTimezone(TZ).create();
  Logger.log('ตั้งเวลาแล้ว: ส่งข้อความเตือนทุกวันจันทร์ 09:00 (ไทย)');
}
function removeRemindTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'remindUnlinked') ScriptApp.deleteTrigger(t); });
}

/* ======================================================================
 *  ติดตั้ง / ตรวจสอบ LINE  (รันจากตัวแก้ไข Apps Script แล้วดู Execution log)
 *    1) setupLine()      สร้างรหัสลับ LINE_WEBHOOK_KEY และบอกค่าที่ต้องตั้งใน Vercel / LINE
 *    2) lineDiag()       ตรวจทั้งเส้นทาง LINE → Vercel → Apps Script → LINE (ใช้ทุกครั้งที่ "กดเมนูแล้วเงียบ")
 *    3) setupRichMenu()  (ไม่บังคับ) สร้างริชเมนูจากโค้ด 2 ปุ่ม แล้วตั้งเป็นเมนูเริ่มต้นของทุกคน
 * ====================================================================== */
function setupLine() {
  var key = webhookKey_();
  var gas = ScriptApp.getService().getUrl().replace(/\/a\/macros\/[^\/]+\/s\//, '/macros/s/');   // ใช้รูปแบบมาตรฐาน /macros/s/<ID>/exec (รูปแบบ /a/macros/โดเมน/ มักถูกขอให้ล็อกอิน → HTTP 401)
  Logger.log('LINE_WEBHOOK_KEY = ' + key + '  (ยาว ' + key.length + ' ตัว — ต้องเป็น 32)');
  Logger.log('── ค่าที่ต้องตั้งใน Vercel → Settings → Environment Variables (แล้ว Redeploy) ──');
  Logger.log('LINE_CHANNEL_SECRET = <Channel secret จาก LINE Developers → Basic settings>');
  Logger.log('LINE_WEBHOOK_KEY     = ' + key);
  Logger.log('GAS_WEBHOOK_URL      = ' + gas + '   (ไม่บังคับ ถ้าไม่ตั้งระบบใช้ลิงก์ในโค้ด api/line.js)');
  Logger.log('── LINE Developers → Messaging API → Webhook URL = https://<โดเมน Vercel>/api/line  แล้วกด Verify และเปิด "Use webhook" ──');
  Logger.log('ต่อไปให้รัน lineDiag() เพื่อตรวจทั้งเส้นทาง');
  return key;
}
function testWebhook() { return lineDiag(); }   // ชื่อเดิม (เรียกแทนกันได้)
function lineDiag() {
  var out = [], bad = 0;
  function ok(s) { out.push('✅ ' + s); }
  function no(s) { out.push('❌ ' + s); bad++; }
  function info(s) { out.push('ℹ️ ' + s); }
  var key = prop_('LINE_WEBHOOK_KEY');
  if (!lineEnabled_()) { no('ยังไม่ได้ตั้ง Script Property LINE_CHANNEL_ACCESS_TOKEN (Project Settings → Script Properties)'); Logger.log(out.join('\n')); return out; }
  ok('มี LINE_CHANNEL_ACCESS_TOKEN');
  if (key.length === 32 && key === key.trim()) ok('LINE_WEBHOOK_KEY ถูกต้อง (32 ตัว)'); else no('LINE_WEBHOOK_KEY ไม่พร้อม (ยาว ' + key.length + ' ตัว หรือมีช่องว่างซ่อน) → รัน setupLine()');
  var r = lineCall_('get', '/v2/bot/info');
  if (r.ok) ok('Token ใช้ได้ — บัญชี: ' + str_(r.data.displayName) + ' ' + str_(r.data.basicId)); else { no('Token ใช้ไม่ได้: ' + r.err); Logger.log(out.join('\n')); return out; }
  var ep = lineCall_('get', '/v2/bot/channel/webhook/endpoint'), vurl = '';
  if (ep.ok) {
    vurl = str_(ep.data.endpoint);
    if (!vurl) no('ยังไม่ได้ตั้ง Webhook URL ใน LINE Developers');
    else { ok('Webhook URL ใน LINE = ' + vurl); if (!/\/api\/line\/?$/.test(vurl)) no('Webhook URL ต้องลงท้ายด้วย /api/line (ชี้ไป Vercel ไม่ใช่ลิงก์ script.google.com)'); }
    if (ep.data.active) ok('เปิด "Use webhook" แล้ว'); else no('ยังไม่ได้เปิด "Use webhook" (LINE Developers → Messaging API)');
  } else no('อ่าน Webhook URL ไม่ได้: ' + ep.err);
  var t = lineCall_('post', '/v2/bot/channel/webhook/test', {});
  if (t.ok && t.data.success) ok('LINE ยิงทดสอบถึง Vercel ได้ (HTTP ' + t.data.statusCode + ')');
  else no('LINE ยิงทดสอบไป Vercel ไม่สำเร็จ: ' + (t.ok ? (t.data.reason + ' / HTTP ' + t.data.statusCode + ' ' + str_(t.data.detail)) : t.err) + '  → ดูข้อ "ตรวจ Vercel" ในคู่มือ LINE-SETUP.md');
  if (vurl) {
    try {
      var g = UrlFetchApp.fetch(vurl + (vurl.indexOf('?') < 0 ? '?probe=1' : '&probe=1'), { muteHttpExceptions: true, followRedirects: true }), j = {};
      try { j = JSON.parse(g.getContentText()); } catch (x) {}
      if (g.getResponseCode() !== 200) no('Vercel /api/line ตอบ HTTP ' + g.getResponseCode() + ' (ยังไม่ได้ deploy ไฟล์ api/line.js ?)');
      else {
        if (j.LINE_CHANNEL_SECRET) ok('Vercel มี LINE_CHANNEL_SECRET'); else no('Vercel ยังไม่ได้ตั้ง LINE_CHANNEL_SECRET (ตั้งแล้วต้อง Redeploy)');
        if (j.keyFound) ok('Vercel มีรหัส k (ที่มา ' + j.keySource + ', ' + j.keyLength + ' ตัว)'); else no('Vercel ไม่มีรหัส k: ' + str_(j.problem));
        if (j.gas && j.gas.ok) ok('Vercel เรียก Apps Script ผ่านและรหัส k ตรงกัน'); else no('Vercel เรียก Apps Script ไม่ผ่าน: ' + JSON.stringify(j.gas || {}) + '  (รหัส k ไม่ตรง / ยังไม่ Deploy เวอร์ชันใหม่ / Web App ไม่ได้ตั้ง Anyone)');
      }
    } catch (fe) { no('เรียก Vercel ไม่ได้: ' + String(fe.message || fe).slice(0, 150)); }
  }
  var hit = prop_('LINE_LAST_HIT');
  if (hit) info('เหตุการณ์ LINE ล่าสุดที่ Apps Script ได้รับ: ' + hit + '  (ถ้ากดเมนูแล้วเวลานี้ไม่เปลี่ยน แปลว่าการกดไม่ถึง Apps Script)'); else info('ยังไม่เคยมีเหตุการณ์จริงจาก LINE มาถึง Apps Script เลย');
  var q = lineCall_('get', '/v2/bot/message/quota'), cu = lineCall_('get', '/v2/bot/message/quota/consumption');
  if (q.ok) info('โควตา Push: ' + str_(q.data.type) + ' ' + (q.data.value === undefined ? '-' : q.data.value) + ' ข้อความ/เดือน, ใช้ไปแล้ว ' + (cu.ok ? cu.data.totalUsage : '?') + ' (Reply ไม่นับโควตา)');
  var l = lineCall_('get', '/v2/bot/richmenu/list'), d = lineCall_('get', '/v2/bot/user/all/richmenu');
  if (l.ok && (l.data.richmenus || []).length) {
    (l.data.richmenus || []).forEach(function (m) {
      richMenuRows_(m).forEach(function (a) { (a.ok ? ok : no)('ริชเมนู "' + str_(m.name) + '" ปุ่ม ' + a.n + ': ' + a.kind + ' = ' + a.val + (a.tip ? '  [' + a.tip + ']' : '')); });
    });
    info('ริชเมนูเริ่มต้น (ผ่าน API) = ' + (d.ok ? str_(d.data.richMenuId) : 'ไม่มี'));
  } else info('ไม่พบริชเมนูที่สร้างผ่าน API — ถ้าสร้างไว้ใน LINE OA Manager ต้องเปิดดูปุ่มแต่ละปุ่มว่าประเภท = "ข้อความ" และพิมพ์ตรง (ดู LINE-SETUP.md) หรือรัน setupRichMenu() เพื่อสร้างจากโค้ด');
  out.push(bad ? '— พบ ' + bad + ' จุดที่ต้องแก้ (บรรทัด ❌) —' : '— เส้นทางปกติทุกจุด —');
  Logger.log(out.join('\n')); return out;
}

/* ===== ริชเมนูจากโค้ด (ไม่บังคับ) =====
 * 2 ปุ่ม: แจ้งสถานะปัจจุบัน (postback action=status) | ระยะเวลารวมปัจจุบัน (postback action=duration)
 * postback ไม่ไปกระตุ้น "ข้อความตอบกลับอัตโนมัติ" ของ LINE OA และแสดงข้อความในแชทของผู้ใช้ด้วย displayText
 * ภาพเมนูอ่านจาก <SITE_URL>/assets/richmenu.png (2500×843 พิกเซล ไฟล์ < 1 MB) — ต้อง deploy ไฟล์นี้ขึ้น Vercel ก่อน */
var RICH_MENU_BTNS = [
  { label: 'แจ้งสถานะปัจจุบัน', data: 'action=status', text: 'แจ้งสถานะปัจจุบัน' },
  { label: 'ระยะเวลารวมปัจจุบัน', data: 'action=duration', text: 'ระยะเวลารวมปัจจุบัน' }
];
function richMenuSpec_() {
  var w = 2500, h = 843, n = RICH_MENU_BTNS.length, bw = Math.floor(w / n);
  return { size: { width: w, height: h }, selected: true, name: 'อวช-สถานะ v1', chatBarText: 'เมนูติดตามสถานะ อวช.',
    areas: RICH_MENU_BTNS.map(function (b, i) {
      return { bounds: { x: i * bw, y: 0, width: i === n - 1 ? w - i * bw : bw, height: h }, action: { type: 'postback', label: b.label, data: b.data, displayText: b.text } };
    }) };
}
function setupRichMenu() {
  if (!lineEnabled_()) throw new Error('ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN');
  var tk = prop_('LINE_CHANNEL_ACCESS_TOKEN'), imgUrl = siteUrl_().replace(/\/+$/, '') + '/assets/richmenu.png';
  var img = UrlFetchApp.fetch(imgUrl, { muteHttpExceptions: true });
  if (img.getResponseCode() !== 200) throw new Error('ดึงภาพริชเมนูไม่ได้ (HTTP ' + img.getResponseCode() + ') ที่ ' + imgUrl + ' — ต้อง deploy assets/richmenu.png ขึ้น Vercel ก่อน');
  var bytes = img.getBlob().getBytes();
  if (bytes.length > 1024 * 1024) throw new Error('ภาพริชเมนูใหญ่เกิน 1 MB');
  var c = lineCall_('post', '/v2/bot/richmenu', richMenuSpec_());
  if (!c.ok || !c.data.richMenuId) throw new Error('สร้างริชเมนูไม่สำเร็จ: ' + c.err);
  var id = c.data.richMenuId;
  var up = UrlFetchApp.fetch('https://api-data.line.me/v2/bot/richmenu/' + id + '/content', { method: 'post', contentType: 'image/png', payload: bytes, headers: { Authorization: 'Bearer ' + tk }, muteHttpExceptions: true });
  if (up.getResponseCode() !== 200) { lineCall_('delete', '/v2/bot/richmenu/' + id); throw new Error('อัปโหลดภาพไม่สำเร็จ: HTTP ' + up.getResponseCode() + ' ' + up.getContentText().slice(0, 150)); }
  var df = lineCall_('post', '/v2/bot/user/all/richmenu/' + id);
  if (!df.ok) throw new Error('ตั้งเป็นเมนูเริ่มต้นไม่สำเร็จ: ' + df.err);
  Logger.log('สร้างริชเมนูสำเร็จ id=' + id + ' และตั้งเป็นเมนูเริ่มต้นของทุกคนแล้ว (ผู้ใช้อาจต้องปิด-เปิดแชทเพื่อเห็นเมนูใหม่)');
  return id;
}
/* ลบริชเมนูทั้งหมดที่สร้างผ่าน API (ไม่แตะเมนูที่สร้างใน OA Manager) — รันเมื่อต้องการสร้างใหม่ */
function removeApiRichMenus() {
  var l = lineCall_('get', '/v2/bot/richmenu/list'), n = 0;
  if (!l.ok) throw new Error(l.err);
  (l.data.richmenus || []).forEach(function (m) { if (lineCall_('delete', '/v2/bot/richmenu/' + m.richMenuId).ok) n++; });
  Logger.log('ลบริชเมนู ' + n + ' รายการ'); return n;
}