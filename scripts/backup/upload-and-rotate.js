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

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BACKUP_FILE_RE = /^backup_\d{4}-\d{2}-\d{2}_\d{4}-th\.tar\.gz\.gpg$/;

function required(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`ขาดตัวแปรแวดล้อม ${name} — ตั้ง secret นี้ใน GitHub ก่อน`);
  }
  return v;
}

function parseRetentionDays(raw) {
  const value = String(raw == null ? '30' : raw).trim();
  if (!/^\d+$/.test(value)) {
    throw new Error(`RETENTION_DAYS ต้องเป็นจำนวนเต็มบวก แต่ได้รับ ${JSON.stringify(value)}`);
  }
  const days = Number(value);
  if (!Number.isSafeInteger(days) || days < 1 || days > 3650) {
    throw new Error(`RETENTION_DAYS ต้องอยู่ระหว่าง 1 ถึง 3650 วัน แต่ได้รับ ${JSON.stringify(value)}`);
  }
  return days;
}

function parseBackupOnly(raw) {
  // Fail closed: ถ้า caller ไม่ส่งโหมดมา ให้ถือว่าเป็น backup-only และห้ามลบ
  // Scheduled workflow ต้องส่ง false แบบ explicit เท่านั้นจึงจะเข้า retention path เดิม
  const value = String(raw == null ? 'true' : raw).trim().toLowerCase();
  if (value !== 'true' && value !== 'false') {
    throw new Error(`BACKUP_ONLY ต้องเป็น true หรือ false เท่านั้น แต่ได้รับ ${JSON.stringify(value)}`);
  }
  return value === 'true';
}

function isManagedBackupName(name) {
  return BACKUP_FILE_RE.test(String(name || ''));
}

function md5File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function removeIncompleteUpload(drive, uploadedId, logger) {
  try {
    await drive.files.delete({ fileId: uploadedId });
    logger.error('ลบไฟล์ที่อัปโหลดไม่สมบูรณ์ทิ้งแล้ว');
  } catch (err) {
    logger.error(`::warning::ลบไฟล์เสียทิ้งไม่สำเร็จ (${err.message}) — ควรเข้าไปลบเองใน Drive`);
  }
}

async function listAllFiles(drive, folderId) {
  const files = [];
  let pageToken;
  do {
    const listRes = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken,files(id,name,createdTime)',
      orderBy: 'createdTime',
      pageSize: 1000,
      ...(pageToken ? { pageToken } : {}),
    });
    files.push(...(listRes.data.files || []));
    pageToken = listRes.data.nextPageToken || undefined;
  } while (pageToken);
  return files;
}

