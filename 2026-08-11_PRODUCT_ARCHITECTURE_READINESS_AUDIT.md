# Product Architecture Readiness Audit — 2026-08-11

**อ่านคู่กับ:** `2026-08-11_สรุป_Product_Architecture_14หมวด_ล่าสุด.md` (Source of Truth ของรอบนี้)
**ขอบเขต:** ตรวจ source / schema / shared modules ปัจจุบัน ว่ารองรับ Architecture ที่ LOCK แล้วแค่ไหน
**รอบนี้ไม่ทำ:** ไม่ออกแบบ Product ใหม่ · ไม่แก้โค้ด · ไม่ refactor · ไม่เดาสูตร/ตัวเลข/ราคา

**Work Collision Safety (ตรวจก่อนเริ่ม):**
- `git status` = สะอาด ไม่มี modified / staged / untracked
- `git stash list` = ว่าง
- worktree อื่น 2 อัน (`~/.codex/worktrees/ce0f`, `e742`) = สะอาดทั้งคู่ ไม่มีงานค้าง
- **รายงานนี้เป็นไฟล์ใหม่ไฟล์เดียว ไม่แตะไฟล์เดิมสักไฟล์**

---

# A. Executive Summary

## A.1 ข่าวดี — ฐานหลักวางไปแล้ว 1 วันก่อนหน้า

`supabase/sql/2026-08-11_learning_foundation.sql` (รันขึ้น staging + production แล้ว ตาม commit `76e93a3`)
สร้าง **23 ตาราง** ที่ตรงกับ Architecture ที่เพิ่ง LOCK มาก **โดยที่ยังไม่ได้อ่านเอกสาร 14 หมวดฉบับนี้**

ของที่มีอยู่แล้วและตรงกับ LOCK:

| LOCK ในเอกสาร | ของจริงในระบบ | สถานะ |
|---|---|---|
| หมวด 1 — Learning Content Model (ตัวตนนิ่ง) | `learning_items` + `learning_item_key_history` | ✅ มีแล้ว |
| หมวด 4 — Item × Practice Type × Skill | `practice_events` (มี 3 ช่องนี้ครบ) | ✅ โครงมีแล้ว (ตารางว่าง) |
| หมวด 6 — Ability State 5 สถานะ | `learning_memory_states` (未練習/練習中/需要加強/穩定/掌握) | ✅ ตรงเป๊ะ |
| หมวด 6 — Learning Memory ชุดเดียว | `learning_memory` (user × item × skill) | ✅ โครงมีแล้ว (ตารางว่าง) |
| หมวด 10/11 — ห้ามใช้ `paid=true` | `billing_plans` / `plan_prices` / `entitlement_keys` / `plan_entitlements` / `user_plan_grants` | ✅ โครงมีแล้ว |
| หมวด 12 — Word Vault ≠ Learning Memory | `learning_saved_items` แยกตาราง | ✅ ตรงเจตนา |
| หมวด 8 — Challenge evidence แยกน้ำหนัก | `practice_events.evidence_source` / `evidence_weight` / `evidence_confidence` | ✅ เตรียมช่องไว้แล้ว |
| หมวด 8 — ห้ามสรุปผิดเพราะคำใหม่ | `practice_events.intent` (`new_content`/`review`/`weakness`/`skill_development`) | ✅ ตรงเจตนา |
| หมวด 3 — ไม่ hard-code ตามชื่อเกม | `practice_surfaces` + `practice_types` แยกชั้น + `legacy_codes` | ✅ ตรงเจตนา |
| หมวด 9.10 — Search entitlement-aware | `search-index.js` มีช่อง `access: 'free'\|'premium'` แล้ว | 🟡 มีช่อง ยังไม่บังคับ |

**สรุป:** โครงกลางพร้อมรับ implementation รอบถัดไปจริง ไม่ต้องรื้อ

## A.2 จุดเสี่ยงหลัก 5 ข้อ (มีหลักฐานจาก source ทุกข้อ)

| # | เรื่อง | ความรุนแรง |
|---|---|---|
| R1 | **เกมฟังไม่ต่อกับระบบบัญชีเลย** — `listening-game.html` ไม่โหลด `supabase-config.js` / `reading-auth.js` / `tone-server.js` เลยแม้แต่ไฟล์เดียว → ไม่มี evidence ฝั่งเซิร์ฟเวอร์แม้แต่แถวเดียว | 🔴 สูง |
| R2 | **ตารางประวัติการเล่นมี 2 ชุดคู่ขนาน** — `tone_sessions` (เกมเสียงเกมเดียว) กับ `reading_sessions` (อีก 5 เกม) | 🔴 สูง |
| R3 | **หน้า Progress เห็นแค่เกมเดียว** — `js/score/progress.js:126` อ่านจาก `tone_sessions` อย่างเดียว → คะแนนเกมอ่าน/พิมพ์/ลำดับคำ/เลโก้/Challenge ไม่ขึ้นในหน้า「我的進度」 | 🔴 สูง |
| R4 | **คลังคำมี 2 ระบบ** — `word-vault.js` (30 คำ · sync ขึ้น `learning_saved_items` แล้ว) กับ `lego-vault.js` (15 คำ · localStorage ล้วน ไม่ sync) | 🟠 กลาง |
| R5 | **ชื่อเกมไม่ตรงกันระหว่างระบบ** — เกมลำดับคำ = `word_order` ตอนเซฟคะแนน แต่ = `wordorder` ตอนเขียน SRS | 🟠 กลาง (จดไว้แล้วใน `legacy_codes`) |

## A.3 Blocker ที่ทำให้ยังเดินต่อไม่ได้ (ต้องรอ Lin ตัดสิน)

1. **`learning_skills` ว่าง** → `learning_memory` เขียนไม่ได้เลย (`skill_code` เป็น FK บังคับ) → Mastery / Weakness / Progress ใหม่ ทำไม่ได้จนกว่ามีรายชื่อ Skill
2. **`learning_tags` ว่าง** → Search classification (หมวด 9.6) ทำไม่ได้ · วันนี้มี 26 หมวดปนอยู่ในช่อง `category` ช่องเดียว
3. **`entitlement_keys` ว่าง** → Free/Paid boundary ยังบังคับจริงไม่ได้ · เพดานจริงยังฝังในโค้ด `game-content/index.ts`
4. **`learning_item_surfaces` ว่าง** → ยังไม่รู้ว่า item ไหนใช้กับเกมไหนได้ → Planner / Personalized Challenge เลือกเนื้อหาไม่ได้

## A.4 ของที่ควร reuse (ห้ามสร้างใหม่)

