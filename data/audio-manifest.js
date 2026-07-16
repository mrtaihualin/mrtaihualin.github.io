// audio-manifest.js — รายชื่อคำที่มี "ไฟล์เสียงจริง" (Google Cloud TTS)
// ⚠️ ไฟล์นี้จะถูกสร้างใหม่อัตโนมัติโดยสคริปต์ทำเสียง — ห้ามแก้มือ
// ตอนนี้ยังว่าง = ปุ่มลำโพงยังไม่โชว์ในเกม จนกว่าจะ generate เสียงครบแล้วสคริปต์เขียนไฟล์นี้ใหม่
// รูปแบบ words: { "คำไทย": "ชื่อไฟล์.mp3" } · baseUrl = ที่อยู่ storage (Supabase)
window.AUDIO_MANIFEST = {
  voiceId: '',
  baseUrl: '',
  words: {}
};