async function uploadAndRotate({
  drive,
  filePath,
  folderId,
  retentionDays,
  backupOnly = false,
  now = Date.now(),
  logger = console,
}) {
  const fileName = path.basename(filePath);

  if (!fs.existsSync(filePath)) {
    throw new Error(`ไม่พบไฟล์ ${filePath} ที่จะอัปโหลด`);
  }
  const localSize = fs.statSync(filePath).size;
  if (localSize < 100) {
    throw new Error(`ไฟล์ ${filePath} เล็กผิดปกติ (${localSize} ไบต์) ไม่อัปโหลด`);
  }
  if (!isManagedBackupName(fileName)) {
    throw new Error(`ชื่อไฟล์ ${fileName} ไม่ใช่ encrypted managed backup — หยุดก่อนอัปโหลดหรือลบ retention`);
  }
  const localMd5 = await md5File(filePath);

  // 1) อัปโหลด
  logger.log(`กำลังอัปโหลด ${fileName} (${localSize} ไบต์) ไปยังโฟลเดอร์สำรองที่กำหนด ...`);
  let uploadedId;
  try {
    const uploadRes = await drive.files.create({
      requestBody: { name: fileName, parents: [folderId] },
      media: { mimeType: 'application/octet-stream', body: fs.createReadStream(filePath) },
      fields: 'id,name,size,md5Checksum',
    });
    uploadedId = uploadRes.data.id;
  } catch (err) {
    throw new Error(`อัปโหลดขึ้น Google Drive ล้มเหลว: ${err.message}`);
  }
  if (!uploadedId) {
    throw new Error('อัปโหลดไม่สำเร็จ — ไม่ได้รับ file id กลับมาจาก Google');
  }

  // 2) ตรวจสอบทั้งขนาดและ checksum (ห้ามเชื่อแค่ HTTP 200 หรือขนาดอย่างเดียว)
  let remoteSize = -1;
  let remoteMd5 = '';
  try {
    const verifyRes = await drive.files.get({ fileId: uploadedId, fields: 'id,name,size,md5Checksum' });
    remoteSize = parseInt(verifyRes.data.size || '0', 10);
    remoteMd5 = String(verifyRes.data.md5Checksum || '').toLowerCase();
  } catch (err) {
    if (!backupOnly) {
      await removeIncompleteUpload(drive, uploadedId, logger);
    } else {
      logger.error('::warning::BACKUP_ONLY=true — ไม่ลบไฟล์บน Drive แม้ตรวจสอบไฟล์ใหม่ไม่สำเร็จ');
    }
    throw new Error(`ตรวจสอบไฟล์บน Drive ไม่สำเร็จ: ${err.message}`);
  }
  if (remoteSize !== localSize || remoteMd5 !== localMd5) {
    if (!backupOnly) {
      await removeIncompleteUpload(drive, uploadedId, logger);
    } else {
      logger.error('::warning::BACKUP_ONLY=true — ไม่ลบไฟล์บน Drive แม้ไฟล์ใหม่ตรวจสอบไม่ผ่าน');
    }
    throw new Error(
      `ไฟล์บน Drive ไม่ตรงกับต้นทาง (size ${remoteSize}/${localSize}, checksum ${remoteMd5 || 'missing'}/${localMd5})`
    );
  }
  logger.log(`✅ ยืนยันแล้ว: ไฟล์บน Drive ตรงกับต้นทางทั้งขนาดและ checksum (${remoteSize} ไบต์)`);

  if (backupOnly) {
    logger.log('เสร็จสิ้นแบบ BACKUP_ONLY: อัปโหลดและตรวจสอบสำเร็จ 1 ไฟล์; ไม่เรียก files.list/files.delete');
    return {
      uploadedId,
      uploaded: true,
      retentionComplete: false,
      deletedCount: 0,
      backupOnly: true,
    };
  }

  // 3) ลบของเก่าที่เกินกำหนด — มาถึงบรรทัดนี้ได้แปลว่าของใหม่ผ่านการตรวจสอบแล้วเท่านั้น
  const cutoff = new Date(now - retentionDays * 24 * 60 * 60 * 1000);
  let files = [];
  try {
    files = await listAllFiles(drive, folderId);
  } catch (err) {
    logger.error(`::warning::ดึงรายการไฟล์เก่าไม่สำเร็จ (${err.message}) — ข้ามการลบของเก่ารอบนี้ ไม่ถือว่าเป็นความล้มเหลวของงานหลัก`);
    return { uploadedId, uploaded: true, retentionComplete: false, deletedCount: 0 };
  }

  let deletedCount = 0;
  for (const f of files) {
    if (f.id === uploadedId) continue; // ห้ามลบไฟล์ที่เพิ่งอัปโหลดเด็ดขาด
    if (!isManagedBackupName(f.name)) continue; // ห้ามแตะไฟล์อื่น แม้อยู่ในโฟลเดอร์เดียวกันและเก่ากว่า retention
    const created = new Date(f.createdTime);
    if (Number.isFinite(created.getTime()) && created < cutoff) {
      try {
        await drive.files.delete({ fileId: f.id });
        logger.log(`ลบของเก่า: ${f.name} (สร้างเมื่อ ${f.createdTime})`);
        deletedCount++;
      } catch (e) {
        logger.error(`::warning::ลบ ${f.name} ไม่สำเร็จ: ${e.message}`);
      }
    }
  }
  logger.log(`เสร็จสิ้น: อัปโหลดสำเร็จ 1 ไฟล์ + ลบของเก่า ${deletedCount} ไฟล์ (เก็บย้อนหลัง ${retentionDays} วัน)`);
  return { uploadedId, uploaded: true, retentionComplete: true, deletedCount };
}

async function main() {
  const clientId = required('GDRIVE_CLIENT_ID');
  const clientSecret = required('GDRIVE_CLIENT_SECRET');
  const refreshToken = required('GDRIVE_REFRESH_TOKEN');
  const folderId = required('GDRIVE_FOLDER_ID');
  const filePath = required('FILE_PATH');
  const backupOnly = parseBackupOnly(process.env.BACKUP_ONLY);
  const retentionDays = parseRetentionDays(process.env.RETENTION_DAYS);
  const { google } = require('googleapis');
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  await uploadAndRotate({ drive, filePath, folderId, retentionDays, backupOnly });
}

module.exports = {
  BACKUP_FILE_RE,
  isManagedBackupName,
  listAllFiles,
  md5File,
  parseBackupOnly,
  parseRetentionDays,
  uploadAndRotate,
};

if (require.main === module) {
  main().catch((err) => {
    console.error('::error::' + (err && err.message ? err.message : String(err)));
    process.exitCode = 1;
  });
}