- **Search engine** — `js/core/search-engine.js` มีชุดเดียวจริงแล้ว ✅ ตรง LOCK 9.1
- **ระบบตัดสินผลฝั่งเซิร์ฟเวอร์** — `supabase/functions/tone-round/` (server-authoritative + optimistic lock กัน race) เป็นแม่แบบที่ดีสำหรับ `practice_events`
- **ระบบ sync ข้ามเครื่อง** — `word-vault.js` ทำ remote-authoritative + ตราลบ (tombstone) ครบแล้ว ใช้เป็นแม่แบบให้ vault อื่น
- **Export / Delete** — `account-export` + `account-delete` มีครบ ตรง LOCK 12.7 / 14.8 / 14.9
- **ด่านเนื้อหา** — `game-content` Edge Function ตัดสิน tier จาก JWT จริง ไม่เชื่อ client ✅
- **ตัวตรวจอัตโนมัติ** — `scripts/audit-learning-content.js` + `check-site.js` ตรง LOCK หมวด 13

---

# B. Current Architecture Map

```
┌─ ผู้ใช้ ─────────────────────────────────────────────────────────┐
│                                                                  │
│  index.html ──► search-ui.js ─┐                                  │
│  games.html ──► games-search-ui.js ─┼─► search-engine.js         │
│  games-practice.html ─────────┘     │   (1 engine ✅)            │
│                                     ├─► data/search-index.js     │
│                                     └─► Edge: search-gemini      │
│                                         (เลือกได้เฉพาะ id ในดัชนี)│
│                                                                  │
│  ── เกม 7 ตัว ──────────────────────────────────────────────     │
│  tone-finder ─┬─► reading-auth.js (auth กลาง)                    │
│  reading      │   └─► saveScore() ──► reading_sessions           │
│  typing       ├─► tone-server.js ──► Edge: tone-round            │
│  word-order   │      └─► tone_srs_state / star_ledger /          │
│  challenge    │          game_accounts                           │
│  lego ────────┘   (lego ไม่ใช้ tone-server)                      │
│                                                                  │
│  tone-finder เท่านั้น ──► tone-companion.js                      │
│      (ดักจับ gtag) ──► tone_sessions   ⚠️ คนละตาราง              │
│                                                                  │
│  listening ──► ❌ ไม่ต่อกับอะไรเลย (localStorage + GA4 เท่านั้น)  │
│                                                                  │
│  เกมทุกตัว ──► game-content-client.js ──► Edge: game-content     │
│                    └─► game_words / game_sentences (ล็อกสนิท)    │
│                                                                  │
│  ── คลังคำ ──────────────────────────────────────────────────    │
│  word-vault.js (30) ──► learning_saved_items  ✅ sync แล้ว        │
│  lego-vault.js (15) ──► localStorage ล้วน     ❌ ไม่ sync         │
│                                                                  │
│  ── ดูผล ────────────────────────────────────────────────────    │
│  my-progress.html ──► progress.js ──► tone_sessions เท่านั้น ⚠️   │
│  *-board.html ──► RPC leaderboard                                │
│  vault.html ──► word-vault.js                                    │
│                                                                  │
│  ── โครงใหม่ (สร้างแล้ว ยังไม่มีใครเขียน) ────────────────────    │
│  learning_items(✅มีข้อมูล) · practice_events(ว่าง) ·             │
│  learning_memory(ว่าง) · billing_plans(มี 'free' 1 แถว)          │
└──────────────────────────────────────────────────────────────────┘
```

---

# C. Learning Evidence Audit

**นิยามคอลัมน์:** *Current data* = ของที่บันทึกจริงวันนี้ · *Shared/Unique* = ใช้ทางร่วมหรือทางของตัวเอง

