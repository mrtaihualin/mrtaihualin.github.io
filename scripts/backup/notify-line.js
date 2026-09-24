#!/usr/bin/env node
'use strict';

const mode = process.argv[2];
const token = process.env.BACKUP_LINE_CHANNEL_ACCESS_TOKEN;
const userId = process.env.BACKUP_LINE_TEACHER_USER_ID;

async function notify() {
  if (!token || !userId) {
    console.error('WARNING: LINE notification variables are unavailable');
    return;
  }

  let message;
  if (mode === 'failure') {
    const jobUrl = process.env.CI_JOB_URL || 'GitLab CI job log';
    message = `⚠️ ระบบสำรองข้อมูล (P2-07) รันไม่สำเร็จวันนี้ ตรวจ log ด่วน: ${jobUrl}`;
  } else if (mode === 'weekly-success') {
    const taipeiWeekday = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Bangkok',
      weekday: 'short',
    }).format(new Date());
    if (taipeiWeekday !== 'Mon') return;
    message = '✅ ระบบสำรองข้อมูล (P2-07) ทำงานปกติสัปดาห์นี้ — ตรวจไฟล์ล่าสุดได้ในโฟลเดอร์ Google Drive';
  } else {
    throw new Error('notification mode must be failure or weekly-success');
  }

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: 'text', text: message }],
    }),
  });

  if (!response.ok) {
    throw new Error(`LINE notification returned HTTP ${response.status}`);
  }
}

notify().catch((error) => {
  console.error(`WARNING: ${error.message}`);
  process.exitCode = 1;
});
