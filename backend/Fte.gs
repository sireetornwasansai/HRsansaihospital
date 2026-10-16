/* =====================================================================
 * Fte.gs — ระบบอัตรากำลัง (FTE) เดิม รวมเข้าโปรเจกต์เดียวกับระบบ อวช.
 * - โค้ดเดิมไม่ถูกแก้ไข ยกเว้นเปลี่ยนชื่อ doGet → fteDoGet_ (ไม่ใช้งานแล้ว เพราะหน้าเว็บย้ายไป Vercel: /fte/)
 * - หน้าเว็บ FTE เรียกฟังก์ชัน api_* ผ่าน doPost ใน Code.gs (ดู fteApi_ ด้านล่าง) แทน google.script.run
 * - ใช้ Script Properties และ Spreadsheet (SPREADSHEET_ID) ชุดเดียวกับระบบ อวช.
 * ===================================================================== */
/** รายการฟังก์ชัน api_* ที่เปิดให้หน้าเว็บเรียก (สร้างตอนเรียกใช้ เพื่อไม่ขึ้นกับลำดับการโหลดไฟล์) */
function fteApi_() {
  return {
    api_adminAddStaff: api_adminAddStaff,
    api_adminDeleteStaff: api_adminDeleteStaff,
    api_adminGetConsistencyChecks: api_adminGetConsistencyChecks,
    api_adminGetData: api_adminGetData,
    api_adminGetDataQuality: api_adminGetDataQuality,
    api_adminGetDetailRows: api_adminGetDetailRows,
    api_adminGetFullReport: api_adminGetFullReport,
    api_adminGetNameByDetailId: api_adminGetNameByDetailId,
    api_adminGetStaffForUnit: api_adminGetStaffForUnit,
    api_adminGetStaffingSummary: api_adminGetStaffingSummary,
    api_adminGetTransferRequests: api_adminGetTransferRequests,
    api_adminLogin: api_adminLogin,
    api_adminLogout: api_adminLogout,
    api_adminMarkDataUpdated: api_adminMarkDataUpdated,
    api_adminSetSiteInfo: api_adminSetSiteInfo,
    api_adminUpdateStaff: api_adminUpdateStaff,
    api_adminUpdateTransferStatus: api_adminUpdateTransferStatus,
    api_adminVerifySession: api_adminVerifySession,
    api_getAnalytics: api_getAnalytics,
    api_getBreakdownByDimension: api_getBreakdownByDimension,
    api_getEmploymentTypeAnalytics: api_getEmploymentTypeAnalytics,
    api_getFilterOptions: api_getFilterOptions,
    api_getFilteredBreakdown: api_getFilteredBreakdown,
    api_getGroupDetailBreakdown: api_getGroupDetailBreakdown,
    api_getGroupStructTree: api_getGroupStructTree,
    api_getLevelAnalytics: api_getLevelAnalytics,
    api_getMissionGroupAnalytics: api_getMissionGroupAnalytics,
    api_getPositionByGroupAnalysis: api_getPositionByGroupAnalysis,
    api_getPositionDetailBreakdown: api_getPositionDetailBreakdown,
    api_getPositionEmployAnalysis: api_getPositionEmployAnalysis,
    api_getProfSupportOverview: api_getProfSupportOverview,
    api_getProfessionalPositionBreakdown: api_getProfessionalPositionBreakdown,
    api_getPublicData: api_getPublicData,
    api_getReconciliation: api_getReconciliation,
    api_getReportAnalytics: api_getReportAnalytics,
    api_getRequestFormGroupOptions: api_getRequestFormGroupOptions,
    api_getSiteInfo: api_getSiteInfo,
    api_getSupportPositionBreakdown: api_getSupportPositionBreakdown,
    api_getVisitCount: api_getVisitCount,
    api_getVisitCountReadOnly: api_getVisitCountReadOnly,
    api_submitTransferRequest: api_submitTransferRequest,
    api_visitorEnter: api_visitorEnter
  };
}

/* ============================== CHANGELOG — ฉบับแก้ความสอดคล้องจำนวนบุคลากร ==============================
 * 1) นิยาม "นับคน" ฉบับเดียว จากคอลัมน์ สถานะ (0-5) ของชีท allstaff — ดู ONSITE_STATUS_CODES
 *    ทุกมุมมอง/กราฟ/รายงานนับ "ผู้ปฏิบัติงานจริง" = สถานะ 1 + 3 เท่ากันหมด (เดิม 791 บ้าง 864 บ้าง)
 * 2) เลิกตัดแถวด้วย regex ชื่อ รพ.อื่น (เดิมตัด 13 แถว: ไปช่วย 6 + มาช่วย 6 + สังกัดอื่น 1) และเลิกกรองสังกัดเฉพาะบางหน้า
 * 3) แก้การแมปคอลัมน์ที่สลับกัน: PROF_SUPPORT=11 (ข้อความ), CATEGORY=12 (รหัส 1-5) — เดิมกราฟสายวิชาชีพ/สนับสนุนว่าง
 * 4) รวมกลุ่มงานที่สะกดผิด/เป็นชื่อหน่วยงานภายนอก (normalizeGroupLabel_) ไม่ให้เกิดกลุ่มงานปลอม
 * 5) เพิ่ม api_getReconciliation / api_adminGetConsistencyChecks / api_adminGetDataQuality
 * 6) ลบ api_getPositionByGroupAnalysis ที่ประกาศซ้ำ
 * ============================================================================================== */

/**
 * ระบบแสดงอัตรากำลัง (FTE) โรงพยาบาล
 * Backend: Google Apps Script
 *
 * ----------------------------------------------------------------
 * การตั้งค่า (ตั้งค่าครั้งเดียวหลัง deploy) — ทำผ่าน
 *   Apps Script Editor > Project Settings (รูปเฟือง) > Script Properties
 * ----------------------------------------------------------------
 *   SPREADSHEET_ID     = รหัส Google Sheet ที่เก็บข้อมูล (ดูจาก URL ของชีท)
 *   ADMIN_PASSWORD     = รหัสผ่านสำหรับผู้ดูแลระบบ (ตั้งเอง)
 *   HOSPITAL_NAME      = ชื่อโรงพยาบาล (ไม่ตั้งก็ได้ มีค่าเริ่มต้นให้)
 *   HOSPITAL_SUBTITLE  = คำอธิบายใต้ชื่อ (ไม่ตั้งก็ได้)
 *
 * รหัสผ่าน/รหัสชีทจะไม่ปรากฏอยู่ในซอร์สโค้ดนี้เลย ถูกเก็บแยกไว้ใน
 * Script Properties ของโปรเจกต์เท่านั้น ผู้ที่ไม่มีสิทธิ์แก้ไข
 * โปรเจกต์ Apps Script จะไม่สามารถเห็นค่าดังกล่าวได้
 *
 * ----------------------------------------------------------------
 * PDPA — แท็บ "StaffData"
 * ----------------------------------------------------------------
 * ระบบจะสร้างแท็บ "StaffData" ให้อัตโนมัติในการเรียกใช้ครั้งแรกของแอดมิน
 * (ยังไม่มีก็ไม่เป็นไร ระบบสร้างเอง) เก็บ "ชื่อ-สกุล" รายบุคคลของ
 * แต่ละหน่วยงาน ข้อมูลนี้จะถูกส่งออกให้เฉพาะผู้ที่ login แอดมินเท่านั้น
 * ผู้เยี่ยมชมทั่วไปจะเห็นเฉพาะ "จำนวน" ไม่เห็นชื่อบุคคลใด ๆ
 * ----------------------------------------------------------------
 */

/* ทบทวนแก้ไข (ความสอดคล้องของโค้ด): ลบชุดตัวแปร/ฟังก์ชันของแท็บเก่า "Fte sansai hos" ออกทั้งหมด
 * (SHEET_NAME, HEADER_ROW, DATA_START_ROW, COL, getSheet_, ensureHeaders_, readGroups_ และ
 * api_adminUpdateCell/AddGroup/AddUnit/DeleteUnit ที่เขียนลงแท็บนั้น) เพราะข้อมูลที่แสดงผลจริงบนเว็บ
 * ทั้งหมด (api_getPublicData / api_getAnalytics) คำนวณจากแท็บ "FTE_Detail" มานานแล้วผ่าน
 * buildGroupsFromDetail_() — ฟังก์ชันกลุ่มนี้เขียนลงแท็บที่ไม่มีใครอ่านอีกต่อไป (และ Index.html
 * ก็ไม่ได้เรียกใช้ฟังก์ชันกลุ่มนี้จากฝั่งหน้าเว็บอยู่แล้ว) หากต้องการแก้ไขกลุ่มงาน/หน่วยงานผ่านหน้าเว็บ
 * แอดมินในอนาคต ควรเขียนฟังก์ชันใหม่ที่แก้ไขแท็บ "FTE_Detail" โดยตรงแทน ไม่ควรนำฟังก์ชันชุดนี้กลับมาใช้ */

var SESSION_TTL_SECONDS = 3600; // 1 ชั่วโมง (ปรับตามคำขอผู้ใช้ จากเดิม 6 ชั่วโมง — ดูเหตุผลที่
                                  // api_adminVerifySession และฝั่ง Index.html คู่กับ localStorage
                                  // ที่ช่วยจำเซสชันไว้ ไม่ต้องพิมพ์รหัสผ่านซ้ำทุกครั้งที่รีเฟรชหน้า)

var STAFF_SHEET_NAME = 'StaffData';
/* หมายเหตุการแก้ไข: คอลัมน์แรกเดิมเก็บ rowIndex ตัวเลขของแท็บ "Fte sansai hos" ซึ่งเลิกใช้แล้ว
 * (ดู buildGroupsFromDetail_) จึงเปลี่ยนมาเก็บ "ชื่อกลุ่มงาน จ.18" เป็นข้อความแทน เพื่อผูกรายชื่อ
 * บุคลากรกับกลุ่มงานโดยตรง ไม่ผูกกับตำแหน่งแถวของชีทที่อาจเปลี่ยนแปลงได้ */
var STAFF_HEADERS = ['รหัสกลุ่มงาน (unit key)', 'หน่วยงาน', 'ชื่อ-สกุล', 'ตำแหน่ง', 'หมายเหตุ'];
var STAFF_COL = { UNIT_ROW: 1, UNIT_NAME: 2, FULLNAME: 3, POSITION: 4, NOTE: 5 };
var STAFF_DATA_START_ROW = 2;

/* ============================== ALLSTAFF เป็นแหล่งข้อมูลเดียวของระบบ ==============================
 * ทบทวนแก้ไข (การเปลี่ยนแปลงครั้งใหญ่ ตามคำขอผู้ใช้): เดิมระบบมี 2 ชีท (FTE_Detail = โครงสร้าง/จำนวน,
 * allstaff = ชื่อ-สกุล/สถานะ) ต้องจับคู่กันด้วยคีย์เนื้อหาที่เปราะบาง ตอนนี้เปลี่ยนมาใช้ "allstaff"
 * เป็นแหล่งข้อมูลเดียวทั้งระบบ (ไม่มี FTE_Detail อีกต่อไป) — โค้ดจับคู่ 2 ชีททั้งหมดถูกลบออก เพราะไม่มี
 * 2 ชีทให้ต้องจับคู่แล้ว ชื่อ-สกุลและตำแหน่งบริหารอยู่ในแถวเดียวกับข้อมูลตำแหน่งโดยตรง
 *
 * ผลกระทบที่ต้องรู้ (คุยกับผู้ใช้แล้วตกลงกันไว้):
 *  1) ไม่มีคอลัมน์ ACTIVE อีกต่อไป — ตำแหน่งที่ยุบ/เลิกแล้วแต่ยังไม่ลบแถว ให้ระบุคำว่า "ยุบตำแหน่ง"
 *     ไว้ในคอลัมน์ "หมายเหตุ" แทน (ดู ABOLISHED_NOTE_REGEX / isAbolishedNote_ ด้านล่าง)
 *  2) ชื่อ-สกุลอยู่ในชีทเดียวกับข้อมูลตำแหน่งแล้ว (ต่างจาก FTE_Detail เดิมที่ปลอดภัยโดยโครงสร้าง)
 *     ฟังก์ชันที่เปิดให้ "ผู้เยี่ยมชม" เรียกได้ต้องเรียก readDetailRows_() แบบไม่ระบุ includeNames
 *     (ค่าเริ่มต้น = ไม่อ่านคอลัมน์ชื่อเลย ไม่ใช่แค่ไม่ส่งออก) ฟังก์ชันฝั่งแอดมินเท่านั้นที่เรียก
 *     readDetailRows_({ includeNames: true })
 *  3) สถานะ 5 "ไปช่วย-มาช่วยภายใน" บันทึกเป็น 1 แถวต่อคน (ระบุปลายทางไว้ในหมายเหตุเป็นข้อความ)
 *     ตามที่ผู้ใช้ตัดสินใจ — ข้อจำกัดที่ตามมา: หน่วยงานปลายทางจะไม่เห็นคนนี้เป็น "มาช่วย" ในตัวเลข
 *     อัตโนมัติ เพราะไม่มีแถวคู่ที่ฝั่งปลายทาง ต้องอ่านจากหมายเหตุเอาเอง (แจ้งผู้ใช้ไว้แล้ว)
 * ==================================================================================================== */
var ALLSTAFF_SHEET_NAME = 'allstaff';
var ALLSTAFF_COL = {
  ID: 1, TITLE: 2, FIRST: 3, LAST: 4, POSITION: 5, POSITION_STRUCT: 6, LEVEL: 7, EXPERTISE: 8,
  POSITION_NO: 9, EMPLOY_TYPE: 10, PROF_SUPPORT: 11, CATEGORY: 12, SUB_PROF: 13, /* แก้: เดิมสลับกัน — คอลัมน์ 11 = ข้อความ วิชาชีพ/สนับสนุน, คอลัมน์ 12 = รหัสสาย 1-5 (ตรวจกับหัวตารางชีท allstaff แล้ว) */
  UNIT_NAME: 15, UNIT_ABBR: 16, GROUP_STRUCT: 17, GROUP18: 20, AFFIL18: 21, GROUP_NUM: 22,
  MISSION18: 23, MISSION_NUM: 24, SUBFRAME: 25, MAINFRAME: 26, MISSIONFRAME: 27, POSFRAME: 28,
  STATUS: 29, NOTE: 30, ADMIN_POS: 31
};
var ALLSTAFF_NUM_COLS = 31;

/* ---- รหัสสถานะมาตรฐาน (ตามที่ผู้ใช้กำหนด) — คอลัมน์ "สถานะ" ควรเป็นเลข 0-5 ล้วนหลังคลีนข้อมูล ---- */
var STATUS_CODE = { VACANT: 0, NORMAL: 1, STUDY_LEAVE: 2, TEMP_IN: 3, TEMP_OUT: 4, INTERNAL_SWAP: 5 };
var STATUS_CODE_LABEL = {
  0: 'ไม่มีคนครอง', 1: 'ทำงานปกติ', 2: 'ลาศึกษา', 3: 'มาช่วย', 4: 'ไปช่วย', 5: 'ไปช่วย-มาช่วยภายใน'
};
/** สถานะที่ถือว่า "ไม่ได้ปฏิบัติงานอยู่จริงที่นี่วันนี้" แต่ยังนับกรอบตำแหน่งอยู่ (ต่างจากว่าง=0) */
var AWAY_STATUS_CODES = [STATUS_CODE.STUDY_LEAVE, STATUS_CODE.TEMP_OUT, STATUS_CODE.INTERNAL_SWAP];

/* ============================== นิยาม "นับคน" ฉบับเดียวทั้งระบบ (แก้ปัญหาตัวเลขไม่ตรงกัน) ==============================
 * ที่มาของปัญหา: เดิมแต่ละหน้า/กราฟนับคนด้วยเกณฑ์ต่างกัน — บางหน้านับ "ทุกแถวในทะเบียน" (รวมตำแหน่งว่าง/ไปช่วย/ลาศึกษา),
 * บางหน้านับเฉพาะ "ผู้ปฏิบัติงานจริง", บางหน้าตัดแถวด้วยคำว่า รพ.อื่น (regex) และบางหน้ากรองสังกัด "สันทราย" เพิ่ม
 * ทำให้ยอดรวมของแต่ละมุมมองไม่เท่ากัน ตอนนี้ทุกฟังก์ชันใช้กติกาเดียว โดยยึดคอลัมน์ "สถานะ" ของชีท allstaff:
 *   0 ไม่มีคนครอง   -> ไม่นับเป็นคน (นับเป็น "อัตรา/ตำแหน่ง" ในทะเบียนและกรอบเท่านั้น)
 *   1 ทำงานปกติ     -> นับเป็นผู้ปฏิบัติงานจริง
 *   2 ลาศึกษา       -> ไม่นับ (เจ้าของอัตราสังกัดโรงพยาบาลแต่ไม่ได้ปฏิบัติงาน)
 *   3 มาช่วย        -> นับเป็นผู้ปฏิบัติงานจริง (มาปฏิบัติงานที่โรงพยาบาลจริง แม้สังกัดอื่น)
 *   4 ไปช่วย        -> ไม่นับ (ไปปฏิบัติงานที่อื่น)
 *   5 ภายใน         -> ไม่นับในกลุ่มงานเดิม (ไปช่วย-มาช่วยภายใน 1 แถวต่อ 1 คน)
 * ถ้าต้องการเปลี่ยนนโยบาย (เช่น ไม่นับ "มาช่วย") แก้ที่ ONSITE_STATUS_CODES บรรทัดเดียว ทุกหน้าจะปรับตามอัตโนมัติ
 * ยอดทุกมุมมองต้องเท่ากับ "ผู้ปฏิบัติงานจริง" นี้เสมอ — ตรวจได้จากหน้า "ตรวจสอบข้อมูล" (api_adminGetConsistencyChecks)
 * ==================================================================================================== */
var ONSITE_STATUS_CODES = [STATUS_CODE.NORMAL, STATUS_CODE.TEMP_IN];

var GROUP_LABEL_ALIAS = {
  'กลุ่มงานการพยาบาลผู้ป่วยอายุกรรม': 'กลุ่มงานการพยาบาลผู้ป่วยอายุรกรรม' /* พิมพ์ผิด: อายุกรรม -> อายุรกรรม */
};
var GROUP_REVIEW_LABEL = '(ต้องตรวจสอบกลุ่มงาน)';
/** ช่องกลุ่มงานบางแถวถูกกรอกเป็นชื่อ รพ./รพสต./สสอ. (หน่วยงานภายนอก) ซึ่งไม่ใช่กลุ่มงาน — รวมไว้ในกลุ่มเดียวเพื่อไม่ให้
 *  เกิด "กลุ่มงานปลอม" บนหน้าเว็บ และให้แอดมินเห็นในหน้าตรวจสอบข้อมูลเพื่อแก้ที่ต้นทาง */
function normalizeGroupLabel_(s) {
  s = String(s || '').trim();
  if (GROUP_LABEL_ALIAS[s]) return GROUP_LABEL_ALIAS[s];
  if (/^(รพ\.|รพช\.|รพท\.|รพสต\.|สสอ\.)/.test(s)) return GROUP_REVIEW_LABEL;
  return s;
}

/** ตำแหน่งที่ยุบ/เลิกแล้วแต่ยังไม่ลบแถว — ระบุคำว่า "ยุบตำแหน่ง" (หรือใกล้เคียง) ไว้ในคอลัมน์หมายเหตุ
 * ตามที่ตกลงกับผู้ใช้ไว้ (เดิมใช้คอลัมน์ ACTIVE ของ FTE_Detail ซึ่งไม่มีอีกต่อไปแล้ว) */
var ABOLISHED_NOTE_REGEX = /ยุบ(กำหน)?ด?ตำแหน่ง|เลิกตำแหน่ง/;
function isAbolishedNote_(note) {
  return ABOLISHED_NOTE_REGEX.test(String(note || ''));
}

/** แปลงค่าดิบในคอลัมน์ "สถานะ" ให้เป็นรหัส 0-5 เสมอ รองรับทั้งกรณีคลีนแล้ว (ตัวเลขล้วน) และช่วง
 * เปลี่ยนผ่านที่ยังเป็นข้อความอิสระ (เช่น "ไปช่วย", "ลาศึกษาต่อ") เพื่อไม่ให้ระบบพังระหว่างที่ผู้ใช้
 * ทยอยคลีนข้อมูล — ถ้าคอลัมน์หมายเหตุระบุ "ไม่มีคนครอง" ชัดเจน ให้ถือเป็นว่าง (0) เสมอไม่ว่าคอลัมน์
 * สถานะจะว่างหรือไม่ก็ตาม (หมายเหตุมีน้ำหนักมากกว่าเพราะระบุตรงตัวกว่า) */
function parseStatusCode_(statusRaw, noteRaw) {
  var noteS = String(noteRaw || '').trim();
  if (/ไม่มีคนครอง/.test(noteS)) return STATUS_CODE.VACANT;
  var s = String(statusRaw === null || statusRaw === undefined ? '' : statusRaw).trim();
  if (s === '') return STATUS_CODE.NORMAL; // ค่าว่าง = ปฏิบัติงานปกติ (พฤติกรรมเดิมของระบบ)
  if (/^[0-5](\.0+)?$/.test(s)) return Number(s); // ตัวเลข 0-5 ล้วน (คลีนแล้ว)
  if (/ลาออก/.test(s)) return STATUS_CODE.TEMP_OUT; // ลาออก: ปฏิบัติต่อเหมือนไม่อยู่ปฏิบัติงาน (ตำแหน่งว่างจริงควรตั้งเป็น 0 แทนหลังคลีน)
  if (/ลาศึกษา/.test(s)) return STATUS_CODE.STUDY_LEAVE;
  if (/ไปช่วย/.test(s)) return STATUS_CODE.TEMP_OUT;
  if (/มาช่วย/.test(s)) return STATUS_CODE.TEMP_IN;
  return STATUS_CODE.NORMAL; // ข้อความอื่นที่ยังไม่รู้จัก (เช่น "ภายใน (ไม่ตรงจ.)") — ไม่ตัดสินแทน ปล่อยเป็นปกติ ให้ผู้ใช้คลีนเป็นเลขเอง
}

