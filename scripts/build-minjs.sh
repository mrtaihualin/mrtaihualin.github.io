#!/usr/bin/env bash
# build-minjs.sh
# สร้างไฟล์ .min.js ใหม่ทับของเดิม จากไฟล์ต้นฉบับ .js ทั้ง 5 คู่
# ใช้ terser ผ่าน npx (ไม่ต้องติดตั้งอะไรถาวร ไม่มี package.json/node_modules ใน repo)
#
# ใช้เมื่อไหร่: ทุกครั้งที่แก้ไฟล์ .js ต้นฉบับด้านล่างนี้ ต้องรันคำสั่งนี้ก่อน push เสมอ
# เพราะเว็บทุกหน้าโหลดแต่ .min.js เท่านั้น ไม่มีหน้าไหนโหลด .js ตัวเต็มเลย
# (ยืนยันแล้วใน Bussiness Idea/ระบบเว็บไซต์/24f_ผลลัพธ์_P3_min-js-sync.md)
#
# วิธีใช้: bash scripts/build-minjs.sh
# ต้องมีอินเทอร์เน็ต (npx จะดาวน์โหลด terser ตอนรันถ้ายังไม่มีในเครื่อง)

set -euo pipefail
cd "$(dirname "$0")/.."

PAIRS=(
  "js/core/shared"
  "js/games/reading-game-app"
  "js/games/typing-game-app"
  "js/games/word-order-app"
  "js/games/tone-finder-game"
)

echo "=== สร้าง .min.js ใหม่จากต้นฉบับ ${#PAIRS[@]} ไฟล์ ==="
for f in "${PAIRS[@]}"; do
  echo "--- $f ---"
  npx --yes terser "$f.js" --compress --mangle -o "$f.min.tmp.js"
  node --check "$f.min.tmp.js"
  mv "$f.min.tmp.js" "$f.min.js"
  echo "OK: $f.min.js"
done

echo ""
echo "=== เสร็จแล้ว — ตรวจสอบต่อด้วย ==="
echo "node scripts/check-site.js"
echo "node scripts/check-minified-sync.js   (ดู mtime อย่างเดียว MISMATCH เป็นปกติ)"