| System | Current data (ที่บันทึกจริง) | Shared / Unique | Gap | Risk | Safe next step |
|---|---|---|---|---|---|
| **เกมเสียง** (tone-finder) | `tone_sessions`(mode, score, total, wrong_words) · `tone_srs_state`(game='tone', level, word, stage, due_date, ever_failed, mastered) · `star_ledger` · `tone_progress`(badges/streak/สถิติผิด) | **Unique** — เกมเดียวที่เขียน `tone_sessions` และเขียนผ่านการ **ดักจับ gtag** ใน `tone-companion.js` | ไม่มี item_id · ไม่มี skill · ไม่มี practice_type · ไม่มี session_id · ไม่มี intent | 🔴 ทางเขียนผูกกับ GA4 — ถ้าชื่อ event เปลี่ยน ประวัติหายเงียบ | เขียน `practice_events` เพิ่ม **ขนานไปกับของเดิม** ไม่ย้าย ไม่แตะของเดิม |
| **เกมอ่าน** (reading) | `reading_sessions`(score, games, game='reading', wrong_items) · `tone_srs_state`(game='reading') | **Shared** — ผ่าน `READING_AUTH.saveScore()` + `TONE_SERVER.finishRound()` | เหมือนข้างบน + `wrong_items` เป็น jsonb ไม่มีโครงบังคับ | 🟠 client `insert` ตรงเข้า `reading_sessions` (โกงคะแนนได้ — เป็นบทเรียนเดิมที่จดไว้แล้วใน SQL) | เหมือนกัน |
| **เกมพิมพ์** (typing) | `reading_sessions`(game='typing') · `tone_srs_state`(game='typing') | **Shared** | เหมือนเกมอ่าน | 🟠 เหมือนเกมอ่าน | เหมือนกัน |
| **เกมลำดับคำ** (word-order) | `reading_sessions`(game=**`word_order`**) · `tone_srs_state`(game=**`wordorder`**) | **Shared** แต่ **ชื่อไม่ตรงกัน 2 ที่** | ชื่อเกมมี 2 แบบในระบบเดียว | 🟠 จับคู่ข้อมูลข้ามตารางพลาดได้ | ใช้ `practice_surfaces.legacy_codes` จับคู่ **ห้ามแก้ชื่อในตารางเดิม** (ประวัตินักเรียนจะขาด) |
| **เกมฟัง** (listening) | ❌ **ไม่มีอะไรเลยฝั่งเซิร์ฟเวอร์** · มีแค่ `state.log` ในหน่วยความจำ + `gsh_resume_*` ใน localStorage + GA4 | **โดดเดี่ยว** — `listening-game.html` ไม่โหลด `supabase-config.js`/`reading-auth.js`/`tone-server.js` เลย | ทุกอย่าง: ไม่มีคะแนน ไม่มี SRS ไม่มีดาว ไม่มีประวัติ ไม่มีล็อกอิน | 🔴 **สูงสุด** — Listening เป็น 1 ใน 4 Skill หลัก (หมวด 6) แต่ระบบไม่มีหลักฐานเลยแม้แต่แถวเดียว | ต่อเข้า auth กลางก่อน แล้วค่อยเขียน evidence — **ต้องมี Decision ก่อน** ว่าคะแนนเกมฟังเข้าตารางไหน |
| **เกมเลโก้** (lego) | `reading_sessions`(game='lego', wrong_items) · `lego_daily_limits`(นับโควตาต่อวันฝั่งเซิร์ฟเวอร์) · `lego_vault_v1`(localStorage) · `LEGO_CH_KEY`(challenge รายสัปดาห์ localStorage) | **ครึ่งๆ** — ใช้ `saveScore` ร่วม แต่ไม่ใช้ `tone-server` (ไม่มี SRS/ดาว) และใช้คลังคำของตัวเอง | ไม่มี SRS · ไม่มีตัวตน item · คลังคำแยก · challenge รายสัปดาห์เก็บในเครื่องล้วน | 🟠 ผลการฝึกสร้างประโยคหายเมื่อล้างเบราว์เซอร์ | ให้ `lego-vault` ใช้ `learning_saved_items` (`vault_key='lego_vault'` เตรียมไว้แล้ว) |
| **Challenge** (games-challenge) | `reading_sessions`(game='challenge') · `tone_srs_state`(game='challenge') · ไม่มีปุ่ม 💡 ตั้งแต่แรก | **Shared** | ไม่มี unlock gate · ไม่มี timer · ไม่มี Challenge history แยก · ไม่มีการเทียบกับ game evidence | 🟡 中級/高級 ยังปิด (`games.html` การ์ด `gh-disabled`) | รอ Decision — เกือบทุกอย่างของหมวด 8 ยังไม่ล็อก |
| **Progress** | `progress.js` อ่าน `tone_sessions` อย่างเดียว | **Unique** | ไม่เห็น 5 เกมที่เหลือ · ไม่มี Skill layer · ไม่มี Next Action | 🔴 นักเรียนเล่นเกมอ่าน 50 รอบ หน้า Progress ยังว่าง | 🔴 **BLOCKED** (Lin ตัดสิน 2026-08-11) — ห้าม normalize 2 ตารางเอง รอ shared progress/evidence model |
| **History** | ไม่มีหน้า History แยก — มีแต่ตารางใน `my-progress.html` | — | ไม่มี Progress ≠ History ตามหมวด 9.2 | 🟡 | รอ Decision |
| **Word Vault** | `learning_saved_items`(user, word_th, zh, en, source_raw, vault_key, tags, saved_at, deleted_at) sync ข้ามเครื่องจริง | **Shared** ✅ | ไม่มี `item_id` (ปล่อย null) · ไม่มี `source_surface` (ปล่อย null โดยตั้งใจ) · ไม่ตอบว่า "อะไรควร review" | 🟢 ต่ำ — ทำงานถูกต้องอยู่ | เติม `item_id` ย้อนหลังได้ (จับคู่ `word_th` กับ `learning_items.content_key`) |
| **Learning Memory** | `tone_srs_state` = Learning Memory เวอร์ชันแรกที่มีจริง · `learning_memory` ตารางใหม่ยัง **ว่าง** | **แยกกัน 2 ชุด** | `tone_srs_state` คีย์ = (user, **game**, level, **word ตัวหนังสือ**) → ผูกชื่อเกม + ผูกตัวหนังสือ (ขัดหมวด 1 + 6) | 🟠 แก้ typo คำหนึ่ง = SRS ของคำนั้นขาด | **ห้ามย้ายจนกว่ามี Skill taxonomy + สูตร Mastery** (จดไว้แล้วในหัวไฟล์ SQL) |

## C.1 สรุปว่าอะไร "เหมือน / ต่าง / ขาด / ซ้ำ"

**เหมือนกัน (ใช้ทางร่วมแล้ว):**
- 5 เกม (อ่าน/พิมพ์/ลำดับคำ/เลโก้/Challenge) ใช้ `READING_AUTH.saveScore()` ทางเดียวกัน
- 5 เกม (เสียง/อ่าน/พิมพ์/ลำดับคำ/Challenge) ใช้ `TONE_SERVER.finishRound()` ทางเดียวกัน
- 6 เกม ใช้ `game-content-client.js` โหลดเนื้อหาทางเดียวกัน
- 6 เกม ใช้ `word-vault.js` + `word-menu.js` ปุ่มเซฟคำทางเดียวกัน

**ต่างกัน:**
- เกมเสียงเขียน `tone_sessions` · อีก 5 เกมเขียน `reading_sessions`
- เกมเสียงเขียนผ่าน "ดักจับ gtag" · เกมอื่นเรียกฟังก์ชันตรงๆ
- เกมเลโก้ใช้คลังคำคนละตัว
- เกมฟังไม่ต่อกับอะไรเลย

**ขาด (ทุกเกมเหมือนกันหมด):**
| ข้อมูลที่ Architecture ต้องใช้ | มีวันนี้ไหม |
|---|---|
| content/item id | ❌ ใช้ตัวหนังสือไทยเป็นคีย์ (`learning_items` มีแล้วแต่ยังไม่มีใครใช้) |
| practice type | ❌ (มีแค่ `listening-game` state.mode ในหน่วยความจำ) |
| skill | ❌ ไม่มีเลยทั้งระบบ |
| attempts (ต่อ item) | 🟡 มีเฉพาะ `tone_srs_state.stage` |
| hint / help ที่ใช้ | 🟡 แปลงเป็น `clean`/`starClean` แล้วส่งเป็น boolean เท่านั้น รายละเอียดหาย |
| timestamp | ✅ มีทุกตาราง |
| session | 🟡 1 แถว = 1 รอบเล่น แต่ไม่มี `session_id` ผูกข้ามตาราง |
| difficulty | 🟡 มี `level` (1/2/3 หรือ 初/中) ไม่มี Observed Difficulty |
| user / anonymous | 🟡 ล็อกอินเท่านั้นที่เก็บ · anon ไม่เก็บอะไรเลย (`anon_game_events` มีตารางแต่ไม่มีใครเขียน) |
| review state | 🟡 `tone_srs_state.due_date` (เฉพาะ 5 เกมที่ใช้ tone-server) |
| mastery | 🟡 `mastered` เป็น boolean 2 ค่า — Architecture ต้องการ 5 สถานะ |
| intent (ทำไมถึงฝึกข้อนี้) | ❌ |
| source ของ content | 🟡 `learning_items.content_source` มีแล้ว แต่ evidence ไม่ผูกกับมัน |

**ซ้ำ:** ดูหัวข้อ G

---

# D. Search Audit

## D.1 มี Search engine กี่ชุด

**1 ชุด** — `js/core/search-engine.js` ✅ **ตรงกับ LOCK 9.1 แล้ว ห้ามสร้างเพิ่ม**

