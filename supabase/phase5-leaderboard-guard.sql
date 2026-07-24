-- ════════════════════════════════════════════════════════════
-- Phase 5 — เพดานคะแนนกระดานผู้นำ (leaderboard score guard)
-- ปัญหา: client insert คะแนนดิบเข้า reading_sessions / tone_sessions ตรงๆ โดยเซิร์ฟเวอร์ไม่ตรวจ
--        → เปิด DevTools ยัด score มหาศาลขึ้นอันดับ 1 ปลอมได้ (ออดิต 3 ทีม 2026-07-23, FIX 4)
-- วิธี: CHECK constraint กันค่าโอเวอร์/ติดลบ (ลูกระนาด ไม่ใช่กำแพงสมบูรณ์)
--   ⚠️ เป็นแค่กันค่าโอเวอร์ๆ — คนโกงยังใส่ค่าใต้เพดานได้ · กระดานผู้นำยังไม่มีของรางวัล
--      ถ้าอนาคตผูกรางวัลกับอันดับ ต้องเปลี่ยนไปให้เซิร์ฟเวอร์คิดคะแนนเอง (เหมือน tone-round)
-- เพดานตั้งจากคะแนนจริงสูงสุด × หลายเท่า (คนเล่นจริงไม่มีทางชน):
--   reading_sessions: จริงสูงสุด 333 (เฉลี่ย 193) → เพดาน 5,000  (~15 เท่า)
--   tone_sessions:    จริงสูงสุด 44,250 (เฉลี่ย 3,200) → เพดาน 500,000 (~11 เท่า)
-- รันใน Supabase SQL Editor · idempotent (ลบของเก่าก่อนใส่ใหม่ รันซ้ำได้ปลอดภัย)
-- ════════════════════════════════════════════════════════════

alter table public.reading_sessions drop constraint if exists reading_sessions_score_sane;
alter table public.reading_sessions add constraint reading_sessions_score_sane
  check (score >= 0 and score <= 5000);

alter table public.tone_sessions drop constraint if exists tone_sessions_score_sane;
alter table public.tone_sessions add constraint tone_sessions_score_sane
  check (score >= 0 and score <= 500000);
