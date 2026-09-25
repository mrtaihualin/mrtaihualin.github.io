export async function forwardLineEventToSocialInbox(
  fetchImpl,
  endpoint,
  rawBody,
  signature,
  timeoutMs = 8000,
) {
  if (!endpoint) return { ok: false, skipped: true, status: 0 };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Line-Signature': signature,
      },
      body: rawBody,
      signal: controller.signal,
    });
    return { ok: response.ok, skipped: false, status: response.status };
  } catch (_error) {
    return { ok: false, skipped: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}
