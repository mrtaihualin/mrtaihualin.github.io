#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`missing required environment: ${name}`);
  return value;
}

async function uploadOnly() {
  const filePath = required('FILE_PATH');
  const folderId = required('GDRIVE_FOLDER_ID');
  if (!fs.existsSync(filePath)) throw new Error('backup file is missing');

  const local = fs.readFileSync(filePath);
  if (local.length < 100) throw new Error('backup file is unexpectedly small');
  const localMd5 = crypto.createHash('md5').update(local).digest('hex');

  const oauth2 = new google.auth.OAuth2(
    required('GDRIVE_CLIENT_ID'),
    required('GDRIVE_CLIENT_SECRET')
  );
  oauth2.setCredentials({ refresh_token: required('GDRIVE_REFRESH_TOKEN') });
  const drive = google.drive({ version: 'v3', auth: oauth2 });

  const created = await drive.files.create({
    requestBody: { name: path.basename(filePath), parents: [folderId] },
    media: { mimeType: 'application/octet-stream', body: fs.createReadStream(filePath) },
    fields: 'id',
  });
  const uploadedId = created && created.data && created.data.id;
  if (!uploadedId) throw new Error('upload did not return a file id');

  const verified = await drive.files.get({
    fileId: uploadedId,
    fields: 'id,size,md5Checksum',
  });
  const remoteSize = Number(verified && verified.data && verified.data.size);
  const remoteMd5 = verified && verified.data && verified.data.md5Checksum;
  if (remoteSize !== local.length || remoteMd5 !== localMd5) {
    throw new Error('remote size/checksum does not match the local backup');
  }

  console.log(`BACKUP_ONLY upload+verify PASS (${local.length} bytes)`);
}

uploadOnly().catch((error) => {
  console.error(`ERROR: manual BACKUP_ONLY failed: ${error.message}`);
  process.exit(1);
});