/* ============================== DATA-LAST-UPDATED STAMP ==============================
 * ป้าย "ข้อมูล ณ วันที่ ... รับรองโดยระบบ" ที่หัว/ท้ายเว็บ อ้างอิงเวลาที่ "ข้อมูลจริง" ถูกแก้ไข
 * ล่าสุด (ไม่ใช่เวลาที่ผู้เข้าชมเปิดหน้าเว็บ ซึ่งจะเป็น "ตอนนี้" เสมอและไม่สื่อความหมายอะไร)
 * ค่านี้จะเปลี่ยนเมื่อ:
 *   1) แอดมินแก้ไขข้อมูลผ่านหน้าเว็บ (ปุ่มแก้ไขในโหมดแอดมิน) — ระบบบันทึกเวลาให้อัตโนมัติ
 *      (ดู markDataUpdated_() ที่เรียกจากฟังก์ชัน api_admin* ที่เขียนข้อมูลด้านล่าง)
 *   2) มีการแก้ไขข้อมูลโดยตรงในแท็บ Google Sheet (พิมพ์ข้อมูลจากหน่วยงานเข้าไปเอง) ผ่านทริกเกอร์
 *      onEdit(e) ด้านล่าง — ทำงานอัตโนมัติได้เลยถ้าไฟล์นี้ผูก (bound) อยู่กับ Google Sheet ที่ใช้
 *      แต่ถ้าเป็นสคริปต์แบบสแตนด์อโลนที่อ้างอิง SPREADSHEET_ID จากภายนอก ต้องนำฟังก์ชัน onEdit(e)
 *      นี้ไปวางไว้ในโปรเจกต์ Apps Script ที่ผูกกับชีทนั้นโดยตรง (เปิดชีท > ส่วนขยาย > Apps Script)
 *      พร้อมตั้งค่า Script Properties SPREADSHEET_ID ให้ตรงกับโปรเจกต์นี้ด้วย
 *   3) แอดมินเลือกวันที่/เวลาเองจากปฏิทินแล้วกดปุ่ม "บันทึกวันที่นี้" ในหน้าตั้งค่าเว็บไซต์ (มุมมองแอดมิน)
 *      — ระบุย้อนหลังหรือล่วงหน้าได้ตามจริง ไม่ผูกกับเวลาปัจจุบันเสมอไป ใช้ได้เสมอไม่ว่ากรณีใด แม้ onEdit(e)
 *      จะติดตั้งไม่สำเร็จก็ตาม
 * ---------------------------------------------------------------------------------- */
var DATA_UPDATED_PROP = 'DATA_LAST_UPDATED_AT';

/* customDateIso: ถ้ามีการส่งมา (แอดมินเลือกวันที่/เวลาเองจากปฏิทินในหน้าตั้งค่าเว็บไซต์) จะใช้ค่านั้น
 * แทนเวลาปัจจุบัน เพื่อให้ระบุ "ข้อมูล ณ วันที่" ย้อนหลังหรือกำหนดล่วงหน้าได้ตามจริง ถ้าไม่ส่งมา หรือ
 * ส่งมาเป็นค่าที่แปลงเป็นวันที่ไม่ได้ จะ fallback ไปใช้เวลาปัจจุบันเหมือนเดิม (เช่นตอนที่ onEdit(e)
 * เรียกฟังก์ชันนี้อัตโนมัติ ซึ่งไม่มีวันที่เจาะจงส่งมาด้วย) */
function markDataUpdated_(customDateIso) {
  var d = customDateIso ? new Date(customDateIso) : new Date();
  if (isNaN(d.getTime())) d = new Date();
  PropertiesService.getScriptProperties().setProperty(DATA_UPDATED_PROP, d.toISOString());
}

/* คืนค่าเวลาข้อมูลอัพเดทล่าสุดที่บันทึกไว้ ถ้ายังไม่เคยมีการบันทึกเลย (ระบบเพิ่ง deploy ใหม่)
 * จะคืนค่า null ฝั่ง client จะ fallback ไปใช้ generatedAt (เวลาปัจจุบัน) แทนเป็นครั้งแรกเท่านั้น */
function getDataUpdatedAt_() {
  return getProp_(DATA_UPDATED_PROP, null);
}

/* customDateIso: วันที่/เวลาที่แอดมินเลือกเองจากปฏิทิน (input type="date"/"time" ที่หน้าตั้งค่าเว็บไซต์)
 * ส่งมาเป็นสตริง ISO (เช่น "2026-08-20T09:30:00.000Z") ถ้าไม่ส่งมาจะใช้เวลาปัจจุบันแทนเหมือนเดิม */
function api_adminMarkDataUpdated(token, customDateIso) {
  verifyToken_(token);
  logActivity_('admin_markdata_updated', { result: 'success' }); /* ทบทวนเพิ่ม: บันทึกกิจกรรมแก้ไขข้อมูลของแอดมิน/คณะกรรมการ */
  markDataUpdated_(customDateIso);
  return { ok: true, dataUpdatedAt: getDataUpdatedAt_() };
}

/**
 * ทริกเกอร์อัตโนมัติของ Google Sheets เมื่อมีการแก้ไขเซลล์ในแท็บข้อมูลหลักโดยตรง
 * (ดูหมายเหตุการติดตั้งด้านบน — ทำงานเฉพาะกรณีไฟล์นี้ผูกกับชีทโดยตรงเท่านั้น)
 */
function onEdit(e) {
  try {
    var sheetName = e && e.range ? e.range.getSheet().getName() : null;
    var watched = [STAFF_SHEET_NAME, ALLSTAFF_SHEET_NAME];
    if (sheetName && watched.indexOf(sheetName) === -1) return;
    markDataUpdated_();
  } catch (err) {
    // เงียบไว้ — ไม่ให้ error จาก trigger กระทบการแก้ไขปกติของผู้ใช้ในชีท
  }
}

/* ============================== WEB APP ENTRY ============================== */

function fteDoGet_(e) {
  var tpl = HtmlService.createTemplateFromFile('Index');
  /* ทบทวนเพิ่ม: ส่ง reCAPTCHA site key (ค่าสาธารณะ ไม่ใช่ความลับ) เข้าไปฝังในหน้าเว็บผ่าน template
   * เพื่อให้ widget "ฉันไม่ใช่หุ่นยนต์" เรนเดอร์ได้ — secret key ไม่ส่งมาฝั่งนี้เด็ดขาด ใช้ตรวจสอบเฉพาะ
   * ฝั่งเซิร์ฟเวอร์เท่านั้น (ดู verifyRecaptcha_) */
  tpl.recaptchaSiteKey = getProp_('RECAPTCHA_SITE_KEY', '');
  var out = tpl.evaluate();
  out.setTitle(getProp_('HOSPITAL_NAME', DEFAULT_HOSPITAL_NAME) + ' | ระบบอัตรากำลัง (FTE)');
  out.addMetaTag('viewport', 'width=device-width, initial-scale=1');
  out.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return out;
}

function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/* ============================== PROPERTIES ============================== */

var DEFAULT_HOSPITAL_NAME = 'โรงพยาบาลสันทราย';
var DEFAULT_HOSPITAL_SUBTITLE = 'ระบบแสดงข้อมูลอัตรากำลัง (FTE) กลุ่มการพยาบาล';

function getProp_(key, fallback) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  return (v === null || v === '') ? fallback : v;
}

function api_getSiteInfo() {
  return {
    hospitalName: getProp_('HOSPITAL_NAME', DEFAULT_HOSPITAL_NAME),
    hospitalSubtitle: getProp_('HOSPITAL_SUBTITLE', DEFAULT_HOSPITAL_SUBTITLE)
  };
}

/**
 * นับจำนวนครั้งที่มีการเปิดหน้าเว็บ (เรียกครั้งเดียวตอนโหลดหน้าเว็บฝั่ง client)
 * ใช้ LockService ป้องกันการนับซ้อนกันเมื่อมีผู้เข้าใช้งานพร้อมกันหลายคน
 */
function api_getVisitCount() {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
  } catch (e) {
    // ถ้าขอ lock ไม่ทันภายในเวลาที่กำหนด ให้คืนค่าปัจจุบันโดยไม่นับเพิ่ม เพื่อไม่ให้หน้าเว็บค้าง
    return parseInt(getProp_('VISIT_COUNT', '0'), 10);
  }
  try {
    var props = PropertiesService.getScriptProperties();
    var count = parseInt(props.getProperty('VISIT_COUNT') || '0', 10) + 1;
    props.setProperty('VISIT_COUNT', String(count));
    return count;
  } finally {
    lock.releaseLock();
  }
}

/**
 * ทบทวนเพิ่ม (ตามคำขอผู้ใช้ — แก้บั๊ก "หน้าพรีวิวไม่มีเลขรัน"): คืนค่าจำนวนผู้เข้าชมสะสม "ปัจจุบัน"
 * แบบอ่านอย่างเดียว ไม่เพิ่มตัวนับและไม่ถือเป็นการบันทึก "ประวัติการเข้าใช้งาน" ของผู้เยี่ยมชมรายนี้
 * (ต่างจาก api_getVisitCount() ด้านบนซึ่งนับเพิ่ม 1 เสมอ) จึงเรียกได้ทันทีตั้งแต่หน้าเว็บเริ่มโหลด
 * โดยไม่ต้องรอผู้ใช้ยินยอมผ่านประตูทางเข้าก่อน — ใช้แสดงตัวเลขวิ่งบนหน้าพรีวิว (splash screen) ที่จะ
 * จางหายไปเร็วกว่าที่ประตูทางเข้าจะเสร็จเสมอ ตัวเลขจริงที่นับรวมผู้เข้าชมรอบนี้ด้วยยังคงรอความยินยอม
 * ก่อนแล้วค่อยเรียก api_getVisitCount() ตามเดิมไม่เปลี่ยนแปลง (ดู proceedIntoSitePublicBits_ ฝั่งเว็บ)
 */
function api_getVisitCountReadOnly() {
  return parseInt(getProp_('VISIT_COUNT', '0'), 10);
}

/* ============================== SHEET ACCESS ============================== */

function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) {
    throw new Error('ยังไม่ได้ตั้งค่า SPREADSHEET_ID ใน Script Properties ของโปรเจกต์');
  }
  return SpreadsheetApp.openById(id);
}

/**
 * ค้นหาแท็บด้วยชื่อ โดยยอมรับกรณีชื่อแท็บจริงมีช่องว่างเกิน (เช่นไฟล์ที่ import มาจาก
 * Excel/CSV อาจมีชื่อแท็บ "Fte sansai hos " ที่มีเว้นวรรคท้าย) เพื่อไม่ให้ระบบล่ม
 * เพียงเพราะชื่อแท็บเว้นวรรคไม่ตรงเป๊ะกับค่าคงที่ในสคริปต์
 */
function findSheetLoose_(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  var target = String(name).trim();
  var all = ss.getSheets();
  for (var i = 0; i < all.length; i++) {
    if (all[i].getName().trim() === target) return all[i];
  }
  return null;
}

function toNumberOrNull_(v) {
  if (v === '' || v === null || v === undefined) return null;
  var n = Number(v);
  return isNaN(n) ? null : n;
}

/* ---------- StaffData tab (auto-provisioned, PDPA-restricted) ---------- */

function getStaffSheet_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(STAFF_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(STAFF_SHEET_NAME);
    sheet.getRange(1, 1, 1, STAFF_HEADERS.length).setValues([STAFF_HEADERS]);
    sheet.getRange(1, 1, 1, STAFF_HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.hideSheet(); // ซ่อนแท็บนี้จากมุมมองปกติของสเปรดชีต เพื่อลดความเสี่ยง PDPA
  }
  return sheet;
}

function readStaffRows_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < STAFF_DATA_START_ROW) return [];
  var numRows = lastRow - STAFF_DATA_START_ROW + 1;
  var values = sheet.getRange(STAFF_DATA_START_ROW, 1, numRows, STAFF_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var unitKey = values[i][0];
    var fullname = values[i][2];
    if (!unitKey && !fullname) continue;
    out.push({
      sheetRow: STAFF_DATA_START_ROW + i,
      unitKey: String(unitKey || ''),
      unitName: String(values[i][1] || ''),
      fullname: String(fullname || ''),
      position: String(values[i][3] || ''),
      note: String(values[i][4] || '')
    });
  }
  return out;
}

function withDiff_(row) {
  var actual = row.actual === null ? 0 : row.actual;
  var diff = (row.standard === null) ? null : (actual - row.standard);
  var out = {
    rowIndex: row.rowIndex,
    code: row.code,
    name: row.name,
    actual: actual,
    standard: row.standard,
    diff: diff,
    status: diff === null ? 'unset' : (diff < 0 ? 'short' : (diff > 0 ? 'surplus' : 'exact'))
  };
  if (row.byType) out.byType = row.byType; // ยอดแยกตามประเภทการจ้าง (ถ้ามี) — ดู buildGroupsFromDetail_
  /* ทบทวนเพิ่ม: ส่งต่อธง mixedFrame (ถ้ามี) ให้หน้าเว็บทราบว่ากลุ่มงานนี้มีค่ากรอบหลักไม่ตรงกันในข้อมูลต้นทาง
   * ดู resolveGroupStandard_() — ไม่ใส่ค่า false เปล่าๆ ทุกแถวเพื่อไม่ให้ payload ใหญ่โดยไม่จำเป็น */
  if (row.mixedFrame) out.mixedFrame = true;
  return out;
}

function buildPayload_(groups) {
  var out = [];
  var totalActual = 0;
  var totalStandard = 0;
  var hasAnyStandard = false;

  groups.forEach(function (g) {
    var gOut = withDiff_(g);
    gOut.units = g.units.map(withDiff_);
    out.push(gOut);
    totalActual += gOut.actual;
    if (gOut.standard !== null) {
      totalStandard += gOut.standard;
      hasAnyStandard = true;
    }
  });

  var totalDiff = hasAnyStandard ? (totalActual - totalStandard) : null;

  return {
    generatedAt: new Date().toISOString(),
    dataUpdatedAt: getDataUpdatedAt_(),
    groups: out,
    summary: {
      totalActual: totalActual,
      totalStandard: hasAnyStandard ? totalStandard : null,
      totalDiff: totalDiff
    }
  };
}

/* ============================== PUBLIC API ============================== */

/**
 * สร้างรายการ "กลุ่มงาน" (ระดับ กลุ่มงาน จ.18) จากแท็บ FTE_Detail โดยตรง
 * ----------------------------------------------------------------------
 * หมายเหตุการแก้ไข: เดิมฟังก์ชันนี้อ่านจากแท็บ "Fte sansai hos" ผ่าน readGroups_()
 * ซึ่งคาดหวังโครงสร้างคอลัมน์ รหัส/ชื่อ/จำนวนจริง/เกณฑ์/ผลต่าง (COL) แต่ข้อมูลจริงในแท็บ
 * ดังกล่าวถูกแทนที่ด้วยตารางสรุป pivot คนละโครงสร้าง (ไม่มีคอลัมน์ "จำนวนจริง" เลย) ทำให้
 * การ์ดสรุปยอดหน้าแรกและปุ่ม Export CSV แสดงผลเป็น 0/ว่างทั้งหมด จึงเปลี่ยนมาคำนวณจาก
 * FTE_Detail (นับเฉพาะบุคลากรที่ปฏิบัติงานจริง) ด้วยตรรกะเดียวกับ api_getBreakdownByDimension
 * เพื่อให้ตัวเลขตรงกับมุมมองอื่น ๆ ในระบบเสมอ — ไม่มีชื่อบุคคล จึงยังคงปลอดภัยตาม PDPA
 */
function buildGroupsFromDetail_(excludeDaily) {
  var rows = readDetailRows_().filter(function (r) { return r.active; });
  var groupMap = {};
  var order = [];

  rows.forEach(function (r) {
    var key = r.group18 || '(ไม่ระบุกลุ่มงาน)';
    if (!groupMap[key]) {
      groupMap[key] = { name: key, actual: 0, byType: {}, unitMap: {}, unitOrder: [] };
      order.push(key);
    }
    var g = groupMap[key];
    var et = r.employType || '(ไม่ระบุ)';
    /* เพิ่มตามคำขอผู้ใช้ (ข้อ 5 — เกณฑ์การสรุปรายงาน): เมื่อ excludeDaily=true ตำแหน่ง "รายวัน" จะไม่ถูก
     * นับรวมในยอด "ปฏิบัติงานจริง" ของรายงาน (เพราะเป็นการจ้างชั่วคราวนอกกรอบอัตรากำลังตามเกณฑ์)
     * แต่ "กรอบ" (standard) ยังคงคำนวณจากทุกแถวเหมือนเดิมเสมอ ไม่ว่าจะ excludeDaily หรือไม่ เพราะกรอบ
     * คือจำนวนตำแหน่งที่ทางราชการกำหนดไว้ ไม่ได้ขึ้นกับว่าใครมาครองตำแหน่งอยู่ในขณะนี้ — ใช้พารามิเตอร์นี้
     * เฉพาะหน้า "รายงานอัตรากำลัง" (ดู api_getReportAnalytics) ส่วนแดชบอร์ด/มุมมองอื่นไม่แตะต้อง
     * (เรียก buildGroupsFromDetail_() เฉยๆ ไม่ใส่พารามิเตอร์ จึงยังคงพฤติกรรมเดิมทุกจุด) */
    var countThisRow = r.isOnSite && !(excludeDaily && et === 'รายวัน');

    // นับยอดจริง เฉพาะผู้ปฏิบัติงานหน้างานจริง (ไม่นับ ว่าง, ลาศึกษา, ไปช่วย, มาช่วย)
    if (countThisRow) {
      g.actual++;
      g.byType[et] = (g.byType[et] || 0) + 1;
    }
    addGroupStandard_(g, r);

    var uKey = r.unitName || '(ไม่ระบุหน่วยงานย่อย)';
    if (!g.unitMap[uKey]) {
      g.unitMap[uKey] = { name: uKey, actual: 0, standard: 0, hasStandard: false, seenKeys: {} };
      g.unitOrder.push(uKey);
    }
    var u = g.unitMap[uKey];
    if (countThisRow) u.actual++;
    addPositionStandard_(u, r);
  });

  return order.map(function (key, idx) {
    var g = groupMap[key];
    var resolved = resolveGroupStandard_(g);
    return {
      rowIndex: null,
      code: String(idx + 1),
      name: g.name,
      actual: g.actual,
      standard: resolved.standard,
      mixedFrame: resolved.mixedFrame,
      byType: g.byType,
      units: g.unitOrder.map(function (uKey) {
        var u = g.unitMap[uKey];
        return {
          rowIndex: null, code: '', name: u.name,
          actual: u.actual, standard: u.hasStandard ? u.standard : null
        };
      })
    };
  });
}

function api_getPublicData() {
  var groups = buildGroupsFromDetail_();
  var payload = buildPayload_(groups);
  var site = api_getSiteInfo();
  payload.hospitalName = site.hospitalName;
  payload.hospitalSubtitle = site.hospitalSubtitle;
  return payload;
}

/**
 * ข้อมูลวิเคราะห์/แดชบอร์ด — เป็นข้อมูลระดับตัวเลขรวมเท่านั้น
 * ไม่มีชื่อบุคคลใด ๆ จึงปลอดภัยตามหลัก PDPA และเปิดให้ผู้เยี่ยมชมดูได้
 */
function api_getAnalytics() {
  var groups = buildGroupsFromDetail_().map(withDiff_);

  var dist = { short: 0, exact: 0, surplus: 0, unset: 0 };
  groups.forEach(function (g) { dist[g.status]++; });

  var withStandard = groups.filter(function (g) { return g.standard !== null; });
  var sortedShort = withStandard.slice().sort(function (a, b) { return a.diff - b.diff; });
  var sortedSurplus = withStandard.slice().sort(function (a, b) { return b.diff - a.diff; });

  var totalActual = groups.reduce(function (s, g) { return s + g.actual; }, 0);
  var totalStandard = withStandard.reduce(function (s, g) { return s + g.standard; }, 0);
  var staffingRate = totalStandard > 0 ? Math.round((totalActual / totalStandard) * 1000) / 10 : null;

  return {
    generatedAt: new Date().toISOString(),
    dataUpdatedAt: getDataUpdatedAt_(),
    statusDistribution: dist,
    staffingRate: staffingRate,
    totalGroups: groups.length,
    chartByGroup: groups.map(function (g) {
      return { name: g.name, code: g.code, actual: g.actual, standard: g.standard, diff: g.diff, byType: g.byType || {} };
    }),
    topShort: sortedShort.filter(function (g) { return g.diff < 0; }).slice(0, 5)
      .map(function (g) { return { name: g.name, code: g.code, diff: g.diff, actual: g.actual, standard: g.standard }; }),
    topSurplus: sortedSurplus.filter(function (g) { return g.diff > 0; }).slice(0, 5)
      .map(function (g) { return { name: g.name, code: g.code, diff: g.diff, actual: g.actual, standard: g.standard }; })
  };
}

/**
 * เพิ่มตามคำขอผู้ใช้ (ข้อ 5): ข้อมูลสำหรับหน้า "รายงานอัตรากำลัง" โดยเฉพาะ — ต่างจาก api_getAnalytics
 * ตรงที่เลือกได้ว่าจะ "รวมตำแหน่งรายวัน" หรือ "ไม่รวม" (เกณฑ์ค่าเริ่มต้นของรายงานคือไม่รวม เพราะรายวัน
 * เป็นการจ้างชั่วคราวนอกกรอบอัตรากำลังตามเกณฑ์) เพื่อให้ออกรายงานได้ 2 ฉบับแยกกันตามคำขอ
 * excludeDaily: boolean (true = ไม่รวมรายวัน [ค่าเริ่มต้นที่แนะนำ], false = รวมรายวันด้วย)
 */