## D.2 Search surface ไหนใช้อะไร

| Surface | ไฟล์ UI | เรียกฟังก์ชัน | scope |
|---|---|---|---|
| Global Search (หน้าแรก) | `js/core/search-ui.js` | `SearchEngine.searchSite()` | ทั้งเว็บ |
| Game Search | `js/games/games-search-ui.js` | `SearchEngine.searchGamesOnly()` | `category='practice'` |
| games-practice.html | โหลด `games-search-ui.js` ตัวเดียวกัน | เหมือนกัน | เหมือนกัน |
| Article search | ❌ ไม่มี | — | — |
| Personal search | ❌ ไม่มี | — | — |

→ **scope/context ถูกส่งเข้า search แล้วจริง** (ผ่านการเลือกฟังก์ชัน) ✅ ตรง LOCK 9.1

## D.3 Logic ซ้ำกันตรงไหน

`search-ui.js` (117 บรรทัด) กับ `games-search-ui.js` (85 บรรทัด) **ไม่ได้ซ้ำ engine** แต่ซ้ำ *ขั้นตอนรอบนอก* เกือบทั้งหมด:
- อ่านค่าจากช่อง → เช็ค `window.SearchEngine` พร้อมไหม → ยิง gtag → วาดผล → ถ้าไม่เจอ เรียก `geminiFallback()` → ยิง gtag อีกตัว → วาดการ์ด "เดา"

โครงเหมือนกันบรรทัดต่อบรรทัด ต่างแค่ชื่อ event GA4 กับข้อความ
→ **เป็น duplicate ระดับ presentation ไม่ใช่ระดับ engine** — ยังไม่ผิด LOCK แต่เพิ่ม surface ที่ 3 เมื่อไหร่จะกลายเป็นก๊อป 3 ชุด

## D.4 Logging

| ที่ LOCK ไว้ (9.7) | มีวันนี้ |
|---|---|
| query (คำที่พิมพ์) | ❌ **ไม่เก็บเลย** |
| เวลา | 🟡 GA4 เก็บให้เอง |
| surface | ✅ แยกจากชื่อ event (`site_search` / `game_search`) |
| interpretation | 🟡 มีแค่ `confident: true/false` |
| primary result | ❌ |
| alternatives | ❌ |
| action ที่ผู้ใช้กด | ❌ |
| query ต่อ (journey) | ❌ **ไม่มีแนวคิด journey เลย** |
| found / no-result / clarification | 🟡 แยกได้แค่ `site_search` vs `site_search_gemini_match` — **ไม่มี event ตอน "ไม่เจอจริงๆ"** |
| session/account context | ❌ |

**สรุป Logging:** มีแค่ GA4 4 event (`site_search`, `site_search_gemini_match`, `game_search`, `game_search_gemini_match`) และ **ไม่เก็บคำค้นเลยแม้แต่คำเดียว**
→ LOCK 9.7 (「ทุก Search ต้องถูกบันทึก」) และ 15.6 (Search No-result ใช้หา Content Gap) **ยังทำไม่ได้เลยวันนี้**

## D.5 รูปแบบผลลัพธ์

`searchSite()` คืน `{ recommended: [3 อันดับแรก], byCategory: {...}, confident }`
→ เป็น **Primary + Alternatives ครึ่งทาง** (มี top-3 แยกออกมา + จัดกลุ่มตามหมวด)
→ ❌ **ไม่มี Continuation Path** (ไม่มี "แล้วต่อไปทำอะไร")
→ ❌ **ไม่มีช่องพิมพ์ต่อ / conversational refinement** (LOCK 9.5)

## D.6 ค้นนอกเว็บไหม

❌ **ไม่ค้นนอกเว็บ** ✅ ตรง LOCK 9.2
`search-gemini` ถูกบังคับให้เลือกได้เฉพาะ `id` ที่มีอยู่ใน `SEARCH_INDEX` (enum) ห้ามสร้าง URL เอง

## D.7 Entitlement-aware ไหม

`data/search-index.js` มีช่อง `access: 'free' | 'premium'` **อยู่แล้วทุกรายการ** (ตอนนี้เป็น `'free'` ทั้ง 67 รายการ)
→ ✅ schema พร้อม · ❌ **ยังไม่มีโค้ดไหนอ่านค่านี้ไปกรองผล**

## D.8 ดัชนีครอบคลุมแค่ไหน

67 รายการ (นับจริงด้วย `node`) · 4 หมวด: `practice` 7 · `content` 46 · `site` 12 · `course` 2 · **`access` เป็น `'free'` ทั้ง 67 รายการ**
เทียบกับ LOCK 9.2 ที่ต้องครอบคลุม: คำศัพท์/dictionary · ท่องเที่ยว · สถานที่ · โรงแรม · หนัง · งานแปล → **ยังไม่มีในดัชนีเลย**

---

# E. Entitlement Audit

## E.1 Guest = ลองได้

| ที่ LOCK (12.1) | ของจริง |
|---|---|
| Global Search | ✅ ใช้ได้ ไม่ต้องล็อกอิน |
| อ่าน content ฟรี | ✅ |
| เล่นเกมฟรี | ✅ ทุกเกม |
| active session ในเครื่อง | ✅ `GameResume` (localStorage `gsh_resume_<gameId>`) + `linvault_v1` |
| ไม่มี personalization จริง | ✅ ถูกต้อง |

**ผลตรวจ: Guest ครบตาม LOCK แล้ว** 🟢

## E.2 Free Login = ระบบจำฉันได้

| ที่ LOCK (12.2) | ของจริง | สถานะ |
|---|---|---|
| Word Vault จริง | `learning_saved_items` | ✅ |
| Sync ข้ามเครื่อง | `word-vault.js` sync + ตราลบข้ามเครื่อง | ✅ |
| Learning Memory พื้นฐาน | `tone_srs_state` (5 เกม) — ❌ เกมฟังไม่มี · เกมเลโก้ไม่มี | 🟡 ครึ่งเดียว |
| ประวัติพื้นฐาน | `tone_sessions` + `reading_sessions` | 🟡 แยก 2 ตาราง |
| Search history / Personal Search | ❌ **ไม่มีเลย** | ❌ |
| Progress พื้นฐาน | `my-progress.html` — เห็นแค่เกมเสียง | 🟡 |
| Export ข้อมูลตัวเอง | Edge Function `account-export` ครอบ 12 แหล่ง | ✅ |
| Challenge = Random | ✅ ไม่มี personalization อยู่แล้ว (แต่ Challenge ยังปิด 中/高) | ✅ |

**ผลตรวจ: Free Login มีจริงประมาณ 60%** — ช่องโหว่ใหญ่คือ Search history และ Progress ที่เห็นไม่ครบ

