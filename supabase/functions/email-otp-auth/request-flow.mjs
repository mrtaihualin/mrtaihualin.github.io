const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;

function failed(status = 503, error = 'request_failed') {
  return { status, body: { ok: false, error } };
}

export async function runOtpRequestFlow(options) {
  const {
    challengeId,
    beginChallenge,
    sendEmail,
    confirmDelivery,
    waitForDelivery,
    invalidateDelivery,
  } = options;

  let begun;
  try {
    begun = await beginChallenge();
  } catch (_) {
    return failed();
  }

  const status = String(begun && begun.status || '');
  const activeChallengeId = String(begun && begun.challenge_id || '');

  if (status === 'duplicate_delivered' && UUID_PATTERN.test(activeChallengeId)) {
    return { status: 202, body: { ok: true, challenge_id: activeChallengeId } };
  }

  if (status === 'duplicate_in_progress' && UUID_PATTERN.test(activeChallengeId)) {
    let delivered = false;
    try { delivered = await waitForDelivery(activeChallengeId); } catch (_) { delivered = false; }
    return delivered
      ? { status: 202, body: { ok: true, challenge_id: activeChallengeId } }
      : failed();
  }

  if (status === 'blocked') return failed(429, 'request_rejected');
  if (status !== 'claimed' || begun.accepted !== true || !UUID_PATTERN.test(challengeId) ||
      activeChallengeId !== challengeId) {
    return failed();
  }

  let delivered = false;
  try { delivered = await sendEmail(); } catch (_) { delivered = false; }
  if (!delivered) {
    try { await invalidateDelivery(); } catch (_) {}
    return failed();
  }

  let confirmed = false;
  try { confirmed = await confirmDelivery(); } catch (_) { confirmed = false; }
  if (!confirmed) return failed();

  return { status: 202, body: { ok: true, challenge_id: challengeId } };
}