function api_getReportAnalytics(excludeDaily) {
  excludeDaily = (excludeDaily !== false); // ค่าเริ่มต้นเป็น true (ไม่รวมรายวัน) ถ้าไม่ระบุมา
  var rawGroups = buildGroupsFromDetail_(excludeDaily); // มี .units ดิบ (ยังไม่ผ่าน withDiff_)
  var groups = rawGroups.map(withDiff_); // ใช้คำนวณสรุปยอดรวม/top5 (withDiff_ ไม่ส่งต่อ .units)

  var withStandard = groups.filter(function (g) { return g.standard !== null; });
  var sortedShort = withStandard.slice().sort(function (a, b) { return a.diff - b.diff; });
  var sortedSurplus = withStandard.slice().sort(function (a, b) { return b.diff - a.diff; });

  var totalActual = groups.reduce(function (s, g) { return s + g.actual; }, 0);
  var totalStandard = withStandard.reduce(function (s, g) { return s + g.standard; }, 0);
  var totalDiff = withStandard.length ? (totalActual - totalStandard) : null;

  return {
    generatedAt: new Date().toISOString(),
    dataUpdatedAt: getDataUpdatedAt_(),
    excludeDaily: excludeDaily,
    summary: { totalActual: totalActual, totalStandard: withStandard.length ? totalStandard : null, totalDiff: totalDiff },
    topShort: sortedShort.filter(function (g) { return g.diff < 0; }).slice(0, 5)
      .map(function (g) { return { name: g.name, code: g.code, diff: g.diff, actual: g.actual, standard: g.standard }; }),
    topSurplus: sortedSurplus.filter(function (g) { return g.diff > 0; }).slice(0, 5)
      .map(function (g) { return { name: g.name, code: g.code, diff: g.diff, actual: g.actual, standard: g.standard }; }),
    /* ใช้ rawGroups (มี .units ติดมาด้วย) ไม่ใช่ groups ที่ผ่าน withDiff_ ไปแล้ว เพราะ withDiff_ คืน
     * เฉพาะฟิลด์ระดับบนสุด ไม่ส่งต่อ .units — ต้อง map หน่วยงานย่อยผ่าน withDiff_ เองอีกชั้นหนึ่ง */
    groups: rawGroups.map(function (g) {
      var gd = withDiff_(g);
      gd.units = (g.units || []).map(withDiff_);
      return gd;
    })
  };
}

/* ============================== FTE_Detail — มุมมองหลายมิติ (ไม่มีชื่อบุคคล) ============================== */

function getAllStaffSheet_() {
  var ss = getSpreadsheet_();
  var sheet = findSheetLoose_(ss, ALLSTAFF_SHEET_NAME);
  if (!sheet) {
    throw new Error('ไม่พบแท็บ "' + ALLSTAFF_SHEET_NAME + '" กรุณานำเข้าไฟล์ข้อมูลฉบับล่าสุดก่อนใช้งานมุมมองนี้');
  }
  return sheet;
}

/* ============================== การจัดหมวดหมู่ "สถานะ" / "หมายเหตุ" / "ตำแหน่งบริหาร" ==============================
 * เพิ่มเข้ามาเพื่อวิเคราะห์คอลัมน์ "สถานะ" และ "หมายเหตุ" จากชีท allstaff/FTE_Detail อย่างชาญฉลาดขึ้น
 * แทนที่จะแสดงข้อความดิบล้วนๆ (ซึ่งฝั่งหน้าเว็บเดิมพยายามเดาความหมายด้วย regex ที่ไม่ตรงกับข้อมูลจริงเลย
 * เช่น statusBadge() เดิมมองหาคำว่า "ว่าง/ครอง/ยุบ" แต่ค่าจริงในคอลัมน์ "สถานะ" ของชีทนี้คือ
 * "ไปช่วย" / "มาช่วย" / "ลาศึกษาต่อ" / "ลาออก..." / "ภายใน (ไม่ตรงจ.)" ทำให้ทุกแถวที่มีสถานะขึ้นเป็นสี
 * "ไม่ระบุ" หมดโดยไม่มีความหมาย) ฟังก์ชันด้านล่างนี้จัดกลุ่มค่าจริงที่พบในข้อมูลให้เป็นหมวดที่สื่อความหมาย
 * และนำไปใช้ทั้งฝั่งสรุปจำนวน (api_adminGetStaffingSummary) และฝั่งแสดงผลรายแถว (readDetailRows_)
 */

/** จัดหมวด "สถานะ" ของตำแหน่ง จากรหัส 0-5 มาตรฐาน (ดู parseStatusCode_ ที่แปลงค่าดิบเป็นรหัสนี้แล้ว) */
function classifyStatus_(statusCode) {
  var code = Number(statusCode);
  var category = { 0: 'vacant', 1: 'normal', 2: 'study_leave', 3: 'temp_in', 4: 'temp_out', 5: 'internal_swap' }[code] || 'normal';
  return { category: category, label: STATUS_CODE_LABEL[code] || STATUS_CODE_LABEL[1] };
}

/** จัดหมวด "หมายเหตุ" — คืนค่า null ถ้าไม่มีหมายเหตุ ใช้ regex ที่ครอบคลุมคำสะกดผิดที่พบจริงในชีท
 * (เช่น "ขั่วคราว" สะกดผิดของ "ชั่วคราว" ที่พบในบางแถว) */
function classifyNote_(note) {
  var s = String(note || '').trim();
  if (!s) return null;
  if (/ไม่มีคนครอง/.test(s)) return 'vacant';
  if (/เพิ่มเลขต[นห]\.?\s*(ชั่วคราว|ขั่วคราว)/.test(s)) return 'temp_position_number';
  if (/รอนำเข้า.*(กรรมการ|กกบ)|รอนำเข้ากรรมการ/.test(s)) return 'pending_committee';
  if (/รับเลื่อน|รับย้าย|รับบรรจุ|บรรจุผู้สอบแข่งขันได้|อยู่ระหว่างเปลี่ยน|ขอปรับปรุงกำหนดตำแหน่ง/.test(s)) return 'in_process';
  return 'other';
}

var NOTE_CATEGORY_LABEL = {
  vacant: 'ตำแหน่งว่าง (ไม่มีคนครอง)',
  temp_position_number: 'เลขตำแหน่งชั่วคราว (รอดำเนินการ)',
  pending_committee: 'รอเข้าที่ประชุมกรรมการ',
  in_process: 'อยู่ระหว่างดำเนินการด้านบุคคล',
  other: 'หมายเหตุอื่นๆ'
};

var STATUS_CATEGORY_LABEL = {
  vacant: 'ไม่มีคนครอง',
  normal: 'ทำงานปกติ',
  study_leave: 'ลาศึกษา',
  temp_in: 'มาช่วย',
  temp_out: 'ไปช่วย',
  internal_swap: 'ไปช่วย-มาช่วยภายใน'
};

/** ตรวจว่าข้อความในคอลัมน์ "ตำแหน่งบริหาร" น่าจะเป็น "หมายเหตุ" ที่กรอกผิดคอลัมน์ (เช่นพบแถว id 195
 * ที่คอลัมน์ตำแหน่งบริหารถูกกรอกว่า "ไม่มีคนครอง-ยุบกำหนดตำแหน่ง ให้นวค.ชพ." ซึ่งเป็นคำอธิบายสถานะตำแหน่ง
 * ไม่ใช่ชื่อตำแหน่งบริหารจริง) เพื่อไม่ให้ระบบไปแสดงข้อความนี้ปนกับรายชื่อ "หัวหน้ากลุ่มงาน" ตัวจริง */
function looksLikeNoteNotAdminTitle_(s) {
  return /ไม่มีคนครอง|ยุบ(กำหน|เลิก)?ตำแหน่ง|ยุบกำหน/.test(s);
}

/** แยกข้อความ "ตำแหน่งบริหาร" ที่มักกรอกหลายตำแหน่งต่อคนคั่นด้วย "/" หรือขึ้นบรรทัดใหม่
 * (เช่น "ผู้ช่วยหัวหน้ากลุ่มภารกิจ.../หัวหน้ากลุ่มงาน.../หัวหน้าหอผู้ป่วย...") ให้เป็นรายการแยกทีละตำแหน่ง
 * เพื่อให้แสดงผลเป็นรายบรรทัดได้ชัดเจน แทนที่จะเป็นข้อความยาวติดกันบรรทัดเดียว */
function splitAdminPosParts_(s) {
  return String(s || '')
    .split(/[\/\n]+/)
    .map(function (p) { return p.trim(); })
    .filter(function (p) { return p; });
}

/* ============================== ชื่อ-สกุล / ตำแหน่งบริหาร ==============================
 * ทบทวนแก้ไข: เดิมตรงนี้มีดัชนี/ฟังก์ชันจับคู่เนื้อหาระหว่าง FTE_Detail กับ allstaff อยู่ราว 180
 * บรรทัด (buildAllStaffAdminPosIndex_, resolveAdminPosHolder_, normalizeMatchPart_, matchKeyParts_,
 * buildAllStaffMatchKey_, buildDetailMatchKey_, buildAllStaffContentIndex_, resolveNameForDetailRow_)
 * ทั้งหมดถูกลบออก เพราะตอนนี้เหลือชีทเดียว (allstaff) ชื่อ-สกุลและตำแหน่งบริหารอยู่ในแถวเดียวกับ
 * ข้อมูลตำแหน่งอยู่แล้ว ไม่ต้องจับคู่ข้ามชีทอีกต่อไป — ดู readDetailRows_() ด้านล่างที่อ่านค่าตรงๆ
 * ==================================================================================================== */

/**
 * อ่านข้อมูลระดับ "ตำแหน่งงาน" ทั้งหมดจากชีท allstaff — จุดเดียวที่ทุกฟังก์ชัน (แดชบอร์ด/วิเคราะห์/
 * แอดมิน) ใช้อ่านข้อมูล ทำให้แก้แหล่งข้อมูลจุดเดียวนี้พอ ไม่ต้องแก้ทุกฟังก์ชันที่เรียกใช้
 *
 * opts.includeNames (ค่าเริ่มต้น false): ควบคุมว่าจะอ่านคอลัมน์ชื่อ-สกุลจากชีทหรือไม่ — เป็นค่า
 * false โดยดีฟอลต์เพื่อความปลอดภัย PDPA (ฟังก์ชันที่ผู้เยี่ยมชมทั่วไปเรียกได้ต้องไม่ระบุ opts นี้เลย
 * ผลคือ object แถวที่ได้จะไม่มีคีย์ title/first/last/fullName อยู่เลย ไม่ใช่แค่ไม่ส่งออก จึงรั่วไม่ได้
 * แม้บังเอิญ serialize ทั้ง object ส่งกลับไปโดยพลาด) เฉพาะฟังก์ชันฝั่งแอดมิน (ผ่าน verifyToken_
 * มาแล้ว) เท่านั้นที่ควรเรียก readDetailRows_({ includeNames: true })
 */
function readDetailRows_(opts) {
  var includeNames = !!(opts && opts.includeNames);
  var sheet = getAllStaffSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var numRows = lastRow - 2 + 1;
  var values = sheet.getRange(2, 1, numRows, ALLSTAFF_NUM_COLS).getValues();
  var out = [];
  
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    var positionVal = String(v[ALLSTAFF_COL.POSITION - 1] || '');
    var positionStructVal = String(v[ALLSTAFF_COL.POSITION_STRUCT - 1] || '');
    
    if (!v[ALLSTAFF_COL.ID - 1] && !positionVal) continue;
    
    if (positionVal === 'นักวิชาการสาธารณสุข' && positionStructVal === 'พยาบาลวิชาชีพ') {
      positionVal = 'พยาบาลวิชาชีพ';
    }

    var noteVal = String(v[ALLSTAFF_COL.NOTE - 1] || '');
    var statusCode = parseStatusCode_(v[ALLSTAFF_COL.STATUS - 1], noteVal);
    var statusInfo = classifyStatus_(statusCode);
    var adminPosVal = String(v[ALLSTAFF_COL.ADMIN_POS - 1] || '');
    var affil18Val = String(v[ALLSTAFF_COL.AFFIL18 - 1] || '');
    var unitNameVal = String(v[ALLSTAFF_COL.UNIT_NAME - 1] || '');
    
    /* นิยามใหม่: ไม่ตัดแถวตาม regex ชื่อ รพ.อื่นอีกต่อไป (เดิมทำให้ผู้ "ไปช่วย" 6 คน และผู้ "มาช่วย" 6 คนหายจากหลายหน้า)
     * แถวที่ไม่นับ มีเพียงตำแหน่งที่ระบุ "ยุบตำแหน่ง" ในหมายเหตุ — จำนวนคนทั้งหมดตัดสินจากคอลัมน์ "สถานะ" เท่านั้น */
    var isActive = !isAbolishedNote_(noteVal);
    var statusBlank = (String(v[ALLSTAFF_COL.STATUS - 1] === null || v[ALLSTAFF_COL.STATUS - 1] === undefined ? '' : v[ALLSTAFF_COL.STATUS - 1]).trim() === '');

    var isVacant = (statusCode === STATUS_CODE.VACANT);
    var isAway = (AWAY_STATUS_CODES.indexOf(statusCode) !== -1);
    var isTempIn = (statusCode === STATUS_CODE.TEMP_IN);
    var isOnSite = (ONSITE_STATUS_CODES.indexOf(statusCode) !== -1);

    var row = {
      id: v[ALLSTAFF_COL.ID - 1],
      xlRow: i + 2,
      position: positionVal,
      positionStruct: positionStructVal,
      level: String(v[ALLSTAFF_COL.LEVEL - 1] || ''),
      expertise: String(v[ALLSTAFF_COL.EXPERTISE - 1] || ''),
      positionNo: String(v[ALLSTAFF_COL.POSITION_NO - 1] || ''),
      employType: String(v[ALLSTAFF_COL.EMPLOY_TYPE - 1] || ''),
      category: v[ALLSTAFF_COL.CATEGORY - 1],
      profSupport: String(v[ALLSTAFF_COL.PROF_SUPPORT - 1] || ''),
      subProf: String(v[ALLSTAFF_COL.SUB_PROF - 1] || ''),
      unitName: unitNameVal,
      unitAbbr: String(v[ALLSTAFF_COL.UNIT_ABBR - 1] || ''),
      groupStruct: String(v[ALLSTAFF_COL.GROUP_STRUCT - 1] || ''),
      group18: normalizeGroupLabel_(v[ALLSTAFF_COL.GROUP18 - 1]),
      group18Raw: String(v[ALLSTAFF_COL.GROUP18 - 1] || ''),
      affil18: affil18Val,
      groupNum: String(v[ALLSTAFF_COL.GROUP_NUM - 1] || ''),
      mission18: String(v[ALLSTAFF_COL.MISSION18 - 1] || ''),
      missionNum: String(v[ALLSTAFF_COL.MISSION_NUM - 1] || ''),
      subframe: toNumberOrNull_(v[ALLSTAFF_COL.SUBFRAME - 1]),
      mainframe: toNumberOrNull_(v[ALLSTAFF_COL.MAINFRAME - 1]),
      missionframe: toNumberOrNull_(v[ALLSTAFF_COL.MISSIONFRAME - 1]),
      posframe: toNumberOrNull_(v[ALLSTAFF_COL.POSFRAME - 1]),
      statusCode: statusCode,
      status: String(statusCode),
      statusCategory: statusInfo.category,
      statusLabel: statusInfo.label,
      active: isActive,
      statusBlank: statusBlank,
      isTempIn: isTempIn,
      isForeignAffil: !isSansaiAffiliation_(affil18Val),
      isVacant: isVacant,
      isAway: isAway,
      isOnSite: isOnSite,
      adminPos: adminPosVal,
      adminPosIsTitle: adminPosVal ? !looksLikeNoteNotAdminTitle_(adminPosVal) : true,
      adminPosParts: splitAdminPosParts_(adminPosVal),
      note: noteVal,
      noteCategory: classifyNote_(noteVal)
    };
    if (includeNames) {
      row.title = v[ALLSTAFF_COL.TITLE - 1];
      row.first = v[ALLSTAFF_COL.FIRST - 1];
      row.last = v[ALLSTAFF_COL.LAST - 1];
      row.fullName = [row.title, row.first, row.last].filter(function (s) { return s && String(s).trim(); }).join('');
    }
    out.push(row);
  }
  return out;
}

/**
 * เพิ่ม "กรอบย่อย (ตน.ในกง.)" เข้า bucket ที่แสดงผลระดับ "รายตำแหน่ง" (ตำแหน่งหนึ่งภายในกลุ่มงานหนึ่ง)
 * นับครั้งเดียวต่อคู่ "กลุ่มงาน x ตำแหน่ง" เพื่อไม่ให้ถูกบวกซ้ำเมื่อมีคนหลายคนอยู่ตำแหน่ง/กลุ่มงานเดียวกัน
 * bucket ต้องมี { standard: 0, hasStandard: false, seenKeys: {} } อยู่แล้วก่อนเรียก
 */
function addPositionStandard_(bucket, r) {
  var sk = r.group18 + '|' + r.position;
  if (r.subframe !== null && !bucket.seenKeys[sk]) {
    bucket.seenKeys[sk] = true;
    bucket.standard += r.subframe;
    bucket.hasStandard = true;
  }
}

/**
 * เพิ่ม "กรอบหลัก (รวมทั้งกลุ่มงาน)" เข้า bucket ที่แสดงผลระดับ "รายกลุ่มงาน" (รวมทุกตำแหน่งในกลุ่มงานนั้น
 * เป็นค่าเดียว ไม่แยกย่อยเป็นรายตำแหน่ง) นับครั้งเดียวต่อกลุ่มงาน โดยไม่สนใจว่าในกลุ่มงานนั้นมีกี่คน
 * กี่ตำแหน่ง หรือกี่หน่วยงานย่อย เพราะกรอบหลักเป็นค่าเดียวที่แทนกรอบรวมทั้งกลุ่มงานอยู่แล้ว
 * bucket ต้องมี { standard: 0, hasStandard: false, seenKeys: {} } อยู่แล้วก่อนเรียก
 */
/**
 * เพิ่ม "กรอบหลัก (รวมทั้งกลุ่มงาน)" เข้า bucket ที่แสดงผลระดับ "รายกลุ่มงาน" (รวมทุกตำแหน่งในกลุ่มงานนั้น
 * เป็นค่าเดียว ไม่แยกย่อยเป็นรายตำแหน่ง)
 *
 * ทบทวนแก้ไข (ตามคำขอผู้ใช้ — พบบั๊กจริงจากข้อมูล allstaff ปัจจุบัน): เดิมฟังก์ชันนี้ dedupe ด้วย
 * "แถวแรกที่พบ" ของกลุ่มงานนั้นเป็นค่าสุดท้ายเลย (สมมุติว่าทุกแถวในกลุ่มงานเดียวกันต้องมีค่ากรอบหลักตรงกัน
 * อยู่แล้ว) แต่ตรวจข้อมูลจริงพบว่าไม่เป็นเช่นนั้นเสมอไป หลายกลุ่มงานมีค่ากรอบหลักไม่ตรงกันในแถวต่างๆของ
 * กลุ่มงานเดียวกัน เช่น "กลุ่มงานบริหารทั่วไป" มีค่า 54 (45 แถว), 15 (15 แถว) และ 12 (1 แถว) ปนกัน — ถ้าใช้
 * ค่าแถวแรกที่พบอาจได้ 15 ทั้งที่ค่าที่ถูกต้องของกลุ่มงานคือ 54 (ยืนยันแล้วโดยผู้ใช้) เช่นเดียวกับ
 * "กลุ่มงานการพยาบาลผู้ป่วยนอก" ที่มีทั้ง 17 (ฝั่งผู้ช่วยพยาบาล/พนักงานช่วยเหลือคนไข้) และ 25 (ฝั่งพยาบาล
 * วิชาชีพ) ปนกันอยู่ในกลุ่มงานเดียวกัน ทำให้ตัวเลขที่แสดงผลดูขัดแย้งกันเอง
 *
 * แก้โดยเปลี่ยนจาก "จำค่าแรกที่เจอ" มาเป็น "เก็บคะแนนโหวตของทุกค่าที่พบ" (mainframeVotes) แล้วให้
 * resolveGroupStandard_() ด้านล่างสรุปเป็นค่าเดียวตอนอ่านผลลัพธ์สุดท้าย โดยเลือกค่าที่มีจำนวนแถวรองรับ
 * มากที่สุด (โหวตข้างมาก) เป็นกรอบหลักที่แสดงผล — ถ้ามีมากกว่า 1 ค่าปรากฏ จะตั้งธง mixedFrame ไว้ด้วย
 * เพื่อให้หน้าเว็บแจ้งผู้ใช้ว่าควรตรวจสอบข้อมูลต้นทางเพิ่มเติม (ไม่ปิดบังว่าข้อมูลยังไม่นิ่ง)
 * bucket ต้องมี object เปล่า {} อยู่แล้วก่อนเรียก (ฟังก์ชันนี้สร้าง mainframeVotes ให้เองครั้งแรกที่เรียก)
 */
function addGroupStandard_(bucket, r) {
  if (r.mainframe !== null) {
    if (!bucket.mainframeVotes) bucket.mainframeVotes = {};
    var k = String(r.mainframe);
    bucket.mainframeVotes[k] = (bucket.mainframeVotes[k] || 0) + 1;
    bucket.hasStandard = true;
  }
}

function resolveGroupStandard_(bucket) {
  if (!bucket.hasStandard || !bucket.mainframeVotes) return { standard: null, mixedFrame: false };
  var keys = Object.keys(bucket.mainframeVotes).map(Number);
  // Solution มืออาชีพ: หากมีการใส่กรอบหลักหลายค่าในกลุ่มงานเดียวกัน ให้ยึด "ค่าสูงสุด (MAX)" เสมอ
  // จะทำให้ "กลุ่มงานบริหารทั่วไป" ได้ 54 แทนที่จะเป็น 15 อย่างแม่นยำ
  var maxVal = Math.max.apply(null, keys);
  return { standard: maxVal, mixedFrame: keys.length > 1 };
}