## E.3 Paid = ระบบเข้าใจฉัน

**ยังไม่มีอะไรเลยฝั่ง runtime** — ค้นทั้ง `js/` ไม่เจอคำว่า `premium` / `subscription` / `plan_code` / `entitlement` ในโค้ดฝั่งเว็บแม้แต่จุดเดียว
(คำว่า `tier` ที่เจอในเกมคือ tier ของ **เหรียญตรา** และ **combo multiplier** คนละเรื่องกัน)

ที่มีคือ **โครงตารางเปล่า** 5 ตาราง (`billing_plans` มีแค่แถว `'free'`) → ✅ พร้อมรับ ไม่ต้องรื้อ

## E.4 กลไกจำกัดสิทธิ์ที่มีอยู่จริงวันนี้

| กลไก | อยู่ที่ไหน | ตัดสินจากอะไร | เป็น entitlement จริงไหม |
|---|---|---|---|
| เพดานเนื้อหาเกม | `game-content/index.ts` ค่า `CAPS` (hard-code) | JWT จริงฝั่งเซิร์ฟเวอร์ (anon/login) ✅ | ❌ ยังไม่ผูกตาราง entitlement |
| โควตาเลโก้รายวัน | `lego-daily-limits` + Edge Function | user_id หรือ IP | ❌ |
| เพดานคลังคำ 30 / 15 | ค่าคงที่ในไฟล์ JS ฝั่ง client | — | ❌ (ฐานข้อมูล **ตั้งใจ** ไม่บังคับเพดาน) |
| Leaderboard ตัดแอดมิน | `reading-auth.js:509` | `window.isSiteAdmin` | — |

⚠️ **จุดที่ต้องระวังตอนย้าย:** เพดานเนื้อหาอยู่ที่เดียวคือ `CAPS` — ห้ามย้ายครึ่งทาง ไม่งั้นจะมีเพดาน 2 ที่แล้วไม่ตรงกัน (จดเตือนไว้แล้วในหัวไฟล์ SQL)

## E.5 Privacy / Data Ownership (หมวด 12)

| LOCK | ของจริง |
|---|---|
| 14.8 Export เป็นสิทธิ์พื้นฐาน | ✅ `account-export` (ไม่ล็อกหลัง paid) |
| 14.9 ลบต้อง sync ข้ามเครื่อง | ✅ `word-vault` มีตราลบ (`deleted_at`) จริง |
| 14.5 ลบจาก Vault ≠ ลืมว่าเคยเรียน | ✅ แยกตารางอยู่แล้วโดยตั้งใจ |
| 14.2 Clear History ≠ Reset Progress | ❌ **ยังไม่มีปุ่มไหนทำได้ทั้งคู่** |
| 14.3 Stop Saving | ❌ ไม่มี |
| 14.7 เก็บสถิติไม่ระบุตัวบุคคล | 🟡 `anon_game_events` มีตาราง + มี policy ให้ insert **แต่ไม่มีโค้ดไหนเขียนเลย** |

---

# F. Dependency Map

```
Search ──────► Games
  · data/search-index.js  → href ตรงไปหน้าเกม (static link)
  · ⚠️ ส่งต่อ: ไม่มีอะไรเลย — search ไม่บอกเกมว่าผู้ใช้ค้นหาอะไรมา
                (LOCK 9.9 Search+Planner ยังทำไม่ได้)

Games ───────► Learning Memory
  · js/games/tone-server.js → Edge tone-round → tone_srs_state
  · ส่งต่อ: word(ตัวหนังสือ), level(1-3), game(ชื่อเกม), clean(bool), starClean(bool)
  · ⚠️ ไม่ส่ง: item_id · skill · practice_type · intent · session_id
  · ❌ เกมฟัง + เกมเลโก้ ไม่อยู่ในเส้นนี้เลย

Games ───────► Word Vault
  · js/games/word-menu.js → js/games/word-vault.js → learning_saved_items
  · ส่งต่อ: word_th, zh, en, source_raw(ชื่อเกมแบบขีดกลาง เช่น 'tone-finder')
  · ⚠️ source_surface (รหัสมาตรฐาน 'tone_finder') ปล่อย null โดยตั้งใจ — 2 ชุดชื่อไม่ตรงกัน
  · ❌ เกมเลโก้ใช้ lego-vault.js คนละเส้น (localStorage ล้วน)

Word Vault ──► Lego
  · ❌ **ขาดสนิท** — lego.html โหลด lego-vault.js เท่านั้น ไม่โหลด word-vault.js
  · LOCK 7.A บอกว่าวัตถุดิบ Lego ต้องมาจาก "คำ/ประโยคที่ Save" → วันนี้ทำไม่ได้

Lego ────────► Challenge
  · ❌ ไม่มีเส้นเชื่อม

Games ───────► Challenge
  · ใช้ตาราง/ฟังก์ชันชุดเดียวกัน (reading_sessions game='challenge', tone_srs_state game='challenge')
  · ❌ ไม่มี unlock gate (LOCK 10.4 「ต้องมี Learning Evidence ใหม่ก่อน」ยังไม่มีโค้ด)
  · ❌ ไม่มีการเทียบ Challenge evidence กับ Game evidence (LOCK 10.8 Language Readiness)

Challenge ───► Progress
  · reading_sessions(game='challenge') → RPC leaderboard เท่านั้น
  · ❌ ไม่เข้าหน้า my-progress (อ่านแค่ tone_sessions)

Progress ────► Planner
  · ❌ **ไม่มี Planner ในระบบเลย** (ไม่มีไฟล์ ไม่มีตาราง ไม่มีฟังก์ชัน)

Any ─────────► AI / Future
  · ❌ ยังไม่มี — แต่ practice_events เตรียมช่อง evidence_source/'ai_practice' ไว้แล้ว ✅
```

## F.1 จุดที่ระบบยังแยกขาดจากกัน (สรุป)

1. **เกมฟัง ↔ ทุกอย่าง** — ขาดสนิท
2. **คลังคำ ↔ เลโก้** — ขาดสนิท (ทั้งที่ LOCK 7.A ต้องการ)
3. **Search ↔ เกม** — เชื่อมแค่ลิงก์ ไม่ส่ง context
4. **Challenge ↔ Progress** — ไม่ต่อ
5. **Planner** — ยังไม่มีอยู่เลย
6. **`learning_items` ↔ evidence ทั้งหมด** — ตัวตนออกเลขแล้ว (735 คำ + 30 ประโยค) แต่ยังไม่มีใครอ้างถึง

## F.2 จุดที่ hard-code ตามชื่อเกม (ควรเป็น shared capability)

