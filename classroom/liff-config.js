// ════════════════════════════════════════════════════════════
// LIFF config — ใส่ค่าจริงหลังสร้าง LIFF app ใน LINE Developers Console
// วิธีหา liffId:
//   1. เปิด https://developers.line.biz/console/ → เข้า Channel แบบ "Messaging API" ที่สร้างไว้
//      (ตัวเดียวกับที่ใช้ทำ notify-line ก็ได้ ไม่ต้องสร้าง Channel ใหม่)
//   2. แท็บ "LIFF" → Add → ตั้งชื่อ เช่น "ผูกบัญชี LINE นักเรียน"
//      Size: Full · Endpoint URL: https://mrtaihualin.com/classroom/line-link.html
//      Scope: ติ๊ก "profile" กับ "openid" (ต้องมี openid ถึงจะได้ idToken)
//   3. คัดลอก LIFF ID (รูปแบบ 1234567890-abcdefgh) มาใส่แทนค่าด้านล่าง
// ════════════════════════════════════════════════════════════
window.LIFF_CONFIG = {
  liffId: 'YOUR_LIFF_ID_HERE'   // ← เปลี่ยนเป็นค่าจริงก่อนใช้งาน ไม่งั้นหน้า line-link.html จะใช้ไม่ได้
};