/**
 * เพิ่ม "กรอบอัตรากำลังตามตำแหน่ง" (POSFRAME) เข้า bucket ที่แสดงผลกราฟ "รายตำแหน่ง" โดยตรง (เช่น
 * ความมั่นคงประเภทการจ้างงาน — รายตำแหน่ง, อัตรากำลังรายตำแหน่งวิชาชีพ (กรอบ vs จริง) พร้อมประเภทการจ้าง)
 * — ต่างจาก addPositionStandard_ (ที่ใช้กรอบย่อย เฉพาะตำแหน่งภายในกลุ่มงานหนึ่ง) ฟังก์ชันนี้ใช้กรอบ
 * อัตรากำลัง "ตามตำแหน่ง" ซึ่งกำหนดไว้เป็นค่าเดียวต่อชื่อตำแหน่งทั้งโรงพยาบาล (ตรวจสอบข้อมูลจริงแล้วว่า
 * ค่าคงที่ต่อชื่อตำแหน่งไม่ว่าจะสังกัดกลุ่มงานใด เช่น "นายแพทย์" = 80, "ผู้ช่วยพยาบาล" = 40 ทุกกลุ่มงาน)
 * จึง dedupe ด้วยชื่อตำแหน่งเพียงอย่างเดียว (ไม่ต้องรวม group18 เข้าไปในคีย์) นับครั้งเดียวต่อตำแหน่งใน
 * ขอบเขตของ bucket นั้น
 * (ทบทวนแก้ไข ตามคำขอผู้ใช้ — รอบล่าสุด): เดิมคอมเมนต์นี้เคยระบุว่าใช้กับ "การกระจายและวิเคราะห์อัตรากำลัง
 * รายตำแหน่ง/สายวิชาชีพ/สายสนับสนุน" ด้วย แต่ผู้ใช้แจ้งว่ากราฟกลุ่มนั้น (อัตรากำลังรายหมวดหมู่ / รายตำแหน่ง
 * — เฉพาะสายวิชาชีพที่สัมผัสผู้ป่วย / รายตำแหน่ง — เฉพาะสายสนับสนุน) ต้องใช้ "กรอบย่อย (ตน.ในกง.)" แทน
 * (ดู addPositionStandard_) จึงย้ายออกจากรายการตัวอย่างด้านบนแล้ว
 * bucket ต้องมี { standard: 0, hasStandard: false, seenKeys: {} } อยู่แล้วก่อนเรียก
 */
function addPositionFrameStandard_(bucket, r) {
  var sk = r.position;
  if (r.posframe !== null && !bucket.seenKeys[sk]) {
    bucket.seenKeys[sk] = true;
    bucket.standard += r.posframe;
    bucket.hasStandard = true;
  }
}

/**
 * เพิ่ม "กรอบอัตรากำลังตามกลุ่มภารกิจ" (MISSIONFRAME) เข้า bucket ที่แสดงผลระดับ "รายภารกิจ" (รวมทุก
 * กลุ่มงานในภารกิจนั้นเป็นค่าเดียว ไม่แยกย่อยเป็นรายกลุ่มงาน) เช่นกราฟ "อัตรากำลังแยกตามภารกิจ" — คนละ
 * ค่ากับการรวมกรอบหลัก (MAINFRAME) ของทุกกลุ่มงานในภารกิจนั้นเข้าด้วยกัน เพราะคอลัมน์นี้เป็นกรอบที่กำหนด
 * ไว้ระดับภารกิจโดยตรงในชีท allstaff อยู่แล้ว (ค่าเดียวต่อภารกิจ) จึง dedupe ด้วย "เลขภารกิจ ป.จริง"
 * (missionNum) เป็นหลัก เพราะเชื่อถือได้กว่าข้อความ "ภารกิจ ตามจ.18" (เหตุผลเดียวกับที่
 * api_getMissionGroupAnalytics เลือกใช้เลขภารกิจ ป.จริง เป็นตัวจัดกลุ่มหลัก) ถ้าแถวไม่มีเลขภารกิจจะ
 * fallback ไปใช้ข้อความภารกิจแทน นับครั้งเดียวต่อภารกิจในขอบเขตของ bucket นั้น
 * bucket ต้องมี { standard: 0, hasStandard: false, seenKeys: {} } อยู่แล้วก่อนเรียก
 */
function addMissionFrameStandard_(bucket, r) {
  var sk = r.missionNum || r.mission18 || '(ไม่ระบุภารกิจ)';
  if (r.missionframe !== null && !bucket.seenKeys[sk]) {
    bucket.seenKeys[sk] = true;
    bucket.standard += r.missionframe;
    bucket.hasStandard = true;
  }
}

function uniqueSorted_(rows, field) {
  var seen = {};
  var out = [];
  rows.forEach(function (r) {
    var v = r[field];
    if (v && !seen[v]) { seen[v] = true; out.push(v); }
  });
  out.sort(function (a, b) { return String(a).localeCompare(String(b), 'th'); });
  return out;
}

/**
 * รายการตัวเลือกสำหรับตัวกรองทั้ง 5 มิติ (นับเฉพาะบุคลากรที่ปฏิบัติงานจริง)
 * ผู้เยี่ยมชมทั่วไปเรียกได้ — ไม่มีข้อมูลชื่อบุคคลปะปนอยู่เลย
 */
function api_getFilterOptions() {
  var rows = readDetailRows_().filter(function (r) { return r.active; });
  return {
    missions: uniqueSorted_(rows, 'mission18'),
    groups: uniqueSorted_(rows, 'group18'),
    positions: uniqueSorted_(rows, 'position'),
    profSupport: uniqueSorted_(rows, 'profSupport'),
    affiliations: uniqueSorted_(rows, 'affil18')
  };
}

/**
 * เพิ่มตามคำขอผู้ใช้ (ข้อ 5 — โหมด "ยื่นคำร้อง" อย่างเดียว ไม่แสดงข้อมูลอัตรากำลังใดๆ):
 * คืนเฉพาะ "รายชื่อกลุ่มงาน + หน่วยงานย่อย" ล้วนๆ ไม่มีตัวเลขจำนวนคน/กรอบปนมาด้วยเลย
 * (ต่างจาก api_getPublicData ที่แม้จะปลอดภัยตาม PDPA แต่ยังมีจำนวนคนติดมาด้วย) ใช้เติม
 * dropdown "กลุ่มงานปัจจุบัน/กลุ่มงานปลายทาง" ในแบบฟอร์มคำร้องของหน้าโหมดนี้โดยเฉพาะ
 */
function api_getRequestFormGroupOptions() {
  var rows = readDetailRows_().filter(function (r) { return r.active; });
  var groupMap = {};
  var order = [];
  rows.forEach(function (r) {
    var key = r.group18 || '(ไม่ระบุกลุ่มงาน)';
    if (key === GROUP_REVIEW_LABEL) return; /* ไม่ใช่กลุ่มงานจริง — ไม่ให้เลือกในแบบฟอร์มคำร้อง */
    if (!groupMap[key]) { groupMap[key] = { name: key, unitSet: {}, unitOrder: [] }; order.push(key); }
    var g = groupMap[key];
    var uKey = r.unitName || '';
    if (uKey && !g.unitSet[uKey]) { g.unitSet[uKey] = true; g.unitOrder.push(uKey); }
  });
  order.sort();
  return order.map(function (key) {
    var g = groupMap[key];
    return { name: g.name, units: g.unitOrder.sort().map(function (u) { return { name: u }; }) };
  });
}

/**
 * สรุปจำนวนจริง/กรอบ แยกตามกลุ่มงาน จ.18 ภายใต้เงื่อนไขตัวกรองที่เลือก
 * filters = { mission, group, position, profSupport, affiliation } (ทุกฟิลด์ไม่บังคับ)
 */
function api_getFilteredBreakdown(filters) {
  filters = filters || {};
  /* ทบทวนแก้ไข (ตามคำขอผู้ใช้): กรอง isSansaiAffiliation_ เช่นเดียวกับ buildGroupsFromDetail_/
   * api_getMissionGroupAnalytics เพื่อไม่ให้บุคลากรสังกัดหน่วยงานอื่นปนอยู่ในตารางสรุปนี้ */
  var rows = readDetailRows_().filter(function (r) { return r.active; });

  var filtered = rows.filter(function (r) {
    if (filters.mission && r.mission18 !== filters.mission) return false;
    if (filters.group && r.group18 !== filters.group) return false;
    if (filters.position && r.position !== filters.position) return false;
    if (filters.profSupport && r.profSupport !== filters.profSupport) return false;
    if (filters.affiliation && r.affil18 !== filters.affiliation) return false;
    return true;
  });

  var byGroup = {};
  filtered.forEach(function (r) {
    var key = r.group18 || '(ไม่ระบุกลุ่มงาน)';
    if (!byGroup[key]) byGroup[key] = { name: key, actual: 0, positionCount: 0, tempInCount: 0, standard: 0, hasStandard: false, seenKeys: {}, isPositionMode: !!filters.position, vacantByPos: {}, vacantOrder: [], awayByPos: {}, awayOrder: [] };
    var g = byGroup[key];
    g.positionCount++;                 /* จำนวนอัตราในทะเบียน (ทุกสถานะ) */
    if (r.isOnSite) g.actual++;        /* จำนวนคน = ผู้ปฏิบัติงานจริงตามนิยามกลาง */
    if (r.statusCode === STATUS_CODE.TEMP_IN) g.tempInCount++;
    /* บัคเก็ตนี้ปกติเป็นระดับ "รายกลุ่มงาน" → ใช้กรอบหลัก แต่ถ้าผู้ใช้กรองมาเฉพาะ "ตำแหน่ง" หนึ่งแล้ว
     * (filters.position) มุมมองจะแคบลงเหลือ "ตำแหน่งนั้นในแต่ละกลุ่มงาน" ซึ่งเป็นระดับรายตำแหน่งแล้ว
     * จึงต้องสลับไปใช้กรอบย่อยแทน ไม่เช่นนั้นจำนวนจริง (เฉพาะตำแหน่งที่กรอง) จะถูกเทียบกับกรอบหลัก
     * (ทั้งกลุ่มงานทุกตำแหน่ง) ซึ่งคนละขอบเขตกัน ทำให้ตัวเลขเทียบกันไม่ได้ */
    if (filters.position) {
      addPositionStandard_(g, r);
    } else {
      addGroupStandard_(g, r);
    }
    /* ทบทวนเพิ่ม: ตำแหน่งที่ยังไม่มีคนครอง (เช่น "นิติกร" ที่มีหมายเหตุ "ไม่มีคนครอง" ในชีท allstaff)
     * ให้นับรวมและระบุชื่อตำแหน่งไว้ เพื่อให้ตารางสรุปรายกลุ่มงานที่ทุกคนเห็นได้ (มุมมองข้อมูลตามหมวด)
     * บอกได้ว่ากลุ่มงานนี้มีตำแหน่งว่างอยู่กี่ตำแหน่ง ตำแหน่งอะไรบ้าง โดยไม่เปิดเผยชื่อบุคคลใดๆ */
    if (isVacantRow_(r)) {
      var pName = r.position || '(ไม่ระบุตำแหน่ง)';
      if (!g.vacantByPos[pName]) { g.vacantByPos[pName] = 0; g.vacantOrder.push(pName); }
      g.vacantByPos[pName]++;
    } else if (isAwayRow_(r)) {
      /* ทบทวนเพิ่ม (ตามคำขอผู้ใช้): ตำแหน่งที่ "มีคนครอง" ตามทะเบียน แต่คอลัมน์สถานะของ allstaff ระบุว่า
       * ไปช่วยราชการที่อื่น/ลาศึกษาต่อ/ลาออกแล้ว — ไม่ได้ปฏิบัติงานอยู่ที่โรงพยาบาลจริงในขณะนี้ จึงแยกนับ
       * ไว้ต่างหากจาก "ตำแหน่งว่าง" (เพราะยังมีเจ้าของตำแหน่งอยู่ ไม่ใช่ตำแหน่งไม่มีคนครอง) เพื่อไม่ให้
       * ตัวเลข "จริง" กับจำนวนคนที่ปฏิบัติงานอยู่จริงในพื้นที่ดูขัดแย้งกันโดยไม่มีคำอธิบาย */
      var apName = r.position || '(ไม่ระบุตำแหน่ง)';
      if (!g.awayByPos[apName]) { g.awayByPos[apName] = 0; g.awayOrder.push(apName); }
      g.awayByPos[apName]++;
    }
  });

  var groups = Object.keys(byGroup).map(function (k) {
    var g = byGroup[k];
    /* g.isPositionMode = true เมื่อ addPositionStandard_ ถูกใช้ (ยังเขียน g.standard/hasStandard แบบเดิม
     * โดยตรง) — มิเช่นนั้นใช้ addGroupStandard_ (แบบโหวต) ต้องอ่านผ่าน resolveGroupStandard_() แทน */
    var standard, mixedFrame = false;
    if (g.isPositionMode) {
      standard = g.hasStandard ? g.standard : null;
    } else {
      var resolved = resolveGroupStandard_(g);
      standard = resolved.standard;
      mixedFrame = resolved.mixedFrame;
    }
    var vacantPositions = g.vacantOrder.map(function (p) { return { position: p, count: g.vacantByPos[p] }; });
    var vacantCount = vacantPositions.reduce(function (s, v) { return s + v.count; }, 0);
    var awayPositions = g.awayOrder.map(function (p) { return { position: p, count: g.awayByPos[p] }; });
    var awayCount = awayPositions.reduce(function (s, v) { return s + v.count; }, 0);
    return {
      name: g.name,
      actual: g.actual,
      standard: standard,
      diff: standard === null ? null : (g.actual - standard),
      mixedFrame: mixedFrame,
      vacantCount: vacantCount,
      vacantPositions: vacantPositions,
      awayCount: awayCount,
      awayPositions: awayPositions,
      /* ทบทวนเพิ่ม: จำนวนที่ "ปฏิบัติงานอยู่จริงในพื้นที่ขณะนี้" = จริง - ว่าง - ไปช่วยที่อื่น/ลาศึกษา/ลาออก */
      onSiteCount: g.actual,
      positionCount: g.positionCount,
      tempInCount: g.tempInCount
    };
  }).sort(function (a, b) { return b.actual - a.actual; });

  var totalStandard = groups.reduce(function (s, g) { return s + (g.standard || 0); }, 0);
  var anyStandard = groups.some(function (g) { return g.standard !== null; });
  var totalVacant = groups.reduce(function (s, g) { return s + g.vacantCount; }, 0);
  var totalAway = groups.reduce(function (s, g) { return s + g.awayCount; }, 0);
  var totalOnSiteSum = groups.reduce(function (s, g) { return s + g.actual; }, 0);

  return {
    totalActual: totalOnSiteSum,
    totalStandard: anyStandard ? totalStandard : null,
    totalVacant: totalVacant,
    totalAway: totalAway,
    totalOnSite: totalOnSiteSum,
    totalPositions: filtered.length,
    groups: groups
  };
}

/**
 * สรุปจำนวนจริง/กรอบ แยกตาม "กลุ่มภารกิจ" แล้วภายในแต่ละภารกิจแยกย่อยตาม
 * "กลุ่มงาน (ป.จริง ตามโครงสร้าง)" อีกชั้น — ใช้วาดกราฟแยกการ์ดตามภารกิจในหน้าแดชบอร์ด
 * มิติ "ภารกิจ" ยึดตาม "เลขภารกิจ ป.จริง" (เลขภารกิจตามโครงสร้างจริง) เป็นตัวกำหนดขอบเขตกลุ่ม แทนที่จะ
 * ยึดตาม "ภารกิจ ตามจ.18" (ข้อความ) เพราะพบว่าบางแถวถูกกรอก "ภารกิจ ตามจ.18" ไม่ตรงกับเลขภารกิจ ป.จริง
 * ของกลุ่มงานที่แถวนั้นสังกัดอยู่จริง จึงยึดเลขภารกิจ ป.จริง เป็นหลัก แล้วเลือกข้อความ "ภารกิจ ตามจ.18"
 * ที่พบมากที่สุดในแต่ละเลขภารกิจมาใช้เป็นชื่อแสดงผล (เพราะไม่มีคอลัมน์ชื่อภารกิจแบบ ป.จริง ในชีทต้นฉบับ)
 * มิติแท่งย่อยภายในภารกิจยึดตาม "กลุ่มงาน (ป.จริง ตามโครงสร้าง)" (เคยลองเปลี่ยนเป็น "หน่วยงานย่อย
 * (ตัวย่อ)" ระดับละเอียดกว่านี้ แต่ดูกราฟแล้วละเอียดเกินไป ไม่เหมาะกับมุมมองภาพรวมระดับภารกิจ จึงย้อนกลับ
 * มาที่ระดับกลุ่มงานตามเดิม) ผู้เยี่ยมชมทั่วไปเรียกได้ เป็นข้อมูลระดับตัวเลขรวม ไม่มีชื่อบุคคล
 *
 * --- ปรับปรุง (แก้ปัญหากราฟ "จริง vs เกณฑ์ รายกลุ่มงาน" ดูไม่สมเหตุสมผล) ------------------------------
 * ตรวจสอบข้อมูลจริงใน FTE_Detail พบสาเหตุ 2 ข้อที่ทำให้กราฟเดิมดูสับสน/ไม่สมเหตุสมผล:
 *   1) บางแถว (10 แถว) คอลัมน์ "กลุ่มงาน (ป.จริง ตามโครงสร้าง)" ถูกกรอกเป็นชื่อ "ภารกิจ..." แทนที่จะเป็น
 *      ชื่อกลุ่มงาน (เช่น id 261, 266, 277 ฯลฯ) ทำให้มีแท่งกราฟที่ label เป็นชื่อภารกิจไปปนอยู่ในการ์ด
 *      กลุ่มงาน แก้โดย resolveGroupLabel_() ตรวจจับแถวที่ค่าในคอลัมน์นี้มีคำว่า "ภารกิจ" ปน แล้วสำรอง
 *      (fallback) ไปใช้ "กลุ่มงาน จ.18" แทนเฉพาะแถวนั้น (ยังคงเป็นชื่อกลุ่มงานจริง เพียงไม่ใช่เวอร์ชัน ป.จริง)
 *   2) กลุ่มงาน (ป.จริง ตามโครงสร้าง) เดียวกัน 12 กลุ่ม มีบุคลากรบางส่วนถูกระบุ "เลขภารกิจ ป.จริง" ต่างจาก
 *      เพื่อนร่วมกลุ่มงานเดียวกัน (เช่น "กลุ่มงานบริหารทั่วไป" กระจายอยู่ใต้ภารกิจ 1, 3 และ 5) เดิมโค้ด
 *      แยกตามเลขภารกิจรายแถว ผลคือกลุ่มงานเดียวกันถูกฉีกเป็นแท่งเล็กๆ กระจายไปคนละการ์ด ยอดจริง/เกณฑ์ที่
 *      เห็นในแต่ละการ์ดจึงเป็นแค่เศษเสี้ยวของกลุ่มงานนั้น เทียบกันแล้วดูไม่สมเหตุสมผล แก้โดยให้แต่ละกลุ่มงาน
 *      มี "ภารกิจหลัก" เพียงหนึ่งเดียว (ยึดเสียงข้างมากของเลขภารกิจ ป.จริง ในหมู่บุคลากรกลุ่มงานนั้น) แล้ว
 *      รวมยอดจริง/เกณฑ์ทั้งหมดของกลุ่มงานไว้ในการ์ดภารกิจหลักการ์ดเดียว — กลุ่มงานที่มีข้อมูลไม่ตรงกัน (mixed)
 *      จะถูกทำเครื่องหมาย mixedMission:true ส่งกลับไปให้หน้าเว็บแสดงหมายเหตุ เพื่อความโปร่งใส ไม่ปิดบังว่า
 *      ข้อมูลต้นทางมีความไม่ตรงกันอยู่ (ควรให้หน่วยงานตรวจสอบแก้ที่ต้นทางต่อไป)
 * ผลลัพธ์เพิ่มเติม `dataIssues` สรุปจำนวนแถวที่ตรวจพบปัญหาทั้ง 2 ข้อ สำหรับผู้ดูแลระบบใช้ตรวจสอบ/แก้ไขที่
 * ต้นทาง (ไม่กระทบผู้เยี่ยมชมทั่วไป เป็นแค่ตัวเลขสรุป ไม่มีชื่อบุคคล)
 *
 * --- ปรับปรุง (ตามคำขอผู้ใช้): แผงนี้ต้องแสดงเฉพาะกำลังคนของ "โรงพยาบาลสันทราย" เท่านั้น ---------------
 * ชีท allstaff มีบุคลากรบางส่วน (พบ 8 แถวจากทั้งหมด 877 แถว ณ ข้อมูลล่าสุด) ที่คอลัมน์ "สังกัด ตามจ.18"
 * (affil18) ระบุเป็นหน่วยงานอื่น เช่น "รพ.นครพิงค์", "รพช.ดอยสะเก็ด", "รพช.แม่ออน", "รพท.สันป่าตอง",
 * "รพ.เวียงแหง", "รพ.ฝาง", "สสอ. แม่อาย จ.เชียงใหม่" (อาจเป็นบุคลากรที่ไปช่วย/มาช่วยราชการข้ามหน่วยงาน
 * แต่ยังถูกบันทึกไว้ในทะเบียนชุดนี้) แถวเหล่านี้ไม่ควรถูกนับรวมในแดชบอร์ด "กลุ่มภารกิจ" ของโรงพยาบาลสันทราย
 * จึงกรองด้วย isSansaiAffiliation_() (ตรวจคำว่า "สันทราย" ในคอลัมน์สังกัด) ก่อนคำนวณทุกอย่างด้านล่าง —
 * ใช้ตรวจแบบ substring แทนเทียบข้อความตรงตัวทั้งหมด เพื่อทนต่อรูปแบบการเขียนชื่อที่ต่างกันเล็กน้อย เช่น
 * "รพท.สันทราย" / "โรงพยาบาลสันทราย" ที่อาจพบได้ในอนาคต — คัดกรองเฉพาะแผงนี้เท่านั้น ไม่กระทบกราฟ/แผงอื่น
 * ในระบบ (ตามที่ผู้ใช้ระบุว่าต้องการเฉพาะ "ในส่วนนี้")
 */
var SANSAI_AFFIL_KEYWORD = 'สันทราย';
function isSansaiAffiliation_(affil18) {
  return String(affil18 || '').indexOf(SANSAI_AFFIL_KEYWORD) !== -1;
}