| ที่ | โค้ด | ปัญหา |
|---|---|---|
| `js/games/reading-auth.js:513` | `game === 'typing' \|\| 'reading' \|\| 'word_order' \|\| 'lego' \|\| 'challenge'` | เพิ่มเกมใหม่ต้องมาแก้บรรทัดนี้ |
| `supabase/functions/tone-round/index.ts` | `["tone","reading","typing","wordorder","challenge"]` | รายชื่อชุดที่ 2 **ที่ไม่ตรงกับชุดแรก** |
| `tone_srs_state` | คอลัมน์ `game` เป็นคีย์หลัก | Memory ผูกชื่อเกม (ขัด Architecture หมวด 6) |
| `star_ledger` | คอลัมน์ `game` + `word`(text) | เหมือนกัน |
| `js/games/tone-companion.js` | ดักชื่อ event `tone_finder_start`/`tone_answer_wrong`/`tone_finder_complete` | ผูกกับชื่อ GA4 event ของเกมเดียว |

→ `practice_surfaces` + `practice_types` ที่สร้างไว้แล้ว **คือคำตอบของเรื่องนี้** — แค่ยังไม่มีใครใช้

---

# G. Parallel / Duplicate Systems

**ทุกข้อมีหลักฐานจาก source จริง ไม่มีข้อไหนเดา**

| # | ระบบที่ซ้ำ | หลักฐาน (ไฟล์:บรรทัด / ตาราง) | ผลกระทบ |
|---|---|---|---|
| G1 | **ตารางประวัติการเล่น 2 ชุด** | `tone_sessions` (เขียนโดย `js/games/tone-companion.js:80`) · `reading_sessions` (เขียนโดย `js/games/reading-auth.js:523`) | Progress/analytics ต้องอ่าน 2 ที่เสมอ · โครงคอลัมน์ต่างกัน (`wrong_words` vs `wrong_items`) |
| G2 | **คลังคำ 2 ระบบ** | `js/games/word-vault.js:58` (`linvault_v1`, MAX 30, sync) · `js/games/lego-vault.js:12` (`lego_vault_v1`, MAX 15, ไม่ sync) | คำที่เซฟในเลโก้หายเมื่อล้างเบราว์เซอร์ · ตาราง `learning_saved_items` **มี `vault_key='lego_vault'` เตรียมไว้แล้ว** แต่ยังไม่มีใครใช้ |
| G3 | **Learning Memory 2 ชุด** | `tone_srs_state` (ใช้จริง, คีย์ user+game+level+word) · `learning_memory` (ตารางใหม่, ว่าง, คีย์ user+item_id+skill) | ถ้าเริ่มเขียนตัวใหม่โดยไม่วางแผน จะกลายเป็น source of truth 2 ชุดถาวร |
| G4 | **ตัวตนของเนื้อหา 2 ชุด** | `game_words` unique(`word`,`level`) + `scripts/migrate-game-content.js` มี `pruneStale()` ที่ลบแถวจริง · `learning_items.item_id` (uuid, นิ่ง) | แก้ typo = ประวัติขาด (ปัญหานี้ถูกจดไว้แล้วในหัวไฟล์ SQL — ยังไม่ได้แก้) |
| G5 | **ชื่อเกม 3 ชุด** | `word_order` (`reading-auth.js:513`) · `wordorder` (`tone-round/index.ts`) · `word_order` (GA4) · `tone-finder` (source_raw ในคลังคำ) vs `tone_finder` (`practice_surfaces.code`) | จับคู่ข้อมูลข้ามระบบพลาดได้ — **มีตัวช่วยแล้ว** (`practice_surfaces.legacy_codes`) แต่ยังไม่มีใครเรียกใช้<br>🆕 **อัปเดต 2026-08-11:** ตารางจับคู่ครบแล้วทุกค่า (`sql/2026-08-11_practice_surface_vault_aliases.sql` — รอ Lin รัน) · **แต่ยังไม่มีโค้ดไหนอ่าน `legacy_codes` เลย** ตัวปัญหาจริงจึงยังอยู่ รอ Decision ว่าจะให้ระบบไหนเริ่มใช้ก่อน |
| G6 | **สถานะ mastery 2 แบบ** | `tone_srs_state.mastered` (boolean 2 ค่า) · `learning_memory_states` (5 สถานะ) | ถ้าเขียนสูตรใหม่โดยไม่แปลงของเก่า จะมีคำตอบ 2 แบบสำหรับคำถามเดียวกัน |
| G7 | **Search UI logic ก๊อป 2 ชุด** | `js/core/search-ui.js` · `js/games/games-search-ui.js` — โครงเหมือนกันเกือบบรรทัดต่อบรรทัด | engine ไม่ซ้ำ ✅ แต่ presentation ซ้ำ · surface ที่ 3 = ก๊อปชุดที่ 3 |
| G8 | **เพดานสิทธิ์กระจาย 3 ที่** | `CAPS` ใน `game-content/index.ts` · `MAX_WORDS` ใน `word-vault.js`/`lego-vault.js` · `lego_daily_limits` | ยังไม่มี entitlement กลาง |
| G9 | **ตารางที่ไม่มีคนเขียน** | `anon_game_events` — มีตาราง (`supabase/schema/..._01_tables...sql:53`) + มี RLS policy ให้ insert (`..._02_policies.sql:26`) แต่ **ค้นทั้ง repo ไม่เจอโค้ดที่เขียนลงตารางนี้เลย** | ข้อมูล anon ที่ LOCK 14.7 ต้องการ ยังไม่ถูกเก็บจริง |

**ของที่ตรวจแล้ว "ไม่ซ้ำ" (ข่าวดี):**
- Search engine — 1 ชุดจริง ✅
- Auth — `reading-auth.js` + `auth-widget.js` รวมเป็นทางเดียวแล้ว ✅ (ยกเว้นเกมฟังที่ไม่ต่อเลย)
- โหลดเนื้อหาเกม — `game-content` ทางเดียว ✅
- AI profile แยกจาก Learning Memory — ❌ ไม่มีปัญหาเพราะยังไม่มี AI

---

# H. Safe-to-Implement Queue

## ✅ SAFE NOW — ทำได้เลย ไม่ต้องมี Product Decision ใหม่

> 🔴 **อัปเดต 2026-08-11 (หลัง Lin ตัดสิน) — 3 ข้อในตารางนี้ถูกถอนออกแล้ว ห้ามหยิบไปทำ:**
> · **S1 (Progress) → BLOCKED** — Lin ตัดสินว่า `tone_sessions` กับ `reading_sessions` โครงต่างกัน **ห้าม normalize เอง** ต้องรอ shared progress/evidence model ก่อน
> · **S7 + S8 (Search logging) → BLOCKED** — Lin ตัดสินว่าห้ามสร้าง table/implementation/analytics event ของ Search เพิ่มทั้งหมด จนกว่าจะเคลียร์เรื่อง Privacy/Data (ดู N3)
> · **S3 ยังค้างอยู่** — ตารางจับคู่ชื่อพร้อมแล้ว (`sql/2026-08-11_practice_surface_vault_aliases.sql`) แต่ **ยังไม่ได้ backfill `source_surface`** และยังไม่มีโค้ดไหนอ่าน `legacy_codes` (ดู G5)

