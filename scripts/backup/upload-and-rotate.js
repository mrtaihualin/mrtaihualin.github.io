#!/usr/bin/env node
// scripts/backup/upload-and-rotate.js
// ใช้โดย .github/workflows/backup-database-to-drive.yml เท่านั้น (P2-07)
//
// ทำ 3 อย่างตามลำดับ:
//   1) อัปโหลดไฟล์สำรองขึ้น Google Drive
//   2) ถามกลับไปที่ Drive ว่าไฟล์ที่เพิ่งอัปโหลด "ขนาดตรงกับต้นทางจริงไหม" (ไม่เชื่อแค่ HTTP 200)
//   3) ลบของเก่าที่เกินจำนวนวันที่กำหนด — ทำได้ก็ต่อเมื่อข้อ 2 ผ่านแล้วเท่านั้น
//      (กันเหตุการณ์ "ของใหม่พังเงียบ + ของเก่าโดนลบไปแล้ว = เหลือ 0 สำรอง")
//
// ไม่เห็น/ไม่บันทึกค่าลับใดๆ นอกจากอ่านจาก environment variable ที่ GitHub Actions ส่งมาให้ตอนรันเท่านั้น

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`::error::ขาดตัวแปรแวดล้อม ${name} — ตั้ง secret นี้ใน GitHub ก่อน`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const clientId = required('GDRIVE_CLIENT_ID');
  const clientSecret = required('GDRIVE_CLIENT_SECRET');
  const refreshToken = required('GDRIVE_REFRESH_TOKEN');
  const folderId = required('GDRIVE_FOLDER_ID');
  const filePath = required('FILE_PATH');
  const retentionDays = parseInt(process.env.RETENTION_DAYS || '30', 10);

  if (!fs.existsSync(filePath)) {
    console.error(`::error::ไม่พบไฟล์ ${filePath} ที่จะอัปโหลด`);
    process.exit(1);
  }
  const localSize = fs.statSync(filePath).size;
  if (localSize < 100) {
    console.error(`::error::ไฟล์ ${filePath} เล็กผิดปกติ (${localSize} ไบต์) ไม่อัปโหลด`);
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  // 1) อัปโหลด
  const fileName = path.basename(filePath);
  console.log(`กำลังอัปโหลด ${fileName} (${localSize} ไบต์) ไปที่โฟลเดอร์ ${folderId} ...`);
  let uploadedId;
  try {
    const uploadRes = await drive.files.create({
      requestBody: { name: fileName, parents: [folderId] },
      media: { mimeType: 'application/octet-stream', body: fs.createReadStream(filePath) },
      fields: 'id,name,size',
    });
    uploadedId = uploadRes.data.id;
  } catch (err) {
    console.error(`::error::อัปโหลดขึ้น Google Drive ล้มเหลว: ${err.message}`);
    process.exit(1);
  }
  if (!uploadedId) {
    console.error('::error::อัปโหลดไม่สำเร็จ — ไม่ได้รับ file id กลับมาจาก Google');
    process.exit(1);
  }

  // 2) ตรวจสอบว่าไฟล์บน Drive ขนาดตรงกับไฟล์ต้นทางจริง (ห้ามเชื่อแค่ HTTP 200)
  let remoteSize = -1;
  try {
    const verifyRes = await drive.files.get({ fileId: uploadedId, fields: 'id,name,size' });
    remoteSize = parseInt(verifyRes.data.size || '0', 10);
  } catch (err) {
    console.error(`::error::ตรวจสอบไฟล์บน Drive ไม่สำเร็จ: ${err.message}`);
    process.exit(1);
  }
  if (remoteSize !== localSize) {
    console.error(
      `::error::ขนาดไฟล์บน Drive (${remoteSize} ไบต์) ไม่ตรงกับไฟล์ต้นทาง (${localSize} ไบต์) — ถือว่าอัปโหลดล้มเหลว`
    );
    try {
      await drive.files.delete({ fileId: uploadedId }); // กันไฟล์เสียครึ่งๆ กลางๆ ค้างอยู่บน Drive
      console.error('ลบไฟล์ที่อัปโหลดไม่สมบูรณ์ทิ้งแล้ว');
    } catch (e) {
      console.error(`::warning::ลบไฟล์เสียทิ้งไม่สำเร็จ (${e.message}) — ควรเข้าไปลบเองใน Drive`);
    }
    process.exit(1);
  }
  console.log(`✅ ยืนยันแล้ว: ไฟล์บน Drive ขนาดตรงกับต้นทางเป๊ะ (${remoteSize} ไบต์) — ถือว่าสำรองสำเร็จจริง`);

  // 3) ลบของเก่าที่เกินกำหนด — มาถึงบรรทัดนี้ได้แปลว่าของใหม่ผ่านการตรวจสอบแล้วเท่านั้น
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  let files = [];
  try {
    const listRes = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id,name,createdTime)',
      orderBy: 'createdTime',
      pageSize: 1000,
    });
    files = listRes.data.files || [];
  } catch (err) {
    console.error(`::warning::ดึงรายการไฟล์เก่าไม่สำเร็จ (${err.message}) — ข้ามการลบของเก่ารอบนี้ ไม่ถือว่าเป็นความล้มเหลวของงานหลัก`);
    return; // สำรองสำเร็จแล้ว แค่ยังไม่ได้ลบของเก่า ไม่ทำให้ workflow แดง
  }

  let deletedCount = 0;
  for (const f of files) {
    if (f.id === uploadedId) continue; // ห้ามลบไฟล์ที่เพิ่งอัปโหลดเด็ดขาด
    const created = new Date(f.createdTime);
    if (created < cutoff) {
      try {
        await drive.files.delete({ fileId: f.id });
        console.log(`ลบของเก่า: ${f.name} (สร้างเมื่อ ${f.createdTime})`);
        deletedCount++;
      } catch (e) {
        console.error(`::warning::ลบ ${f.name} ไม่สำเร็จ: ${e.message}`);
      }
    }
  }
  console.log(`เสร็จสิ้น: อัปโหลดสำเร็จ 1 ไฟล์ + ลบของเก่า ${deletedCount} ไฟล์ (เก็บย้อนหลัง ${retentionDays} วัน)`);
}

main().catch((err) => {
  console.error('::error::' + (err && err.message ? err.message : String(err)));
  process.exit(1);
});