function api_getMissionGroupAnalytics() {
  var rows = readDetailRows_().filter(function (r) { return r.active; });

  var badGroupLabelRows = [];
  var FACILITY_NAME_PREFIX_RE = /^(รพ\.|รพสต\.)/;
  function resolveGroupLabel_(r) {
    var raw = r.groupStruct || '';
    if (!raw || raw.indexOf('ภารกิจ') !== -1 || FACILITY_NAME_PREFIX_RE.test(raw)) {
      badGroupLabelRows.push(r.id);
      return r.group18 || '(ไม่ระบุกลุ่มงาน)';
    }
    return raw;
  }

  var groupMissionVotes = {};
  rows.forEach(function (r) {
    var label = resolveGroupLabel_(r);
    var mKey = r.missionNum ? String(r.missionNum) : '(ไม่ระบุภารกิจ)';
    if (!groupMissionVotes[label]) groupMissionVotes[label] = {};
    groupMissionVotes[label][mKey] = (groupMissionVotes[label][mKey] || 0) + 1;
  });
  var groupHomeMission = {};
  var groupMixedMission = {};
  var mixedGroupCount = 0;
  Object.keys(groupMissionVotes).forEach(function (label) {
    var votes = groupMissionVotes[label];
    var keys = Object.keys(votes);
    groupMixedMission[label] = keys.length > 1;
    if (keys.length > 1) mixedGroupCount++;
    groupHomeMission[label] = keys.sort(function (a, b) { return votes[b] - votes[a]; })[0];
  });

  var groupIdentityVotes = {};
  rows.forEach(function (r) {
    var label = resolveGroupLabel_(r);
    var gKey = r.group18 || '(ไม่ระบุกลุ่มงาน)';
    if (!groupIdentityVotes[label]) groupIdentityVotes[label] = {};
    groupIdentityVotes[label][gKey] = (groupIdentityVotes[label][gKey] || 0) + 1;
  });
  var groupHomeIdentity = {};
  var groupMixedIdentity = {};
  var mixedIdentityCount = 0;
  Object.keys(groupIdentityVotes).forEach(function (label) {
    var votes = groupIdentityVotes[label];
    var keys = Object.keys(votes);
    groupMixedIdentity[label] = keys.length > 1;
    if (keys.length > 1) mixedIdentityCount++;
    groupHomeIdentity[label] = keys.sort(function (a, b) { return votes[b] - votes[a]; })[0];
  });

  var missionMap = {};
  var missionOrder = [];
  rows.forEach(function (r) {
    var label = resolveGroupLabel_(r);
    var mKey = groupHomeMission[label];
    if (!missionMap[mKey]) {
      missionMap[mKey] = { num: (mKey === '(ไม่ระบุภารกิจ)' ? null : mKey), nameVotes: {}, nameOrder: [], groups: {}, groupOrder: [] };
      missionOrder.push(mKey);
    }
    var mission = missionMap[mKey];

    var nameLabel = r.mission18 || '(ไม่ระบุภารกิจ)';
    if (!mission.nameVotes[nameLabel]) { mission.nameVotes[nameLabel] = 0; mission.nameOrder.push(nameLabel); }
    mission.nameVotes[nameLabel]++;

    if (!mission.groups[label]) {
      mission.groups[label] = {
        name: label, actual: 0, standard: 0, hasStandard: false, seenKeys: {}, byType: {},
        mixedMission: groupMixedMission[label], mixedIdentity: groupMixedIdentity[label],
        /* เพิ่มตามคำขอผู้ใช้ (ข้อ 3 — แยกแท่งวิชาชีพ/สนับสนุนในกราฟกลุ่มงาน): เก็บ bucket แยกสาย
         * วิชาชีพ/สนับสนุน แต่ละอันมีทั้ง "ปฏิบัติงานจริง" (actual) และ "กรอบย่อย" (standard, ใช้
         * addPositionStandard_ dedupe ด้วยคู่ กลุ่มงาน|ตำแหน่ง เหมือนกราฟรายตำแหน่งอื่นๆ ในระบบ
         * ไม่ใช้กรอบหลัก/mainframe เพราะกรอบหลักเป็นค่าเดียวรวมทั้งกลุ่มงาน แยกสายงานไม่ได้) */
        prof: { actual: 0, standard: 0, hasStandard: false, seenKeys: {} },
        support: { actual: 0, standard: 0, hasStandard: false, seenKeys: {} }
      };
      mission.groupOrder.push(label);
    }
    var g = mission.groups[label];
    
    var et = r.employType || '(ไม่ระบุ)';
    if (r.isOnSite) {
      g.actual++;
      g.byType[et] = (g.byType[et] || 0) + 1;
    }
    
    if (r.group18 === groupHomeIdentity[label]) {
      addGroupStandard_(g, r);
    }

    /* เพิ่มตามคำขอผู้ใช้: แยกสะสม วิชาชีพ vs สนับสนุน ต่อกลุ่มงาน — ใช้ค่า r.profSupport ตรงตัวจากชีท
     * (มีแค่ 2 ค่าหลักในข้อมูลจริงคือ "วิชาชีพ" กับ "สนับสนุน" ค่าอื่น/ว่างจะไม่ถูกนับในทั้งสองฝั่งนี้
     * เพื่อไม่ให้ผลรวม prof+support เกินยอดรวม actual ของกลุ่มงานโดยไม่มีคำอธิบาย) */
    var psBucket = (r.profSupport === 'วิชาชีพ') ? g.prof : (r.profSupport === 'สนับสนุน' ? g.support : null);
    if (psBucket) {
      if (r.isOnSite) psBucket.actual++;
      addPositionStandard_(psBucket, r);
    }
  });

  var missions = missionOrder.map(function (mKey) {
    var m = missionMap[mKey];
    var bestName = m.nameOrder.slice().sort(function (a, b) { return m.nameVotes[b] - m.nameVotes[a]; })[0];
    var groups = m.groupOrder.map(function (gKey) {
      var g = m.groups[gKey];
      var resolved = resolveGroupStandard_(g);
      var standard = resolved.standard;
      return {
        name: g.name,
        actual: g.actual,
        standard: standard,
        diff: standard === null ? null : (g.actual - standard),
        byType: g.byType,
        mixedMission: g.mixedMission,
        mixedIdentity: g.mixedIdentity,
        mixedFrame: resolved.mixedFrame,
        /* เพิ่มตามคำขอผู้ใช้ (ข้อ 3): ยอดแยกสายวิชาชีพ/สนับสนุน ต่อกลุ่มงาน — ใช้แสดงเป็นแท่งเพิ่มใน
         * กราฟ "จำนวนจริงเทียบกับเกณฑ์ รายกลุ่มภารกิจ" (ปฏิบัติงาน 1 แท่ง + กรอบ 1 แท่ง ต่อสาย) */
        profActual: g.prof.actual,
        profStandard: g.prof.hasStandard ? g.prof.standard : null,
        supportActual: g.support.actual,
        supportStandard: g.support.hasStandard ? g.support.standard : null
      };
    }).sort(function (a, b) { return b.actual - a.actual; });

    var totalActual = groups.reduce(function (s, g) { return s + g.actual; }, 0);
    var stdGroups = groups.filter(function (g) { return g.standard !== null; });
    var totalStandard = stdGroups.length ? stdGroups.reduce(function (s, g) { return s + g.standard; }, 0) : null;

    return {
      name: bestName, num: m.num, groupCount: groups.length,
      totalActual: totalActual, totalStandard: totalStandard, groups: groups
    };
  }).sort(function (a, b) {
    var na = Number(a.num), nb = Number(b.num);
    if (!isNaN(na) && !isNaN(nb) && a.num !== '' && b.num !== '') return na - nb;
    return String(a.name).localeCompare(String(b.name), 'th');
  });

  var mixedFrameGroupCount = 0;
  missions.forEach(function (m) {
    m.groups.forEach(function (g) { if (g.mixedFrame) mixedFrameGroupCount++; });
  });

  return {
    missions: missions,
    dataIssues: {
      badGroupLabelRowCount: badGroupLabelRows.length,
      badGroupLabelRowIds: badGroupLabelRows,
      mixedMissionGroupCount: mixedGroupCount,
      mixedIdentityGroupCount: mixedIdentityCount,
      mixedFrameGroupCount: mixedFrameGroupCount,
      otherHospitalExcludedCount: 0
    }
  };
}

/**
 * รายละเอียดรายตำแหน่งจาก FTE_Detail — "เฉพาะแอดมิน" เท่านั้น
 * ------------------------------------------------------------------
 * ทบทวนความเหมาะสมของการแสดงผล (PDPA):
 *   - ตารางนี้ไม่มีคอลัมน์ชื่อ-สกุลบุคคลใด ๆ เลย (ดึงจาก FTE_Detail ไม่ใช่ StaffNames)
 *     จึงไม่ขัดต่อหลักการคุ้มครองข้อมูลส่วนบุคคลในตัวเอง
 *   - อย่างไรก็ตาม คอลัมน์ "สถานะ" (เช่น ว่าง/ครอง/ยุบเลิก) และ "ตำแหน่งบริหาร"
 *     เป็นข้อมูลละเอียดระดับตำแหน่งงานที่ระบุตัวบุคคลได้ทางอ้อมเมื่อดูประกอบกับ
 *     หน่วยงาน + ตำแหน่ง (เช่น "หัวหน้ากลุ่มงาน ก." มักมีผู้ครองตำแหน่งเพียงคนเดียว)
 *     จึงจำกัดให้แสดงเฉพาะในโหมดผู้ดูแลระบบที่ login แล้วเท่านั้น เพื่อความเหมาะสม
 *     ผู้เยี่ยมชมทั่วไปยังคงเห็นได้เฉพาะข้อมูลสรุปจำนวนผ่าน api_getFilteredBreakdown
 */
function api_adminGetDetailRows(token, filters) {
  verifyToken_(token);
  filters = filters || {};
  var rows = readDetailRows_().filter(function (r) { return r.active; });

  var filtered = rows.filter(function (r) {
    if (filters.mission && r.mission18 !== filters.mission) return false;
    if (filters.group && r.group18 !== filters.group) return false;
    if (filters.position && r.position !== filters.position) return false;
    if (filters.profSupport && r.profSupport !== filters.profSupport) return false;
    if (filters.affiliation && r.affil18 !== filters.affiliation) return false;
    if (filters.adminOnly && !r.adminPos) return false; // เฉพาะแถวที่มีตำแหน่งบริหารระบุไว้
    return true;
  });

  return filtered.map(function (r) {
    return {
      id: r.id,
      position: r.position,
      unitName: r.unitName,
      unitAbbr: r.unitAbbr,
      group18: r.group18,
      mission18: r.mission18,
      employType: r.employType,
      status: r.status,
      statusCategory: r.statusCategory,
      statusLabel: r.statusLabel,
      adminPos: r.adminPos,
      adminPosIsTitle: r.adminPosIsTitle,
      adminPosParts: r.adminPosParts,
      note: r.note, /* ทบทวนแก้ไข: เพิ่ม note เพื่อให้หน้าเว็บแสดงเหตุผลของตำแหน่งว่าง เช่น "ไม่มีคนครอง" ได้ */
      noteCategory: r.noteCategory
    };
  }).sort(function (a, b) {
    return String(a.unitName).localeCompare(String(b.unitName), 'th')
      || String(a.position).localeCompare(String(b.position), 'th');
  });
}

/**
 * สรุปภาพรวม "สถานะ" และ "หมายเหตุ" ทั้งโรงพยาบาลแบบนับจำนวนต่อหมวด — สำหรับให้แอดมิน/ฝ่ายการเจ้าหน้าที่
 * เห็นภาพรวมเชิงวิเคราะห์ได้ทันทีว่า ตอนนี้มีตำแหน่งว่างกี่อัตรา มีเลขตำแหน่งชั่วคราวรอดำเนินการกี่รายการ
 * มีกี่คนไปช่วย/มาช่วยราชการ ฯลฯ โดยไม่ต้องไล่อ่านคอลัมน์หมายเหตุทีละแถวเอง
 * จำกัดเฉพาะแอดมิน เพราะแม้จะเป็นตัวเลขสรุป แต่คอลัมน์ "หมายเหตุ" บางแถวมีชื่อคนแทรกอยู่ (เช่น
 * "ไม่มีคนครอง รับเลื่อน (พราวเดือน)") จึงยึดนโยบายเดียวกับ note/status ในตารางรายละเอียด คือแอดมินเท่านั้น
 */
function api_adminGetStaffingSummary(token) {
  verifyToken_(token);
  var rows = readDetailRows_().filter(function (r) { return r.active; });

  var statusCounts = {};
  var noteCounts = {};
  var adminPosTotal = 0;
  var adminPosSuspect = 0;
  var suspectExamples = [];

  rows.forEach(function (r) {
    var sc = r.statusCategory || 'normal';
    statusCounts[sc] = (statusCounts[sc] || 0) + 1;

    if (r.note) {
      var nc = r.noteCategory || 'other';
      noteCounts[nc] = (noteCounts[nc] || 0) + 1;
    }

    if (r.adminPos) {
      adminPosTotal++;
      if (!r.adminPosIsTitle) {
        adminPosSuspect++;
        if (suspectExamples.length < 10) {
          suspectExamples.push({ id: r.id, position: r.position, unitName: r.unitName, adminPos: r.adminPos });
        }
      }
    }
  });

  return {
    totalActive: rows.length,
    totalOnSite: rows.filter(function (r) { return r.isOnSite; }).length,
    statusCounts: statusCounts,
    statusLabels: STATUS_CATEGORY_LABEL,
    noteCounts: noteCounts,
    noteLabels: NOTE_CATEGORY_LABEL,
    adminPosTotal: adminPosTotal,
    adminPosSuspect: adminPosSuspect,
    adminPosSuspectExamples: suspectExamples
  };
}

/* ============================== AUTH ============================== */

/**
 * ทบทวนแก้ไข (ตามคำขอผู้ใช้ — ขอแบบ "ไม่ใช่หุ่นยนต์" ของ Google จริงๆ ไม่ใช่โจทย์เลขคณิตทำเอง):
 * เข้าสู่ระบบแอดมิน/คณะกรรมการทรัพยากรบุคคล ต้องผ่าน Google reCAPTCHA v2 ("ฉันไม่ใช่หุ่นยนต์") ก่อนเสมอ
 * recaptchaToken มาจาก widget ฝั่งไคลเอนต์ ตรวจสอบความถูกต้องกับเซิร์ฟเวอร์ของ Google โดยตรงผ่าน
 * verifyRecaptcha_ (เซิร์ฟเวอร์นี้ยิง request ไปหา Google เอง ไม่ได้เชื่อคำตอบจากฝั่งไคลเอนต์เลย)
 */
function api_adminLogin(password, recaptchaToken) {
  try {
    verifyRecaptcha_(recaptchaToken);
  } catch (err) {
    logActivity_('admin_login', { result: 'fail_recaptcha', detail: err.message });
    return { ok: false, message: err.message };
  }
  var stored = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!stored) {
    logActivity_('admin_login', { result: 'fail_not_configured' });
    return { ok: false, message: 'ยังไม่ได้ตั้งค่ารหัสผ่านผู้ดูแลระบบ (ADMIN_PASSWORD) ใน Script Properties' };
  }
  if (String(password) !== String(stored)) {
    logActivity_('admin_login', { result: 'fail_password' });
    return { ok: false, message: 'รหัสผ่านไม่ถูกต้อง' };
  }
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put('admin_' + token, '1', SESSION_TTL_SECONDS);
  logActivity_('admin_login', { result: 'success' });
  return { ok: true, token: token };
}

function api_adminLogout(token) {
  if (token) CacheService.getScriptCache().remove('admin_' + token);
  logActivity_('admin_logout', { result: 'success' });
  return { ok: true };
}

/**
 * เพิ่มตามคำขอผู้ใช้ (ระบบ session 1 ชั่วโมง ลดความรำคาญในการใช้งาน): ให้ฝั่ง Index.html เรียกจุดนี้
 * ตอนเปิดหน้าเว็บใหม่ เพื่อเช็คว่า token ที่จำไว้ใน localStorage ของเบราว์เซอร์ (จากการ login ครั้งก่อน
 * ภายใน 1 ชั่วโมงที่ผ่านมา) ยังใช้ได้อยู่หรือไม่ — ถ้ายังไม่หมดอายุ จะข้ามหน้าประตูทางเข้า/ไม่ต้องพิมพ์
 * รหัสผ่านซ้ำ เข้าสู่โหมดแอดมินได้ทันที ถ้าหมดอายุแล้วจะโยน error กลับไปให้ฝั่งเว็บลบ token เก่าทิ้ง
 * แล้วเปิดหน้าประตูทางเข้าให้กรอกรหัสผ่านใหม่ตามปกติ (ใช้ verifyToken_ ตัวเดียวกับ endpoint อื่นๆ
 * ทุกประการ จึงต่ออายุเซสชันให้อัตโนมัติเหมือนกัน ไม่ใช่แค่ "เช็คเฉยๆ" โดยไม่ต่ออายุ)
 */
function api_adminVerifySession(token) {
  verifyToken_(token);
  return { ok: true };
}

function verifyToken_(token) {
  if (!token) throw new Error('กรุณาเข้าสู่ระบบก่อนทำรายการนี้');
  var cache = CacheService.getScriptCache();
  var valid = cache.get('admin_' + token);
  if (!valid) throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  cache.put('admin_' + token, '1', SESSION_TTL_SECONDS); // ต่ออายุเซสชันเมื่อมีการใช้งาน
}

/* ============================== ประตูทางเข้าเว็บ (Entry Gate) / reCAPTCHA / Activity Log ============
 * ทบทวนเพิ่ม (ตามคำขอผู้ใช้): ก่อนเข้าใช้งานเว็บ ผู้ใช้ต้องเลือกก่อนว่าตนเองเข้าในฐานะ "ผู้เยี่ยมชม"
 * (ระบุกลุ่มงานของตนเอง) หรือ "คณะกรรมการทรัพยากรบุคคล" (กรอกรหัสผ่าน) โดยทั้งสองทางต้องผ่าน Google
 * reCAPTCHA v2 ("ฉันไม่ใช่หุ่นยนต์") และกดยินยอมนโยบายคุกกี้/ประวัติการเข้าใช้งานก่อนเสมอ ทุกความพยายาม
 * เข้าใช้งาน (ทั้งสำเร็จและไม่สำเร็จ) รวมถึงการแก้ไขข้อมูลของแอดมิน จะถูกบันทึกไว้ในชีท ActivityLog
 * เพื่อการตรวจสอบย้อนหลัง (audit trail) ==================================================== */

/**
 * ตรวจสอบ token จาก Google reCAPTCHA v2 กับเซิร์ฟเวอร์ของ Google โดยตรง (server-to-server ผ่าน
 * UrlFetchApp) — ไม่เชื่อผลจากฝั่งไคลเอนต์เด็ดขาด เพราะ token ปลอมหรือแก้ไขค่าใน JS ฝั่งไคลเอนต์ตรวจจับ
 * ไม่ได้ถ้าไม่ยืนยันกับ Google อีกที ต้องตั้งค่า RECAPTCHA_SECRET_KEY ใน Script Properties ก่อน
 * (คู่กับ RECAPTCHA_SITE_KEY ที่ฝังไว้ในหน้าเว็บผ่าน doGet — ดู getProp_('RECAPTCHA_SITE_KEY', ''))
 * ขอคีย์ทั้งคู่ได้ฟรีที่ https://www.google.com/recaptcha/admin (เลือกประเภท reCAPTCHA v2 "ช่องทำเครื่องหมาย
 * ฉันไม่ใช่โปรแกรมอัตโนมัติ")
 */
function verifyRecaptcha_(recaptchaToken) {
  if (!recaptchaToken) throw new Error('กรุณายืนยันตัวตน "ฉันไม่ใช่หุ่นยนต์" ก่อน');
  var secret = PropertiesService.getScriptProperties().getProperty('RECAPTCHA_SECRET_KEY');
  if (!secret) throw new Error('ยังไม่ได้ตั้งค่า RECAPTCHA_SECRET_KEY ใน Script Properties — กรุณาติดต่อผู้ดูแลระบบ');
  var resp = UrlFetchApp.fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'post',
    payload: { secret: secret, response: recaptchaToken },
    muteHttpExceptions: true
  });
  var json;
  try {
    json = JSON.parse(resp.getContentText());
  } catch (e) {
    throw new Error('ไม่สามารถตรวจสอบกับ Google reCAPTCHA ได้ในขณะนี้ กรุณาลองใหม่');
  }
  if (!json || !json.success) {
    throw new Error('ยืนยันตัวตน "ฉันไม่ใช่หุ่นยนต์" ไม่สำเร็จ กรุณาลองใหม่');
  }
}

/**
 * ทางเข้าเว็บสำหรับ "ผู้เยี่ยมชม" — ไม่ต้องมีรหัสผ่าน แต่ต้องผ่าน reCAPTCHA, ระบุกลุ่มงานของตนเอง
 * และกดยินยอมนโยบายคุกกี้/ประวัติการเข้าใช้งานก่อนเสมอ ไม่ได้สร้าง token/สิทธิ์พิเศษใดๆ เพียงแค่บันทึก
 * กิจกรรมการเข้าใช้งานไว้เป็นหลักฐาน (audit trail) เท่านั้น สิทธิ์การเข้าถึงข้อมูลของผู้เยี่ยมชมยังคง
 * เหมือนเดิมทุกประการ (เห็นเฉพาะข้อมูลสาธารณะ ไม่มีชื่อบุคคล)
 */
function api_visitorEnter(department, consent, recaptchaToken) {
  try {
    verifyRecaptcha_(recaptchaToken);
  } catch (err) {
    logActivity_('visitor_enter', { result: 'fail_recaptcha', detail: err.message, department: department });
    return { ok: false, message: err.message };
  }
  if (!consent) {
    return { ok: false, message: 'กรุณายินยอมนโยบายคุกกี้และประวัติการเข้าใช้งานก่อนเข้าสู่เว็บไซต์' };
  }
  var dep = String(department || '').trim();
  if (!dep) {
    return { ok: false, message: 'กรุณาระบุกลุ่มงานของท่าน' };
  }
  logActivity_('visitor_enter', { result: 'success', department: dep, consent: true });
  return { ok: true };
}