> ทั้งหมดนี้ **ยังไม่ได้แก้ในรอบนี้** ตามคำสั่ง — รายงานไว้ให้ Lin สั่งรอบถัดไป

| # | งาน | ทำไมปลอดภัย | ไฟล์ที่จะแตะ |
|---|---|---|---|
| S1 | **หน้า Progress อ่าน `reading_sessions` ด้วย** | ข้อมูลมีอยู่แล้ว แค่ไม่มีใครอ่าน · ไม่เปลี่ยน schema · ไม่เปลี่ยนวิธีเก็บ · เป็นการ "โชว์ความจริงที่มีอยู่" ไม่ใช่คิดสูตรใหม่ | `js/score/progress.js` |
| S2 | **เติม `item_id` ให้ `learning_saved_items` ย้อนหลัง** | จับคู่ `word_th` กับ `learning_items.content_key` ตรงๆ · ช่องมีอยู่แล้ว เป็น nullable · ไม่กระทบ UI | SQL ใหม่ 1 ไฟล์ |
| S3 | **เติม `source_surface` จาก `source_raw`** | `practice_surfaces.legacy_codes` มีตารางจับคู่ครบแล้ว · ช่องว่างอยู่ · ไม่กระทบ `sourceLabel()` เดิม | SQL ใหม่ 1 ไฟล์ |
| S4 | **สร้าง `learning_item_relations` (ประโยค→คำ) จากของที่จับคู่ได้ 63%** | ตัวเลขมาจาก `audit-learning-content.js` ของจริง · ตาราง+ชนิดความสัมพันธ์มีแล้ว · **ห้ามเติมคำใหม่เพื่อให้ครบ 100%** | SQL ใหม่ 1 ไฟล์ |
| S5 | **ให้ `lego-vault` ใช้ `learning_saved_items` (`vault_key='lego_vault'`)** | ค่า `vault_key` ถูกออกแบบเผื่อไว้แล้วตั้งแต่ต้น · ลอกท่า sync จาก `word-vault.js` ที่ทดสอบผ่านแล้ว · เพดาน 15 คงเดิม | `js/games/lego-vault.js` |
| S6 | **ยุบ `search-ui.js` + `games-search-ui.js` เป็นตัวเดียวรับพารามิเตอร์ scope** | ไม่แตะ engine · ไม่เปลี่ยนผลลัพธ์ · ป้องกัน surface ที่ 3 กลายเป็นก๊อปที่ 3 · มี `tests-search-behavioral.js` คุ้มกันอยู่แล้ว | 2 ไฟล์ + 3 หน้า HTML |
| S7 | **เก็บคำค้นลง GA4 เพิ่ม (ยังไม่ทำ Search Journey)** | LOCK 9.7 บอกให้บันทึกทุก Search · ขั้นนี้ยังไม่ต้องตัดสินอะไรใหม่ · แต่ **ต้องเช็คนโยบายความเป็นส่วนตัวก่อน** (ดู N3 ใน NEED DECISION) | `search-ui.js` |
| S8 | **ยิง GA4 event ตอน "ไม่เจอเลย"** | วันนี้ไม่มี event นี้ → LOCK 15.6 (Search Gap) ทำไม่ได้ · เพิ่ม event เดียว ไม่กระทบอะไร | `search-ui.js` + `games-search-ui.js` |
| S9 | **ให้ Search กรองด้วย `access`** | ช่อง `access` มีอยู่แล้วทุกรายการ · ตอนนี้ทุกอันเป็น `'free'` → กรองแล้วผลลัพธ์เท่าเดิมเป๊ะ (ไม่มี behavior change) แต่โครงพร้อมรับ premium | `search-engine.js` |

## ⚠️ NEED PRODUCT DECISION — ต้องถาม Lin ก่อน

| # | เรื่อง | คำถามที่ต้องตอบ | ทำไมห้ามเดา |
|---|---|---|---|
| N1 | **เกมฟังต่อกับระบบบัญชี** | คะแนนเกมฟังเข้าตารางไหน? ได้ดาว/SRS ไหม? ขึ้น leaderboard ไหม? มี board แยกไหม? | กระทบระบบดาว/อันดับที่มีคนใช้จริงอยู่ · เลือกผิดแล้วย้อนยาก |
| N2 | **รวม `tone_sessions` + `reading_sessions`** | รวมเป็นตารางเดียว หรือปล่อยไว้แล้วอ่าน 2 ที่? | เป็นข้อมูลนักเรียนจริง · ย้ายผิด = ประวัติหาย · ขัดกฎ RELIABILITY FIRST |
| N3 | **เก็บคำค้นจริงไหม** | คำค้นเป็นข้อมูลส่วนตัวหรือไม่? เก็บผูกบัญชีหรือ anonymous? เก็บกี่วัน? | LOCK 14.7 บอก「Lin ไม่ต้องการเก็บข้อมูลส่วนตัว」แต่ 9.7 บอก「ทุก Search ต้องถูกบันทึก」— **2 ข้อนี้ต้องให้ Lin ชี้เส้นแบ่งเอง** |
| N4 | **รายชื่อ Skill** | Recognition/Recall/Structure/Output แตกเป็นกี่ code? | `learning_skills` ว่าง = `learning_memory` เขียนไม่ได้เลย · **เป็น blocker ใหญ่ที่สุด** |
| N5 | **รายชื่อ 詞類 / 情境** | 26 หมวดที่มีวันนี้ จับเข้า 2 แกนยังไง? ("นามอาหาร" ปน 2 แกนในค่าเดียว) | ขัดกฎ 16 ถ้า AI จัดเอง |
| N6 | **เกณฑ์ `learning_item_surfaces`** | คำแบบไหนใช้กับเกมไหนได้? | ต้องดู data/game requirements จริง — Lin ยืนยันเกณฑ์ก่อน |
| N7 | **ย้ายเพดานเข้า entitlement** | ย้าย `CAPS` เข้าตารางเมื่อไหร่? | ห้ามย้ายครึ่งทาง — จะมีเพดาน 2 ที่ไม่ตรงกัน (บทเรียนเดิมของ repo นี้) |
| N8 | **เพดานคลังคำเวลารวมข้ามเครื่อง** | เครื่อง A 30 คำ + เครื่อง B 25 คำไม่ซ้ำ = 55 คำ เกิน 30 → ทำยังไงโดยไม่ทำข้อมูลหาย | จดค้างไว้แล้วในหัวไฟล์ SQL · ห้าม AI ตัดทิ้งเอง |
| N9 | **`anon_game_events` จะใช้ไหม** | เก็บพฤติกรรม guest จริงไหม (LOCK 14.7) หรือลบตารางทิ้ง? | ตารางเปิด insert ให้ทุกคนอยู่ — ปล่อยทิ้งไว้เฉยๆ ก็เป็นความเสี่ยง |
| N10 | **CTA ขายคอร์สบนหน้าจบเกม** | (ค้างจากรอบก่อน) สเปกใหม่ห้ามมี promotion กลาง result แต่ของเดิมยังอยู่ | เป็นการตัดสินใจธุรกิจ |
| N11 🆕 | **ชื่อจีนของ Skill 10 ตัว** | `learning_skills.label_zh` เป็น **NOT NULL** แต่ §19 ระบุว่า `exact wording ภาษาจีน` ยังไม่ล็อก · Lin ให้ชื่อมาเป็นอังกฤษ (Tone / Word Recall / Syntax …) | เติมภาษาจีนเอง = ขัดกฎ 16 + §19 · **ตราบใดที่ยังไม่มีคำจีน `learning_skills` เขียนไม่ได้ → `learning_memory` ก็เขียนไม่ได้** (blocker ใหญ่สุดยังคาอยู่) |
| N12 🆕 | **เก็บกลุ่มของ Skill 4 กลุ่มยังไง** | Lin ล็อก 4 กลุ่ม (Recognition/Recall/Structure/Output) แต่ `learning_skills` **ไม่มีคอลัมน์เก็บกลุ่ม** · เพิ่มคอลัมน์ = structural change | ทางที่ไม่แตะ schema คือยัดชื่อกลุ่มลงช่อง `note` แต่จะ query แบบมีโครงสร้างไม่ได้ — Lin เลือกก่อน |
| N13 🔴 🆕 | **STATE CONFLICT: `未開始` vs `未練習`** | เอกสาร 14 หมวด (หมวด 6) เขียน `未開始` · แต่ `learning_foundation.sql` ที่ **รันขึ้น staging + production ไปแล้ว** เขียน `未練習` (แถว `not_started` ใน `learning_memory_states`) | เป็นถ้อยคำจีนที่ยังไม่ล็อก + แก้แล้วกระทบค่าที่ deploy ไปแล้ว · **ยังไม่แก้ทั้ง schema และ production รอ Lin ชี้ว่าอันไหนถูก** |

## 🔒 FUTURE — ยังไม่ควรแตะ

| เรื่อง | ติดอะไร |
|---|---|
| Mastery formula / spacing / threshold | หมวด 6 ระบุชัดว่ายังไม่ล็อก + ต้องมี N4 ก่อน |
| Challenge unlock gate / timer / scoring | หมวด 8 + §19 ยังไม่ล็อกทุกตัวเลข |
| Language Readiness | ต้องมี evidence จาก 2 ฝั่งครบก่อน (วันนี้เกมฟังไม่มีเลย) |
| Planner | ยังไม่มีในระบบเลย · หมวด 18.D ยังไม่ออกแบบ |
| Search Journey / conversational refinement | ต้องผ่าน N3 ก่อน |
| Personalized Challenge / Paid features | ต้องมี entitlement จริงก่อน (N7) |
| ย้าย `tone_srs_state` → `learning_memory` | ต้องมี N4 + สูตร Mastery ครบก่อน (จดเตือนไว้แล้วในไฟล์ SQL) |
| AI Practice / Social Practice / Real-world Mission | หมวด 14/17 — Future only |
| ราคา / Paywall / Founding benefit / quota | §19 ห้ามเดาทุกตัว |

---

# I. สิ่งที่ STOP ในรอบนี้ (ไม่ตรวจต่อ + ไม่แตะ)

| เรื่อง | เหตุผลที่หยุด |
|---|---|
| การย้ายข้อมูลจาก `tone_srs_state` | เป็นข้อมูลนักเรียนจริง + Product ยังไม่ล็อก Skill/สูตร |
| การรวม `tone_sessions` / `reading_sessions` | อาจทำข้อมูลผู้ใช้หาย |
| การเติม `learning_skills` / `learning_tags` | ขัดกฎ 16 ถ้า AI เดา |
| การเปลี่ยนชื่อเกมในตารางเดิมให้ตรงกัน | จะทำให้ประวัติการเรียนของนักเรียนขาด |
| การตั้งเพดาน/quota/ราคา ใดๆ | §19 ห้ามเดา |
| Challenge 中級/高級 | ยังปิดโดยตั้งใจ + สูตรยังไม่ล็อก |

---

# J. ตรวจแล้วว่า "ไม่ขัดกัน" (source ตรงกับเอกสาร)

- ✅ `supabase/sql/00_ฟังก์ชันไหนอยู่ไฟล์ไหน.md` มี `2026-08-11_learning_foundation.sql` ในสารบัญแล้ว (ตามกฎ 2026-08-02)
- ✅ CLAUDE.md หัวข้อ 🔒 ระบบล็อกเนื้อหาเกม ตรงกับโค้ด `game-content/index.ts` จริง (CAPS 50/100/20/40)
- ✅ `practice_surfaces` มี 7 เกม ตรงกับเกมที่มีจริงใน repo 7 เกม
- ✅ ไฟล์ SQL มีบล็อก rollback `[Z]` ครบตามกฎ 2026-08-08
- ⚠️ **ไม่ได้ตรวจของจริงบนฐานข้อมูล** — รายงานนี้อ่านจาก source code ในเครื่องเท่านั้น
  ตัวเลข "735 คำ / 30 ประโยค" มาจากไฟล์ `data/words-data.js` / `data/adv-sentences.js`
  **ยังไม่ยืนยันว่า `game_words` บน Supabase ตรงกับไฟล์นี้** (ต้องรัน `scripts/migrate-game-content.js` ตรวจ)

---

**สรุปสั้นที่สุด:** โครงกลางที่วางไว้เมื่อวาน **ตรงกับ Architecture ที่เพิ่ง LOCK มาก** ไม่ต้องรื้ออะไร
ของที่ขาดคือ **สายไฟ** — ตารางมีครบแล้วแต่ยังไม่มีใครเขียนลงไป
งานที่ทำได้ทันทีมี 9 อย่าง (S1–S9) ที่เหลือติด Decision ของ Lin โดยเฉพาะ **รายชื่อ Skill (N4)** ซึ่งเป็นตัวปลดล็อกใหญ่ที่สุด