var ACTIVITY_LOG_SHEET_NAME = 'ActivityLog';
var ACTIVITY_LOG_HEADERS = ['เวลา', 'ประเภทกิจกรรม', 'บทบาท', 'กลุ่มงาน (ผู้เยี่ยมชม)', 'ผลลัพธ์', 'รายละเอียด', 'ยินยอมคุกกี้/ประวัติ'];

/** เปิดหรือสร้างชีท ActivityLog (สร้างใหม่พร้อมหัวตารางถ้ายังไม่มี เนื่องจากเป็นฟีเจอร์ใหม่ที่สเปรดชีต
 * เดิมของผู้ใช้อาจยังไม่มีแท็บนี้ — รูปแบบเดียวกับ getTransferSheet_) */
function getActivityLogSheet_() {
  var ss = getSpreadsheet_();
  var sheet = findSheetLoose_(ss, ACTIVITY_LOG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ACTIVITY_LOG_SHEET_NAME);
    sheet.getRange(1, 1, 1, ACTIVITY_LOG_HEADERS.length).setValues([ACTIVITY_LOG_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * บันทึกกิจกรรมลงชีท ActivityLog — ใช้ทั้งบันทึกความพยายามเข้าใช้งาน (สำเร็จ/ไม่สำเร็จ) และการแก้ไข
 * ข้อมูลของแอดมิน/คณะกรรมการ ตั้งใจให้ "ห้ามทำให้ระบบหลักล้ม" แม้เขียนชีทไม่สำเร็จ (เช่น ชีทถูกล็อกชั่วคราว)
 * จึงครอบด้วย try/catch เงียบๆ ไว้ — การบันทึก log ไม่ควรเป็นเหตุให้ผู้ใช้งานจริงทำรายการไม่สำเร็จ
 */
function logActivity_(action, data) {
  try {
    data = data || {};
    var sheet = getActivityLogSheet_();
    var role = (action.indexOf('admin') === 0) ? 'คณะกรรมการทรัพยากรบุคคล/แอดมิน' : 'ผู้เยี่ยมชม';
    sheet.appendRow([
      new Date(),
      action,
      role,
      data.department || '',
      data.result || '',
      data.detail || '',
      data.consent ? 'ยินยอม' : ''
    ]);
  } catch (e) {
    // ตั้งใจไม่ throw ต่อ — การบันทึก log ต้องไม่ทำให้การทำงานหลักของผู้ใช้ล้มเหลว
  }
}

/* ============================== ADMIN API — ข้อมูลอัตรากำลัง ============================== */

function api_adminGetData(token) {
  verifyToken_(token);
  return api_getPublicData();
}

function api_adminSetSiteInfo(token, hospitalName, hospitalSubtitle) {
  verifyToken_(token);
  logActivity_('admin_set_site_info', { result: 'success' }); /* ทบทวนเพิ่ม: บันทึกกิจกรรมแก้ไขข้อมูลของแอดมิน/คณะกรรมการ */
  var props = PropertiesService.getScriptProperties();
  if (hospitalName) props.setProperty('HOSPITAL_NAME', hospitalName);
  if (hospitalSubtitle) props.setProperty('HOSPITAL_SUBTITLE', hospitalSubtitle);
  return api_getSiteInfo();
}

/* ============================== ADMIN API — รายชื่อบุคลากร (PDPA) ============================== */
/* ทุกฟังก์ชันในหมวดนี้ต้องผ่าน verifyToken_ เสมอ ห้ามเปิดให้ผู้เยี่ยมชมเรียกได้ */

function api_adminGetStaffForUnit(token, unitKey) {
  verifyToken_(token);
  unitKey = String(unitKey || '');
  var sheet = getStaffSheet_();
  var rows = readStaffRows_(sheet);
  return rows.filter(function (r) { return r.unitKey === unitKey; });
}

function api_adminAddStaff(token, unitKey, unitName, fullname, position, note) {
  verifyToken_(token);
  logActivity_('admin_add_staff', { result: 'success' }); /* ทบทวนเพิ่ม: บันทึกกิจกรรมแก้ไขข้อมูลของแอดมิน/คณะกรรมการ */
  if (!fullname) throw new Error('กรุณาระบุชื่อ-สกุล');
  var sheet = getStaffSheet_();
  var newRow = sheet.getLastRow() + 1;
  sheet.getRange(newRow, STAFF_COL.UNIT_ROW).setValue(String(unitKey || ''));
  sheet.getRange(newRow, STAFF_COL.UNIT_NAME).setValue(String(unitName || ''));
  sheet.getRange(newRow, STAFF_COL.FULLNAME).setValue(String(fullname));
  sheet.getRange(newRow, STAFF_COL.POSITION).setValue(String(position || ''));
  sheet.getRange(newRow, STAFF_COL.NOTE).setValue(String(note || ''));
  markDataUpdated_();
  return api_adminGetStaffForUnit(token, unitKey);
}

function api_adminUpdateStaff(token, sheetRow, fullname, position, note) {
  verifyToken_(token);
  logActivity_('admin_update_staff', { result: 'success' }); /* ทบทวนเพิ่ม: บันทึกกิจกรรมแก้ไขข้อมูลของแอดมิน/คณะกรรมการ */
  sheetRow = Number(sheetRow);
  var sheet = getStaffSheet_();
  if (fullname !== undefined && fullname !== null) sheet.getRange(sheetRow, STAFF_COL.FULLNAME).setValue(String(fullname));
  if (position !== undefined && position !== null) sheet.getRange(sheetRow, STAFF_COL.POSITION).setValue(String(position));
  if (note !== undefined && note !== null) sheet.getRange(sheetRow, STAFF_COL.NOTE).setValue(String(note));
  var unitKey = sheet.getRange(sheetRow, STAFF_COL.UNIT_ROW).getValue();
  markDataUpdated_();
  return api_adminGetStaffForUnit(token, unitKey);
}

function api_adminDeleteStaff(token, sheetRow) {
  verifyToken_(token);
  logActivity_('admin_delete_staff', { result: 'success' }); /* ทบทวนเพิ่ม: บันทึกกิจกรรมแก้ไขข้อมูลของแอดมิน/คณะกรรมการ */
  sheetRow = Number(sheetRow);
  var sheet = getStaffSheet_();
  var unitKey = sheet.getRange(sheetRow, STAFF_COL.UNIT_ROW).getValue();
  sheet.deleteRow(sheetRow);
  markDataUpdated_();
  return api_adminGetStaffForUnit(token, unitKey);
}

/**
 * ค้นชื่อ-สกุลรายบุคคลจากรหัส id ใน FTE_Detail — แอดมินเท่านั้น (ตาม PDPA)
 * ใช้เมื่อต้องการดูว่า "ตำแหน่งงาน" แถวใดใน FTE_Detail เป็นใคร
 *
 * ค้นหาจากแท็บ "allstaff" (ทะเบียนรายชื่อจริงต้นทาง ผูกกับ FTE_Detail ผ่านคอลัมน์
 * "ที่แยกประเภท" = id เดียวกัน) เป็นหลักก่อนเสมอ เพราะเป็นข้อมูลชุดที่สมบูรณ์ที่สุด
 * แล้วจึงค่อยลองแท็บ "StaffNames" เป็นทางเลือกสำรอง (เผื่อมีการเพิ่มชื่อเฉพาะทางไว้ที่นั่น
 * หรือ allstaff ไม่มีแถวของ id นั้น เช่น ตำแหน่งว่างที่เพิ่มเข้ามาใหม่ใน FTE_Detail)
 */
/** ทบทวนแก้ไข (ง่ายขึ้นมากหลังเปลี่ยนมาใช้ allstaff เป็นแหล่งเดียว): เดิมฟังก์ชันนี้ต้องจับคู่เนื้อหา/
 * ตำแหน่งบริหารข้ามชีทเพราะ FTE_Detail ไม่มีคอลัมน์ชื่อ ตอนนี้ id, ชื่อ-สกุล และตำแหน่งบริหารอยู่ใน
 * แถวเดียวกันของ allstaff อยู่แล้ว แค่หาแถวด้วย id แล้วอ่านชื่อออกมาตรงๆ ไม่ต้องจับคู่/เดาอะไรอีก */
function api_adminGetNameByDetailId(token, id) {
  verifyToken_(token);
  var rows = readDetailRows_({ includeNames: true });
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(id)) {
      var r = rows[i];
      return { title: r.title, first: r.first, last: r.last, positionNo: r.positionNo, matchConfidence: 'exact' };
    }
  }
  return null;
}

/**
 * สรุปจำนวนจริง/กรอบ สำหรับกราฟแดชบอร์ด "จำนวนจริงเทียบกับเกณฑ์" — แยกมุมมองได้ตามมิติที่เลือก
 * dimension: 'mission18' (กลุ่มภารกิจ) | 'group18' (กลุ่มงานตามจ.18) | 'position' (ตำแหน่งวิชาชีพ)
 * ข้อมูลดึงจาก FTE_Detail (นับเฉพาะบุคลากรที่ปฏิบัติงานจริง) ไม่มีชื่อบุคคล จึงเปิดให้ผู้เยี่ยมชมทั่วไปเรียกดูได้
 */
function api_getBreakdownByDimension(dimension) {
  var allowedDims = { mission18: 1, group18: 1, position: 1, profSupport: 1, affil18: 1 };
  if (!allowedDims[dimension]) dimension = 'group18';

  var rows = readDetailRows_().filter(function (r) { return r.active; });
  var groups = buildBreakdownGroups_(rows, dimension);

  return { dimension: dimension, groups: groups };
}

function buildBreakdownGroups_(rows, dimension) {
  var isGroupLevel = (dimension === 'group18' || dimension === 'mission18');
  var byGroup = {};
  rows.forEach(function (r) {
    var key = r[dimension] || '(ไม่ระบุ)';
    if (!byGroup[key]) byGroup[key] = { name: key, actual: 0, standard: 0, hasStandard: false, seenKeys: {}, byType: {} };
    var g = byGroup[key];
    var et = r.employType || '(ไม่ระบุ)';
    
    if (r.isOnSite) {
      g.actual++;
      g.byType[et] = (g.byType[et] || 0) + 1;
    }
    
    if (dimension === 'mission18') {
      addMissionFrameStandard_(g, r);
    } else if (dimension === 'group18') {
      addGroupStandard_(g, r);
    } else {
      addPositionStandard_(g, r); 
    }
  });

  return Object.keys(byGroup).map(function (k) {
    var g = byGroup[k];
    var standard = g.hasStandard ? g.standard : null;
    if (dimension === 'group18') {
      standard = resolveGroupStandard_(g).standard;
    }
    return {
      name: g.name,
      actual: g.actual,
      standard: standard,
      diff: standard === null ? null : (g.actual - standard),
      byType: g.byType
    };
  }).sort(function (a, b) { return b.actual - a.actual; });
}

/**
 * สรุปอัตรากำลังรายตำแหน่ง เฉพาะ "สายวิชาชีพที่สัมผัสผู้ป่วยโดยตรง" (แพทย์ ทันตแพทย์ เภสัชกร
 * พยาบาลวิชาชีพ นักวิชาการสาธารณสุข นักกายภาพบำบัด ฯลฯ)
 * ใช้แสดงกราฟเรดาร์แยกต่างหาก เพื่อเทียบขนาดกำลังคนเฉพาะกลุ่มวิชาชีพทางคลินิกโดยไม่ให้ตำแหน่ง
 * สายสนับสนุนหรือสายงานสำนักงาน (การเงิน/บัญชี/พัสดุ/ธุรการ) มาบดบังแกนของกราฟ
 *
 * หมายเหตุ: ใช้คอลัมน์ "หมวด(1-5)" (category) เป็นตัวกรองหลัก แทนคอลัมน์ "วิชาชีพ/สนับสนุน"
 * เพราะบางตำแหน่งอย่างเจ้าพนักงานการเงินและบัญชี/เจ้าพนักงานพัสดุ/เจ้าพนักงานธุรการ ถูกจัดอยู่ใน
 * "วิชาชีพ" เช่นกัน (เป็นสายงานเฉพาะทางแบบวิชาชีพ) แต่ไม่ได้สัมผัสผู้ป่วยโดยตรง — เดิม 1=สายวิชาชีพ
 * (สัมผัสผู้ป่วย) จึงตรงกับความต้องการมากกว่า ส่วน 3=สาย Back Office (แม้จะติดป้าย "วิชาชีพ")
 * จะถูกคัดออกจากกราฟนี้
 */
function api_getProfessionalPositionBreakdown() {
  var rows = readDetailRows_().filter(function (r) { return r.active && Number(r.category) === 1; });
  return { dimension: 'position', profSupport: 'วิชาชีพ', groups: buildBreakdownGroups_(rows, 'position') };
}

/**
 * สรุปอัตรากำลังรายตำแหน่ง เฉพาะ "สายสนับสนุน" เท่านั้น (พนักงานช่วยเหลือคนไข้ ผู้ช่วยเหลือ ฯลฯ)
 * ใช้แสดงกราฟเรดาร์แยกต่างหาก คู่กับกราฟสายวิชาชีพด้านบน
 */
function api_getSupportPositionBreakdown() {
  var rows = readDetailRows_().filter(function (r) { return r.active && r.profSupport === 'สนับสนุน'; });
  return { dimension: 'position', profSupport: 'สนับสนุน', groups: buildBreakdownGroups_(rows, 'position') };
}

/** ฟังก์ชันกลาง: นับจำนวนแยกตามค่าของคอลัมน์ field ในชุดแถวที่กำหนด แล้วเรียงจากมาก->น้อย
 *  ใช้ร่วมกันในการแจกแจง "ระดับ", "ด้านความเชี่ยวชาญ", "ประเภทการจ้าง" และ "กลุ่มงาน จ.18" ของแต่ละตำแหน่ง
 *  ค่าที่ว่างหรือเป็น "ไม่มี" (ตามที่กรอกในชีท) จะถูกจัดเข้ากลุ่ม emptyLabel ที่ระบุ เพื่อไม่ให้หายไปจากผลรวม */
function tallyByField_(rows, field, emptyLabel) {
  var map = {}, order = [];
  rows.forEach(function (r) {
    var v = r[field];
    var key = (v && v !== 'ไม่มี') ? v : (emptyLabel || '(ไม่ระบุ)');
    if (!map[key]) { map[key] = 0; order.push(key); }
    map[key]++;
  });
  return order.map(function (k) { return { name: k, count: map[k] }; })
    .sort(function (a, b) { return b.count - a.count; });
}

/** เหมือน tallyByField_ แต่แถม "ประเภทการจ้าง" ของแต่ละหมวดหมู่ย่อยมาด้วย (byEmployType) — ใช้ตอบคำถามที่
 *  พบบ่อยว่า "ทำไมกลุ่มงาน/ตำแหน่งนี้ถึงมีระดับ/ด้านความเชี่ยวชาญนี้ปรากฏ" เช่น กลุ่มงานพยาบาลที่ใช้ระดับ
 *  สายวิชาการ (ปฏิบัติการ/ชำนาญการ) เป็นหลัก อาจมีบุคลากรลูกจ้างประจำปนอยู่ซึ่งใช้ระดับคนละสาย (ส1-ส4)
 *  — ค่านี้ไม่ได้ผิดพลาด แต่เป็นเพราะ 1 กลุ่มงาน/ตำแหน่งมีบุคลากรหลายประเภทการจ้างปนกันจริงตามข้อมูลในชีท
 *  การแสดง byEmployType ในทูลทิปช่วยให้ผู้ใช้ตรวจสอบที่มาของแต่ละหมวดได้ทันทีโดยไม่ต้องเปิดชีทดูเอง */
function tallyByFieldWithEmployType_(rows, field, emptyLabel) {
  var map = {}, order = [];
  rows.forEach(function (r) {
    var v = r[field];
    var key = (v && v !== 'ไม่มี') ? v : (emptyLabel || '(ไม่ระบุ)');
    if (!map[key]) { map[key] = { count: 0, sub: {}, subOrder: [] }; order.push(key); }
    map[key].count++;
    var sv = r.employType || '(ไม่ระบุ)';
    if (!map[key].sub[sv]) { map[key].sub[sv] = 0; map[key].subOrder.push(sv); }
    map[key].sub[sv]++;
  });
  return order.map(function (k) {
    var e = map[k];
    return {
      name: k,
      count: e.count,
      byEmployType: e.subOrder.map(function (sv) { return { name: sv, count: e.sub[sv] }; })
        .sort(function (a, b) { return b.count - a.count; })
    };
  }).sort(function (a, b) { return b.count - a.count; });
}

/**
 * รายละเอียดเจาะลึกของ "ทุกตำแหน่งวิชาชีพที่สัมผัสผู้ป่วยโดยตรง" (คอลัมน์ "หมวด(1-5)" = 1 เช่นเดียวกับ
 * api_getProfessionalPositionBreakdown) แจกแจงเพิ่มเติมตามคอลัมน์ "ระดับ" และ "ด้านความเชี่ยวชาญ" ของ
 * FTE_Detail พร้อมประเภทการจ้างงาน และกลุ่มงาน จ.18 ที่สังกัด — ใช้สำหรับแผง "รายละเอียดตำแหน่งวิชาชีพ"
 * ในหน้าแดชบอร์ด เพื่อนำเสนอข้อมูลเจาะจงต่อวิชาชีพนั้น ๆ หรือแยกพิจารณาเป็นรายกลุ่มงานได้
 * คืนค่ากรอบอัตรากำลัง (standard) ของทั้งตำแหน่งไว้ด้วย (นับครั้งเดียวต่อคู่ "กลุ่มงาน x ตำแหน่ง" แบบ
 * เดียวกับฟังก์ชันอื่น ๆ ในระบบ) — หมายเหตุ: กรอบอัตรากำลังกำหนดไว้ระดับตำแหน่งเท่านั้น ไม่ได้แยกย่อย
 * ตามระดับ/ความเชี่ยวชาญรายบุคคล จึงแสดงกรอบรวมของทั้งตำแหน่งเพียงค่าเดียว ไม่มีชื่อบุคคล
 * ผู้เยี่ยมชมทั่วไปเรียกได้ (ข้อมูลระดับตัวเลขรวมเท่านั้น)
 */
function api_getPositionDetailBreakdown() {
  var rows = readDetailRows_().filter(function (r) { return r.active && Number(r.category) === 1; });

  var byPos = {}, order = [];
  rows.forEach(function (r) {
    var key = r.position || '(ไม่ระบุตำแหน่ง)';
    if (!byPos[key]) { byPos[key] = []; order.push(key); }
    byPos[key].push(r);
  });

  return order.map(function (pos) {
    var list = byPos[pos];
    var onList = list.filter(function (r) { return r.isOnSite; }); /* นับคนเฉพาะผู้ปฏิบัติงานจริง; กรอบคำนวณจาก list เต็ม */
    /* บัคเก็ตนี้เป็นระดับ "รายตำแหน่ง" ตัดข้ามหลายกลุ่มงานได้ → ใช้กรอบย่อยของตำแหน่งนั้นในแต่ละกลุ่มงาน
     * ที่สังกัด แล้วนับครั้งเดียวต่อคู่กลุ่มงาน+ตำแหน่ง (ไม่ใช่กรอบหลักทั้งกลุ่มงาน มิเช่นนั้นตำแหน่งเดียว
     * จะแสดงกรอบเท่ากับกรอบรวมทุกตำแหน่งของกลุ่มงานนั้น) */
    var bucket = { standard: 0, hasStandard: false, seenKeys: {} };
    list.forEach(function (r) { addPositionStandard_(bucket, r); });
    return {
      position: pos,
      actual: onList.length,
      vacantCount: list.filter(function (r) { return r.isVacant; }).length,
      standard: bucket.hasStandard ? bucket.standard : null,
      byLevel: tallyByFieldWithEmployType_(onList, 'level', 'ไม่มีระดับ'),
      byExpertise: tallyByFieldWithEmployType_(onList, 'expertise', 'ไม่มีความเชี่ยวชาญเฉพาะ'),
      byEmployType: tallyByField_(onList, 'employType', '(ไม่ระบุ)'),
      byGroup: tallyByField_(onList, 'group18', '(ไม่ระบุกลุ่มงาน)')
    };
  }).sort(function (a, b) { return b.actual - a.actual; });
}

/**
 * รายละเอียด "รายกลุ่มงาน (จ.18)" ทุกกลุ่มงาน แจกแจงตาม "ระดับ" และ "ด้านความเชี่ยวชาญ" ของบุคลากร
 * ในกลุ่มงานนั้น พร้อมสรุปแยกตามตำแหน่งด้วย — คู่กับ api_getPositionDetailBreakdown (ที่มองจากมุม
 * "ตำแหน่ง") ฟังก์ชันนี้มองจากมุม "กลุ่มงาน" แทน เพื่อตอบคำถาม 2 แบบ:
 *   1) กลุ่มงานหนึ่ง ๆ มีบุคลากรระดับใดบ้าง (ปฏิบัติการ/ชำนาญการ/ชำนาญการพิเศษ ฯลฯ) — ดูจาก byLevel
 *   2) ด้านความเชี่ยวชาญหนึ่ง ๆ (เช่น "ผู้ป่วยวิกฤต") กระจายอยู่ที่กลุ่มงานใดบ้าง จำนวนเท่าไร —
 *      หน้าเว็บนำ byExpertise ของทุกกลุ่มงานมาไขว้ (invert) กันเองฝั่ง client โดยไม่ต้องเรียก API เพิ่ม
 * ครอบคลุมบุคลากรทุกสาย (ทั้งวิชาชีพและสนับสนุน) ไม่จำกัดเฉพาะสายที่สัมผัสผู้ป่วย เพราะกลุ่มงานหนึ่ง ๆ
 * อาจมีทั้งสองสายปะปนกัน — ไม่มีชื่อบุคคล ผู้เยี่ยมชมทั่วไปเรียกได้
 */
function api_getGroupDetailBreakdown() {
  var rows = readDetailRows_().filter(function (r) { return r.active; });

  var byGroup = {}, order = [];
  rows.forEach(function (r) {
    var key = r.group18 || '(ไม่ระบุกลุ่มงาน)';
    if (!byGroup[key]) { byGroup[key] = []; order.push(key); }
    byGroup[key].push(r);
  });

  return order.map(function (grp) {
    var list = byGroup[grp];
    var onList = list.filter(function (r) { return r.isOnSite; });
    /* บัคเก็ตนี้เป็นระดับ "รายกลุ่มงาน" (ผลรวมทั้งกลุ่มงาน ไม่แยกย่อยเป็นรายตำแหน่งในค่า standard นี้ —
     * รายละเอียดรายตำแหน่งแยกไปอยู่ที่ byPosition ด้านล่างซึ่งเป็นการนับจำนวนคนเฉย ๆ ไม่มีกรอบ) → ใช้กรอบหลัก */
    var bucket = { standard: 0, hasStandard: false, seenKeys: {} };
    list.forEach(function (r) { addGroupStandard_(bucket, r); });
    return {
      group: grp,
      actual: onList.length,
      vacantCount: list.filter(function (r) { return r.isVacant; }).length,
      standard: bucket.hasStandard ? bucket.standard : null,
      byLevel: tallyByFieldWithEmployType_(onList, 'level', 'ไม่มีระดับ'),
      byExpertise: tallyByFieldWithEmployType_(onList, 'expertise', 'ไม่มีความเชี่ยวชาญเฉพาะ'),
      byPosition: tallyByField_(onList, 'position', '(ไม่ระบุตำแหน่ง)')
    };
  }).sort(function (a, b) { return b.actual - a.actual; });
}

/**
 * โครงสร้างต้นไม้ 3 ระดับ: วิชาชีพ/สนับสนุน -> กลุ่มงาน (ป.จริง ตามโครงสร้าง) -> ตำแหน่ง
 * สร้างมุมมองเดียวกับ PivotTable "สรุปภาพรวม_แดชบอร์ด" ในไฟล์ Excel ต้นฉบับ (คำนวณสดจาก FTE_Detail
 * แทนการพึ่งพา PivotTable ที่ต้องกดรีเฟรชเอง) แต่ละตำแหน่ง (ใบไม้) แถมข้อมูลแยกตามประเภทการจ้างงานด้วย
 * เพื่อใช้แทนตารางไขว้ที่สองของ PivotTable ต้นฉบับ — ไม่มีชื่อบุคคล เปิดให้ผู้เยี่ยมชมทั่วไปเรียกได้
 */
function api_getGroupStructTree() {
  var rows = readDetailRows_().filter(function (r) { return r.active; });

  var tree = {};
  var topOrder = [];

  rows.forEach(function (r) {
    var top = r.profSupport || '(ไม่ระบุ)';
    var grp = r.groupStruct || '(ไม่ระบุกลุ่มงาน)';
    var pos = r.position || '(ไม่ระบุตำแหน่ง)';
    var t = r.employType || '(ไม่ระบุ)';

    if (!tree[top]) { tree[top] = { order: [], groups: {} }; topOrder.push(top); }
    var topNode = tree[top];
    if (!topNode.groups[grp]) { topNode.order.push(grp); topNode.groups[grp] = { order: [], positions: {} }; }
    var grpNode = topNode.groups[grp];
    if (!grpNode.positions[pos]) { grpNode.order.push(pos); grpNode.positions[pos] = { actual: 0, standard: 0, hasStandard: false, seenKeys: {}, byType: {} }; }
    var posNode = grpNode.positions[pos];

    if (r.isOnSite) {
      posNode.actual++;
      posNode.byType[t] = (posNode.byType[t] || 0) + 1;
    }
    /* ใบไม้ของต้นไม้นี้คือ "ตำแหน่ง" ภายในกลุ่มงานหนึ่ง → ใช้กรอบย่อย */
    addPositionStandard_(posNode, r);
  });

  var result = topOrder.map(function (top) {
    var topNode = tree[top];
    var groups = topNode.order.map(function (grp) {
      var grpNode = topNode.groups[grp];
      var positions = grpNode.order.map(function (pos) {
        var p = grpNode.positions[pos];
        var standard = p.hasStandard ? p.standard : null;
        return {
          name: pos,
          actual: p.actual,
          standard: standard,
          diff: standard === null ? null : (p.actual - standard),
          byType: p.byType
        };
      }).sort(function (a, b) { return b.actual - a.actual; });

      var gActual = 0, gStandard = 0, gHasStandard = false;
      positions.forEach(function (p) {
        gActual += p.actual;
        if (p.standard !== null) { gStandard += p.standard; gHasStandard = true; }
      });
      return {
        name: grp,
        actual: gActual,
        standard: gHasStandard ? gStandard : null,
        diff: gHasStandard ? (gActual - gStandard) : null,
        positions: positions
      };
    }).sort(function (a, b) { return b.actual - a.actual; });

    var tActual = 0, tStandard = 0, tHasStandard = false;
    groups.forEach(function (g) {
      tActual += g.actual;
      if (g.standard !== null) { tStandard += g.standard; tHasStandard = true; }
    });
    return {
      name: top,
      actual: tActual,
      standard: tHasStandard ? tStandard : null,
      diff: tHasStandard ? (tActual - tStandard) : null,
      groups: groups
    };
  }).sort(function (a, b) { return b.actual - a.actual; });

  return { tree: result };
}

/**
 * สรุปสัดส่วนบุคลากรจำแนกตาม "ประเภทการจ้างงาน" (คอลัมน์ FTE_Detail)
 * ใช้แสดงกราฟเรดาร์ "ความมั่นคงประเภทการจ้างงาน" — เป็นข้อมูลระดับตัวเลขรวมเท่านั้น
 * (ผู้เยี่ยมชมทั่วไปเรียกได้ ไม่มีชื่อบุคคล)
 */
function api_getEmploymentTypeAnalytics() {
  /* หมายเหตุการแก้ไข: ตัดกลุ่ม "(ไม่ระบุ)" ออกจากกราฟเรดาร์ตามคำขอ — คำนวณสัดส่วน % ใหม่
   * จากฐานเฉพาะบุคลากรที่ระบุประเภทการจ้างแล้วเท่านั้น เพื่อไม่ให้ % รวมของกลุ่มที่เหลือคลาดเคลื่อน */
  var rows = readDetailRows_().filter(function (r) { return r.active && r.isOnSite; });

  var byType = {};
  var order = [];
  rows.forEach(function (r) {
    var key = r.employType || '(ไม่ระบุ)';
    if (!byType[key]) { byType[key] = 0; order.push(key); }
    byType[key]++;
  });

  var total = rows.length;
  var types = order.map(function (k) {
    return {
      name: k,
      actual: byType[k],
      percent: total > 0 ? Math.round((byType[k] / total) * 1000) / 10 : 0
    };
  }).sort(function (a, b) { return b.actual - a.actual; });

  return { total: total, types: types };
}

/**
 * สรุปสัดส่วนบุคลากรจำแนกตาม "ระดับ" (คอลัมน์ FTE_Detail) เช่น ปฏิบัติการ / ชำนาญการ / ชำนาญการพิเศษ ฯลฯ
 * ใช้แสดงกราฟเรดาร์ "ระดับอัตรากำลัง (ทุกตำแหน่ง)" ในหมวด "การกระจายและวิเคราะห์อัตรากำลัง" — เป็นข้อมูล
 * ระดับตัวเลขรวมเท่านั้น (ผู้เยี่ยมชมทั่วไปเรียกได้ ไม่มีชื่อบุคคล) เขียนตามรูปแบบเดียวกับ
 * api_getEmploymentTypeAnalytics() ทุกประการ ต่างกันแค่คอลัมน์ที่ใช้แจกแจง (level แทน employType)
 */
function api_getLevelAnalytics() {
  var rows = readDetailRows_().filter(function (r) { return r.active && r.isOnSite; });

  var byLevel = {};
  var order = [];
  rows.forEach(function (r) {
    var key = r.level || '(ไม่ระบุ)';
    if (!byLevel[key]) { byLevel[key] = 0; order.push(key); }
    byLevel[key]++;
  });

  var total = rows.length;
  var levels = order.map(function (k) {
    return {
      name: k,
      actual: byLevel[k],
      percent: total > 0 ? Math.round((byLevel[k] / total) * 1000) / 10 : 0
    };
  }).sort(function (a, b) { return b.actual - a.actual; });

  return { total: total, levels: levels };
}

/**
 * ตารางไขว้ "กลุ่มงาน (จ.18) x ตำแหน่ง" พร้อมจำนวนปฏิบัติงานจริง / กรอบอัตรากำลัง / ร้อยละครองอัตรา
 * ของแต่ละตำแหน่ง — ใช้กับกราฟ "ความมั่นคงประเภทการจ้างงาน รายตำแหน่ง" เวอร์ชันเลือกกลุ่มงาน
 * ดึงข้อมูล "ทุกกลุ่มงาน" มาในครั้งเดียว (แยกก้อนตำแหน่งของแต่ละกลุ่มงานไว้ไม่ปนกัน) เพื่อให้ฝั่ง
 * client สลับดูทีละกลุ่มงานได้ทันทีโดยไม่ต้องยิง request ใหม่ทุกครั้งที่เปลี่ยนตัวเลือก
 * (แบบเดียวกับแนวทางของ api_getPositionEmployAnalysis)
 */
/* (ลบสำเนาซ้ำของ api_getPositionByGroupAnalysis ออกแล้ว — เดิมประกาศไว้ 2 ครั้งเนื้อหาเหมือนกัน ฉบับหลังทับฉบับแรกอยู่เสมอ) */

/**
 * ตารางไขว้ "ตำแหน่งวิชาชีพ x ประเภทการจ้างงาน" ฉบับเต็ม — ใช้แสดงกราฟแท่งกรอบ/จริง
 * รายตำแหน่ง พร้อมร้อยละครองอัตรา (เหมือนกราฟแท่ง+เส้น รายกลุ่มภารกิจ) โดยแนบรายละเอียด
 * ส่วนประกอบประเภทการจ้างของแต่ละตำแหน่งไว้สำหรับใช้เป็นทูลทิป (ทำหน้าที่ตอบคำถาม
 * "แต่ละตำแหน่งมีจำนวนเท่าไหร่ และจ้างแบบใดบ้าง" ในหน้าเดียว)
 * limit = จำนวนตำแหน่งสูงสุดที่จะแสดง (เรียงตามจำนวนคนจริงมาก->น้อย)
 *         ถ้าไม่ระบุ หรือส่งค่า 0/null เข้ามา จะคืนค่าตำแหน่งทั้งหมด (ไม่จำกัด)
 *         เพื่อให้ฝั่ง client นำไปใช้เป็นรายการให้ผู้ใช้เลือกได้เองว่าต้องการดูตำแหน่งใดบ้าง
 */
function api_getPositionEmployAnalysis(limit) {
  var rows = readDetailRows_().filter(function (r) { return r.active; });
  var typeOrder = [];
  var typeSeen = {};
  var byPos = {};
  var posOrder = [];

  rows.forEach(function (r) {
    var t = r.employType || '(ไม่ระบุ)';
    if (!typeSeen[t]) { typeSeen[t] = true; typeOrder.push(t); }

    var p = r.position || '(ไม่ระบุตำแหน่ง)';
    if (!byPos[p]) {
      byPos[p] = { name: p, actual: 0, standard: 0, hasStandard: false, seenKeys: {}, byType: {}, vacantCount: 0 };
      posOrder.push(p);
    }
    var g = byPos[p];
    
    if (r.isOnSite) {
      g.actual++;
      g.byType[t] = (g.byType[t] || 0) + 1;
    }
    if (r.isVacant) g.vacantCount++;
    
    addPositionFrameStandard_(g, r); // ยึดการใช้ กรอบอัตรากำลังตามตำแหน่ง
  });

  var positions = posOrder.map(function (p) {
    var g = byPos[p];
    var standard = g.hasStandard ? g.standard : null;
    return {
      name: g.name, actual: g.actual, standard: standard,
      diff: standard === null ? null : (g.actual - standard),
      byType: g.byType, vacantCount: g.vacantCount
    };
  }).sort(function (a, b) { return b.actual - a.actual; });

  if (limit) { positions = positions.slice(0, limit); }
  return { types: typeOrder, positions: positions, totalPositions: posOrder.length };
}

// ทับ api_getPositionByGroupAnalysis
function api_getPositionByGroupAnalysis() {
  var rows = readDetailRows_().filter(function (r) { return r.active; });
  var typeOrder = [];
  var typeSeen = {};
  var byGroup = {};
  var groupOrder = [];
  
  rows.forEach(function (r) {
    var t = r.employType || '(ไม่ระบุ)';
    if (!typeSeen[t]) { typeSeen[t] = true; typeOrder.push(t); }

    var gKey = r.group18 || '(ไม่ระบุกลุ่มงาน)';
    if (!byGroup[gKey]) { byGroup[gKey] = { name: gKey, byPos: {}, posOrder: [] }; groupOrder.push(gKey); }
    var grp = byGroup[gKey];

    var p = r.position || '(ไม่ระบุตำแหน่ง)';
    if (!grp.byPos[p]) {
      grp.byPos[p] = { name: p, actual: 0, standard: 0, hasStandard: false, seenKeys: {}, byType: {}, vacantCount: 0 };
      grp.posOrder.push(p);
    }
    var g = grp.byPos[p];
    
    if (r.isOnSite) {
      g.actual++;
      g.byType[t] = (g.byType[t] || 0) + 1;
    }
    if (r.isVacant) g.vacantCount++;

    addPositionFrameStandard_(g, r);
  });

  var groups = groupOrder.map(function (gKey) {
    var grp = byGroup[gKey];
    var positions = grp.posOrder.map(function (p) {
      var g = grp.byPos[p];
      var standard = g.hasStandard ? g.standard : null;
      var percent = (standard !== null && standard > 0) ? Math.round((g.actual / standard) * 1000) / 10 : null;
      return {
        name: g.name, actual: g.actual, standard: standard,
        diff: standard === null ? null : (g.actual - standard),
        percent: percent, byType: g.byType, vacantCount: g.vacantCount
      };
    }).sort(function (a, b) { return b.actual - a.actual; });

    var totalActual = positions.reduce(function (s, p) { return s + p.actual; }, 0);
    var stdPositions = positions.filter(function (p) { return p.standard !== null; });
    var totalStandard = stdPositions.length ? stdPositions.reduce(function (s, p) { return s + p.standard; }, 0) : null;

    return {
      name: grp.name, totalActual: totalActual, totalStandard: totalStandard,
      positionCount: positions.length, positions: positions
    };
  }).sort(function (a, b) { return b.totalActual - a.totalActual; });

  return { types: typeOrder, groups: groups };
}

/**
 * สรุปภาพรวม "สายวิชาชีพ" เทียบ "สายสนับสนุน" (คอลัมน์ วิชาชีพ/สนับสนุน)
 * ใช้แสดงเป็นการ์ดสรุปด่วนบนแดชบอร์ด — คำนวณจากข้อมูลเดียวกับ api_getBreakdownByDimension('profSupport')
 */
function api_getProfSupportOverview() {
  return api_getBreakdownByDimension('profSupport');
}

/**
 * รายงานฉบับเต็มสำหรับผู้บริหาร/แอดมิน — รวมภาคผนวกรายชื่อบุคลากรทั้งหมด
 * ต้อง login แอดมินเท่านั้น ผู้เยี่ยมชมใช้ api_getPublicData + api_getAnalytics แทน (ไม่มีชื่อ)
 * ------------------------------------------------------------------
 * แก้บั๊ก (เพิ่งพบจากการใช้งานจริง): "ReferenceError: buildAllStaffContentIndex_ is not defined"
 * — เดิมฟังก์ชันนี้เรียก buildAllStaffContentIndex_()/resolveNameForDetailRow_() ซึ่งเป็นของเก่าจาก
 * สมัยที่ระบบยังใช้ 2 ชีทแยกกัน (FTE_Detail + allstaff) ต้อง "จับคู่เนื้อหา" ข้ามชีทเพื่อหาว่าแถวไหน
 * คือคนไหน — ทั้งสองฟังก์ชันถูกลบไปแล้วตอนย้ายมาใช้ชีทเดียว (allstaff) เพราะไม่จำเป็นอีกต่อไป (ดู
 * คำอธิบายที่หัวไฟล์ตรง readDetailRows_) แต่จุดเรียกใช้ตรงนี้ตกหล่นไม่ได้แก้ตาม ทำให้พังมาตลอดตั้งแต่
 * ตอนนั้น — แก้ให้ดึงชื่อ-สกุลตรงจากแถวเดียวกันเลยผ่าน readDetailRows_({includeNames:true}) แทน
 * ไม่ต้องจับคู่ข้ามชีทอีกต่อไป (ตรงไปตรงมากว่าเดิมมาก และไม่มีทางจับคู่ผิดคนได้อีกด้วย)
 */
function api_adminGetFullReport(token) {
  verifyToken_(token);
  var data = api_getPublicData();
  var analytics = api_getAnalytics();

  var detailRows = readDetailRows_({ includeNames: true }).filter(function (r) { return r.active; });

  var staffByUnit = {};
  detailRows.forEach(function (r) {
    var key = r.group18 || '(ไม่ระบุกลุ่มงาน)';
    if (!staffByUnit[key]) staffByUnit[key] = [];
    /* ทบทวนแก้ไข: เดิมตำแหน่งที่ยังไม่มีคนครอง (เช่น "นิติกร") จะถูกข้ามไปทั้งแถวเพราะหาชื่อในทะเบียน
     * ไม่เจอ ทำให้รายงาน/PDF มองไม่เห็นว่ามีตำแหน่งนี้อยู่เลย ทั้งที่เป็นตำแหน่งที่มีอยู่จริงในกรอบ
     * อัตรากำลัง เปลี่ยนเป็นแสดงแถวไว้เสมอ โดยเว้นชื่อ-สกุลว่างไว้ตามควร (ไม่ใส่ข้อมูลเดา/ผิดคน)
     * และดึง "หมายเหตุ" จริงจากคอลัมน์เดียวกัน (เช่น "ไม่มีคนครอง") มาแสดงกำกับไว้แทนที่จะปล่อยว่าง */
    staffByUnit[key].push({
      fullname: r.fullName || '(ตำแหน่งว่าง)',
      position: r.position,
      note: r.note || (r.fullName ? '' : 'ไม่มีคนครอง')
    });
  });

  /* รวมรายชื่อที่แอดมินเคยพิมพ์เพิ่มเองด้วยมือไว้ใน StaffData เข้าไปด้วย */
  var staffSheet = getStaffSheet_();
  var manualRows = readStaffRows_(staffSheet);
  manualRows.forEach(function (r) {
    var key = r.unitKey || '(ไม่ระบุกลุ่มงาน)';
    if (!staffByUnit[key]) staffByUnit[key] = [];
    staffByUnit[key].push({ fullname: r.fullname, position: r.position, note: r.note });
  });

  var staffCount = 0;
  data.groups.forEach(function (g) {
    g.staff = staffByUnit[g.name] || [];
    staffCount += g.staff.length;
  });

  return { data: data, analytics: analytics, staffCount: staffCount };
}

/**
 * สร้างดัชนี id -> ชื่อ-สกุล จากแท็บ "allstaff" (ทะเบียนรายชื่อจริงต้นทาง) ครั้งเดียว
 * เพื่อให้ค้นหาแบบ O(1) แทนการวนลูปค้นทีละ id (ใช้ร่วมกับ findNameInAllStaff_ ซึ่งยังคงไว้
 * สำหรับกรณีค้นทีละรายการจากปุ่ม "ดูชื่อ")
 */
function buildAllStaffNameIndex_(ss) {
  var idx = {};
  var sheet = findSheetLoose_(ss, ALLSTAFF_SHEET_NAME);
  if (!sheet) return idx;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return idx;
  var numCols = Math.max(ALLSTAFF_COL.ID, ALLSTAFF_COL.TITLE, ALLSTAFF_COL.FIRST, ALLSTAFF_COL.LAST, ALLSTAFF_COL.POSITION_NO);
  var values = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
  for (var i = 0; i < values.length; i++) {
    var rowId = values[i][ALLSTAFF_COL.ID - 1];
    if (rowId === '' || rowId === null) continue;
    idx[String(rowId)] = {
      title: values[i][ALLSTAFF_COL.TITLE - 1],
      first: values[i][ALLSTAFF_COL.FIRST - 1],
      last: values[i][ALLSTAFF_COL.LAST - 1]
    };
  }
  return idx;
}

/**
 * สร้างดัชนี id -> ชื่อ-สกุล จากแท็บ "StaffNames" (ทางเลือกสำรอง) ครั้งเดียว เช่นเดียวกับ
 * buildAllStaffNameIndex_ — ใช้เติมชื่อให้กรณีที่ allstaff ไม่มีแถวของ id นั้น
 */
function buildStaffNamesIndex_(ss) {
  var idx = {};
  var sheet = findSheetLoose_(ss, STAFFNAMES_SHEET_NAME);
  if (!sheet) return idx;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return idx;
  var values = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  for (var i = 0; i < values.length; i++) {
    var id = values[i][0];
    if (id === '' || id === null) continue;
    idx[String(id)] = { title: values[i][1], first: values[i][2], last: values[i][3] };
  }
  return idx;
}
/* ============================== แบบฟอร์มยื่นคำร้องขอย้าย/ช่วยราชการ ============================== */

/** ทบทวนแก้ไข: เดิมตรงนี้ต้องจับคู่ FTE_Detail กับ allstaff ผ่าน id เพื่ออ่านหมายเหตุ/สถานะ (ดูประวัติ
 * ปัญหา id ไม่ใช่คีย์ร่วมที่เชื่อถือได้ ในคอมเมนต์เดิม) ตอนนี้ readDetailRows_() คำนวณ isVacant/isAway
 * ไว้บนแถวให้แล้วโดยตรงจากคอลัมน์สถานะ/หมายเหตุของ allstaff แถวเดียวกัน ไม่ต้องจับคู่ผ่าน id อีกต่อไป
 * เก็บชื่อฟังก์ชันเดิมไว้เป็น thin wrapper เพื่อไม่ต้องแก้จุดเรียกใช้ทั่วทั้งไฟล์ */
function isVacantRow_(r) { return !!r.isVacant; }
function isAwayRow_(r) { return !!r.isAway; }


/* ============================== ตรวจสอบความสอดคล้อง / คุณภาพข้อมูล (เพิ่มใหม่) ==============================
 * 3 ฟังก์ชันนี้คำนวณจากชีท allstaff ผ่าน readDetailRows_() เหมือนทุกหน้า จึงเห็นภาพเดียวกับที่หน้าเว็บใช้จริง
 *  - api_getReconciliation()            สาธารณะ: ตัวเลขล้วน (ไม่มีชื่อ) แจกแจงทะเบียนอัตราตามรหัสสถานะ 0-5
 *  - api_adminGetConsistencyChecks()    แอดมิน : เรียก API แต่ละมุมมอง แล้วเทียบยอดรวมกับค่ากลาง
 *  - api_adminGetDataQuality()          แอดมิน : รายการแถวในชีทที่ข้อมูลขัดแย้งกันเอง (ระบุเลขแถวใน Sheet)
 * ============================================================================================== */

function api_getReconciliation() {
  var all = readDetailRows_();
  var rows = all.filter(function (r) { return r.active; });
  var codes = [0, 1, 2, 3, 4, 5];
  var byCode = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  var statusBlank = 0;
  var groupMap = {}, order = [];

  rows.forEach(function (r) {
    byCode[r.statusCode] = (byCode[r.statusCode] || 0) + 1;
    if (r.statusBlank) statusBlank++;
    var key = r.group18 || '(ไม่ระบุกลุ่มงาน)';
    if (!groupMap[key]) {
      groupMap[key] = { name: key, positions: 0, onSite: 0, vacant: 0, studyLeave: 0, tempIn: 0, tempOut: 0, internalSwap: 0 };
      order.push(key);
    }
    var g = groupMap[key];
    g.positions++;
    if (r.isOnSite) g.onSite++;
    if (r.statusCode === 0) g.vacant++;
    else if (r.statusCode === 2) g.studyLeave++;
    else if (r.statusCode === 3) g.tempIn++;
    else if (r.statusCode === 4) g.tempOut++;
    else if (r.statusCode === 5) g.internalSwap++;
  });

  var onSite = rows.filter(function (r) { return r.isOnSite; }).length;
  var groups = order.map(function (k) { return groupMap[k]; })
    .sort(function (a, b) { return b.positions - a.positions; });

  return {
    generatedAt: new Date().toISOString(),
    dataUpdatedAt: getDataUpdatedAt_(),
    onsiteCodes: ONSITE_STATUS_CODES,
    totals: {
      sheetRows: all.length,
      abolished: all.length - rows.length,
      positions: rows.length,
      onSite: onSite,
      /* บุคลากรเจ้าของอัตราสังกัดโรงพยาบาล = สถานะ 1+2+4+5 (ไม่รวม 0 ว่าง และ 3 มาช่วย ซึ่งสังกัดที่อื่น) */
      affiliated: byCode[1] + byCode[2] + byCode[4] + byCode[5],
      vacant: byCode[0], studyLeave: byCode[2], tempIn: byCode[3], tempOut: byCode[4], internalSwap: byCode[5],
      statusBlank: statusBlank
    },
    statusCounts: codes.map(function (c) {
      return { code: c, label: STATUS_CODE_LABEL[c], count: byCode[c], counted: ONSITE_STATUS_CODES.indexOf(c) !== -1 };
    }),
    groups: groups
  };
}

function sumField_(list, field) {
  return (list || []).reduce(function (s, x) { return s + (Number(x[field]) || 0); }, 0);
}

/** เทียบยอด \"จำนวนคน\" ของทุกมุมมองบนเว็บกับค่ากลาง — ok=true แปลว่าตรงกัน */
function api_adminGetConsistencyChecks(token) {
  verifyToken_(token);
  var rows = readDetailRows_().filter(function (r) { return r.active; });
  var expectedAll = rows.filter(function (r) { return r.isOnSite; }).length;
  var expectedProf = rows.filter(function (r) { return r.isOnSite && Number(r.category) === 1; }).length;
  var expectedSupport = rows.filter(function (r) { return r.isOnSite && r.profSupport === 'สนับสนุน'; }).length;
  var checks = [];

  function add(label, where, expected, fn) {
    var total = null, err = '';
    try { total = fn(); } catch (e) { err = String(e && e.message ? e.message : e); }
    checks.push({ label: label, where: where, expected: expected, total: total,
      ok: (err === '' && total === expected), error: err });
  }

  add('การ์ด \"จำนวนจริงรวม\" หน้าภาพรวม', 'ภาพรวม', expectedAll, function () { return api_getPublicData().summary.totalActual; });
  add('กราฟรายกลุ่มงาน (แดชบอร์ด)', 'แดชบอร์ด', expectedAll, function () { return sumField_(api_getAnalytics().chartByGroup, 'actual'); });
  add('รายงานอัตรากำลัง (รวมรายวัน)', 'รายงาน', expectedAll, function () { return api_getReportAnalytics(false).summary.totalActual; });
  add('มุมมองข้อมูล (ไม่กรอง)', 'มุมมองข้อมูล', expectedAll, function () { return api_getFilteredBreakdown({}).totalActual; });
  add('แยกตามกลุ่มงาน จ.18', 'แดชบอร์ด', expectedAll, function () { return sumField_(api_getBreakdownByDimension('group18').groups, 'actual'); });
  add('แยกตามภารกิจ จ.18', 'แดชบอร์ด', expectedAll, function () { return sumField_(api_getBreakdownByDimension('mission18').groups, 'actual'); });
  add('แยกตามตำแหน่ง', 'แดชบอร์ด', expectedAll, function () { return sumField_(api_getBreakdownByDimension('position').groups, 'actual'); });
  add('แยกวิชาชีพ/สนับสนุน', 'แดชบอร์ด', expectedAll, function () { return sumField_(api_getBreakdownByDimension('profSupport').groups, 'actual'); });
  add('แยกตามสังกัด', 'แดชบอร์ด', expectedAll, function () { return sumField_(api_getBreakdownByDimension('affil18').groups, 'actual'); });
  add('กลุ่มภารกิจ > กลุ่มงาน', 'แดชบอร์ด', expectedAll, function () { return sumField_(api_getMissionGroupAnalytics().missions, 'totalActual'); });
  add('ประเภทการจ้าง', 'แดชบอร์ด', expectedAll, function () { return api_getEmploymentTypeAnalytics().total; });
  add('ระดับตำแหน่ง', 'แดชบอร์ด', expectedAll, function () { return api_getLevelAnalytics().total; });
  add('รายละเอียดรายกลุ่มงาน', 'แดชบอร์ด', expectedAll, function () { return sumField_(api_getGroupDetailBreakdown(), 'actual'); });
  add('โครงสร้างกลุ่มงาน > ตำแหน่ง', 'แดชบอร์ด', expectedAll, function () { return sumField_(api_getGroupStructTree().tree, 'actual'); });
  add('ตำแหน่ง x กลุ่มงาน', 'แดชบอร์ด', expectedAll, function () { return sumField_(api_getPositionByGroupAnalysis().groups, 'totalActual'); });
  add('ตำแหน่ง x ประเภทการจ้าง', 'แดชบอร์ด', expectedAll, function () { return sumField_(api_getPositionEmployAnalysis(0).positions, 'actual'); });
  add('สายวิชาชีพที่สัมผัสผู้ป่วย (ส่วนย่อย)', 'แดชบอร์ด', expectedProf, function () { return sumField_(api_getProfessionalPositionBreakdown().groups, 'actual'); });
  add('รายละเอียดรายตำแหน่ง สายวิชาชีพ (ส่วนย่อย)', 'แดชบอร์ด', expectedProf, function () { return sumField_(api_getPositionDetailBreakdown(), 'actual'); });
  add('สายสนับสนุน (ส่วนย่อย)', 'แดชบอร์ด', expectedSupport, function () { return sumField_(api_getSupportPositionBreakdown().groups, 'actual'); });

  var failed = checks.filter(function (c) { return !c.ok; }).length;
  return { generatedAt: new Date().toISOString(), expectedAll: expectedAll, checks: checks, failed: failed, passed: checks.length - failed };
}

function hasRealName_(r) {
  var f = String(r.first || '').trim();
  return f !== '' && !/^\d+$/.test(f);
}

/** รายการข้อมูลในชีท allstaff ที่ขัดแย้งกันเอง และมีผลทำให้ตัวเลขจำนวนคนคลาดเคลื่อน (ระบุเลขแถวจริงใน Google Sheet)
 *  ไม่ส่งชื่อ-สกุลออกไป ส่งเฉพาะเลขแถว/ที่แยกประเภท/ตำแหน่ง/กลุ่มงาน เพื่อให้แก้ที่ต้นทางได้โดยไม่เพิ่มความเสี่ยง PDPA */
function api_adminGetDataQuality(token) {
  verifyToken_(token);
  var all = readDetailRows_({ includeNames: true });
  var rows = all.filter(function (r) { return r.active; });
  var items = [];
  function push(r, type, severity, detail) {
    items.push({ xlRow: r.xlRow, id: r.id, group: r.group18Raw || r.group18, position: r.position,
      status: r.statusBlank ? '(ว่าง)' : r.status, type: type, severity: severity, detail: detail });
  }

  var idCount = {}, posNoCount = {}, nameCount = {};
  rows.forEach(function (r) {
    var idk = String(r.id); idCount[idk] = (idCount[idk] || 0) + 1;
    if (r.positionNo) posNoCount[r.positionNo] = (posNoCount[r.positionNo] || 0) + 1;
    if (r.isOnSite && hasRealName_(r)) {
      var nk = String(r.first).trim() + '|' + String(r.last).trim();
      nameCount[nk] = (nameCount[nk] || 0) + 1;
    }
  });

  rows.forEach(function (r) {
    var named = hasRealName_(r);
    if (r.statusBlank) push(r, 'สถานะว่างเปล่า', 'สูง', 'ไม่ได้ระบุรหัส 0-5 ระบบนับเป็น \"1 ทำงานปกติ\" ชั่วคราว — โปรดกรอกให้ชัดเจน');
    if ((r.statusCode === 1 || r.statusCode === 3) && !named) push(r, 'สถานะนับเป็นคน แต่ไม่มีชื่อผู้ครอง', 'สูง', 'สถานะ ' + r.statusCode + ' ถูกนับเป็นผู้ปฏิบัติงาน แต่ช่องชื่อว่าง — ถ้าไม่มีคนครองให้แก้สถานะเป็น 0');
    if (r.statusCode === 0 && named) {
      push(r, 'สถานะ 0 (ว่าง) แต่มีชื่อผู้ครอง', /ไม่มีคนครอง/.test(r.note) ? 'ต่ำ' : 'สูง',
        /ไม่มีคนครอง/.test(r.note) ? 'หมายเหตุระบุไม่มีคนครอง แต่ยังมีชื่อค้างอยู่ — ควรลบชื่อเก่าออก' : 'ไม่มีหมายเหตุอธิบาย อาจกรอกสถานะผิด (ถ้ามีคนปฏิบัติงานจริงต้องเป็น 1)');
    }
    if (String(r.last || '').trim().match(/^\d+$/)) push(r, 'ช่องนามสกุลเป็นตัวเลข (placeholder)', 'ต่ำ', 'ค่า \"' + String(r.last).trim() + '\" ในช่องนามสกุล');
    if (idCount[String(r.id)] > 1) push(r, 'ที่แยกประเภท (ID) ซ้ำ', 'กลาง', 'ID เดียวกันปรากฏ ' + idCount[String(r.id)] + ' แถว (มักเป็นอัตราเดิม+อัตราใหม่ของคนเดียวกัน)');
    if (r.positionNo && posNoCount[r.positionNo] > 1) push(r, 'เลขที่ตำแหน่งซ้ำ', 'กลาง', 'เลขตำแหน่ง ' + r.positionNo + ' ปรากฏ ' + posNoCount[r.positionNo] + ' แถว');
    if (r.isOnSite && named) {
      var nk = String(r.first).trim() + '|' + String(r.last).trim();
      if (nameCount[nk] > 1) push(r, 'บุคคลเดียวกันถูกนับเป็นคนมากกว่า 1 แถว', 'สูง', 'ชื่อเดียวกันมี ' + nameCount[nk] + ' แถวที่นับเป็นผู้ปฏิบัติงาน (นับซ้ำ)');
    }
    if (r.isForeignAffil && (r.statusCode === 1 || r.statusCode === 2 || r.statusCode === 4 || r.statusCode === 5)) push(r, 'สังกัดไม่ใช่สันทราย แต่สถานะไม่ใช่ \"มาช่วย\"', 'สูง', 'สังกัด: ' + r.affil18 + ' (ถ้ามาช่วยปฏิบัติงานควรเป็นสถานะ 3)');
    if (!r.isForeignAffil && r.statusCode === 3) push(r, 'สถานะ \"มาช่วย\" แต่สังกัดสันทราย', 'กลาง', 'สถานะ 3 ควรเป็นบุคลากรสังกัดหน่วยงานอื่น');
    if (r.group18Raw && r.group18 === GROUP_REVIEW_LABEL) push(r, 'ช่องกลุ่มงานเป็นชื่อหน่วยงานภายนอก', 'กลาง', 'ค่า \"' + r.group18Raw + '\" ไม่ใช่กลุ่มงาน — ระบบรวมไว้ในกลุ่ม ' + GROUP_REVIEW_LABEL);
    if (r.group18Raw && GROUP_LABEL_ALIAS[String(r.group18Raw).trim()]) push(r, 'ชื่อกลุ่มงานสะกดผิด', 'ต่ำ', '\"' + r.group18Raw + '\" -> \"' + GROUP_LABEL_ALIAS[String(r.group18Raw).trim()] + '\"');
    if (/ลาศึกษา|นร\.?ทุน|ได้รับทุน/.test(r.note) && r.statusCode !== 2) push(r, 'หมายเหตุพูดถึงลาศึกษา/ทุน แต่สถานะไม่ใช่ 2', 'กลาง', 'หมายเหตุ: ' + r.note);
    if (/ลาออก/.test(r.note) && r.statusCode !== 0) push(r, 'หมายเหตุระบุลาออก แต่สถานะไม่ใช่ 0', 'กลาง', 'หมายเหตุ: ' + r.note);
    if (/^\d+$/.test(String(r.note).trim())) push(r, 'หมายเหตุเป็นตัวเลขล้วน', 'ต่ำ', 'ค่า \"' + r.note + '\" น่าจะพิมพ์ผิดช่อง');
    if (r.adminPos && !r.adminPosIsTitle) push(r, 'ช่องตำแหน่งบริหารมีข้อความหมายเหตุ', 'ต่ำ', r.adminPos);
  });

  /* กลุ่มงานที่ \"กรอบหลัก\" มีหลายค่าในกลุ่มเดียว (ระบบใช้ค่าสูงสุด) */
  var frameVotes = {};
  rows.forEach(function (r) {
    if (r.mainframe === null) return;
    var k = r.group18 || '(ไม่ระบุ)';
    if (!frameVotes[k]) frameVotes[k] = {};
    frameVotes[k][String(r.mainframe)] = 1;
  });
  var mixedFrameGroups = Object.keys(frameVotes).filter(function (k) { return Object.keys(frameVotes[k]).length > 1; });

  var typeCounts = {};
  items.forEach(function (it) { typeCounts[it.type] = (typeCounts[it.type] || 0) + 1; });
  var sevRank = { 'สูง': 0, 'กลาง': 1, 'ต่ำ': 2 };
  items.sort(function (a, b) { return (sevRank[a.severity] - sevRank[b.severity]) || (a.xlRow - b.xlRow); });

  /* ตรวจหัวตารางชีท allstaff ว่ายังเรียงคอลัมน์ตามที่โค้ดคาดไว้หรือไม่ (กันกรณีมีคนแทรก/สลับคอลัมน์ในชีทแล้วตัวเลขเพี้ยนเงียบๆ) */
  var schemaWarnings = [];
  try {
    var hdr = getAllStaffSheet_().getRange(1, 1, 1, ALLSTAFF_NUM_COLS).getValues()[0].map(function (h) { return String(h || ''); });
    [[ALLSTAFF_COL.POSITION, 'ตำแหน่ง'], [ALLSTAFF_COL.PROF_SUPPORT, 'วิชาชีพ/สนับสนุน'], [ALLSTAFF_COL.CATEGORY, '1=สายวิชาชีพ'],
     [ALLSTAFF_COL.GROUP18, 'กลุ่มงาน จ.18'], [ALLSTAFF_COL.AFFIL18, 'สังกัด'], [ALLSTAFF_COL.MAINFRAME, 'กรอบหลัก'],
     [ALLSTAFF_COL.STATUS, 'สถานะ'], [ALLSTAFF_COL.NOTE, 'หมายเหตุ']].forEach(function (p) {
      if (hdr[p[0] - 1].indexOf(p[1]) === -1) schemaWarnings.push('คอลัมน์ที่ ' + p[0] + ' ควรมีหัวตารางที่มีคำว่า \"' + p[1] + '\" แต่พบ \"' + hdr[p[0] - 1].replace(/\s+/g, ' ').substring(0, 40) + '\"');
    });
  } catch (e) { schemaWarnings.push('อ่านหัวตารางไม่สำเร็จ: ' + e.message); }

  return {
    generatedAt: new Date().toISOString(),
    schemaWarnings: schemaWarnings,
    totalItems: items.length,
    typeCounts: typeCounts,
    mixedFrameGroupCount: mixedFrameGroups.length,
    mixedFrameGroups: mixedFrameGroups,
    items: items.slice(0, 800)
  };
}

var TRANSFER_SHEET_NAME = 'TransferRequests';
var TRANSFER_HEADERS = [
  'เวลาที่ยื่น', 'รหัสคำร้อง', 'ประเภทคำร้อง',
  'คำนำหน้า', 'ชื่อ', 'นามสกุล', 'เบอร์โทร', 'เลขบัตรประชาชน',
  'กลุ่มงานเดิม', 'หน่วยงานเดิม', 'กลุ่มงานปลายทาง', 'หน่วยงานปลายทาง',
  'เหตุผล', 'สถานะ'
];

/**
 * เปิดหรือสร้างชีท TransferRequests (สร้างใหม่พร้อมหัวตารางถ้ายังไม่มี เนื่องจากเป็นฟีเจอร์ใหม่
 * ที่สเปรดชีตเดิมของผู้ใช้อาจยังไม่มีแท็บนี้)
 */
function getTransferSheet_() {
  var ss = getSpreadsheet_();
  var sheet = findSheetLoose_(ss, TRANSFER_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(TRANSFER_SHEET_NAME);
    sheet.getRange(1, 1, 1, TRANSFER_HEADERS.length).setValues([TRANSFER_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * รับคำร้องขอย้าย/ช่วยราชการจากบุคลากร (ไม่ต้อง login) บันทึกลงชีท TransferRequests
 */
function api_submitTransferRequest(payload) {
  payload = payload || {};
  /* เพิ่มตามคำขอผู้ใช้ (ข้อ 5): ประเภท "ขอลาออก" (13) ไม่มีปลายทาง จึงไม่บังคับ destGroup ฝั่งเซิร์ฟเวอร์
   * ด้วย (เดิมบังคับทุกประเภทเหมือนกันหมด) — ค่าคงที่ '13' ตรงกับ tfThemes['13'] ฝั่ง Index.html */
  var required = ['transferType', 'prefix', 'firstName', 'lastName', 'cid', 'currentGroup', 'reason'];
  if (String(payload.transferType) !== '13') required.push('destGroup');
  for (var i = 0; i < required.length; i++) {
    var v = payload[required[i]];
    if (!v || !String(v).trim()) {
      throw new Error('กรุณากรอกข้อมูลให้ครบถ้วน');
    }
  }
  var cid = String(payload.cid).trim();
  if (!/^\d{13}$/.test(cid)) {
    throw new Error('เลขประจำตัวประชาชนต้องเป็นตัวเลข 13 หลัก');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getTransferSheet_();
    var requestId = 'REQ-' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd-HHmmss') +
      '-' + Math.floor(100 + Math.random() * 900);
    sheet.appendRow([
      new Date(),
      requestId,
      payload.transferType,
      payload.prefix,
      payload.firstName,
      payload.lastName,
      payload.phone || '',
      cid,
      payload.currentGroup,
      payload.currentUnit || '',
      payload.destGroup || '',
      payload.destUnit || '',
      payload.reason,
      'รอดำเนินการ'
    ]);
    return { ok: true, requestId: requestId };
  } finally {
    lock.releaseLock();
  }
}

/**
 * รายการคำร้องทั้งหมด (สำหรับผู้ดูแลระบบเท่านั้น) เรียงจากยื่นล่าสุดก่อน
 */
function api_adminGetTransferRequests(token) {
  verifyToken_(token);
  var sheet = getTransferSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, TRANSFER_HEADERS.length).getValues();
  var rows = values.map(function (r, idx) {
    return {
      sheetRow: idx + 2,
      timestamp: (r[0] instanceof Date) ? r[0].toISOString() : String(r[0]),
      requestId: r[1],
      transferType: r[2],
      prefix: r[3],
      firstName: r[4],
      lastName: r[5],
      phone: r[6],
      cid: r[7],
      currentGroup: r[8],
      currentUnit: r[9],
      destGroup: r[10],
      destUnit: r[11],
      reason: r[12],
      status: r[13] || 'รอดำเนินการ'
    };
  });
  return rows.reverse();
}

/**
 * ปรับสถานะคำร้อง (รอดำเนินการ / อนุมัติ / ไม่อนุมัติ) — ผู้ดูแลระบบเท่านั้น
 */
function api_adminUpdateTransferStatus(token, sheetRow, status) {
  verifyToken_(token);
  logActivity_('admin_update_transfer_status', { result: 'success' }); /* ทบทวนเพิ่ม: บันทึกกิจกรรมแก้ไขข้อมูลของแอดมิน/คณะกรรมการ */
  var row = Number(sheetRow);
  if (!row || row < 2) throw new Error('ตำแหน่งแถวไม่ถูกต้อง');
  var allowed = ['รอดำเนินการ', 'อนุมัติ', 'ไม่อนุมัติ'];
  if (allowed.indexOf(status) === -1) throw new Error('สถานะไม่ถูกต้อง');
  var sheet = getTransferSheet_();
  sheet.getRange(row, TRANSFER_HEADERS.length).setValue(status);
  return api_adminGetTransferRequests(token);
}