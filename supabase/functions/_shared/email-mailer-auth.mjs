export const EMAIL_MAILER_SECRET_NAME = 'email-otp-mailer';

/**
 * Resolve the one named Supabase secret API key allowed to invoke the mailer.
 * Supabase exposes named secret keys to Edge Functions through
 * SUPABASE_SECRET_KEYS. Missing, malformed, legacy-JWT, or publishable values
 * deliberately resolve to an empty string so callers fail closed.
 */
export function readEmailMailerSecret(secretKeysJson) {
  let keys;
  try {
    keys = JSON.parse(String(secretKeysJson || ''));
  } catch (_error) {
    return '';
  }
  if (!keys || typeof keys !== 'object' || Array.isArray(keys)
      || !Object.prototype.hasOwnProperty.call(keys, EMAIL_MAILER_SECRET_NAME)) return '';

  const value = keys[EMAIL_MAILER_SECRET_NAME];
  if (typeof value !== 'string' || value !== value.trim() || !/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(value)) return '';
  return value;
}

function timingSafeEqual(left, right) {
  const leftBytes = new TextEncoder().encode(String(left || ''));
  const rightBytes = new TextEncoder().encode(String(right || ''));
  const length = Math.max(leftBytes.length, rightBytes.length);
  let mismatch = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return mismatch === 0;
}

/**
 * The mailer accepts only the exact named server key in `apikey`.
 * Any Authorization header is rejected so a user JWT, legacy service-role JWT,
 * or secret copied into Bearer auth cannot become an alternate contract.
 */
export function isEmailMailerRequestAuthorized(headers, secretKeysJson) {
  if (!headers || typeof headers.get !== 'function') return false;
  if (headers.get('authorization')) return false;
  const expected = readEmailMailerSecret(secretKeysJson);
  const supplied = headers.get('apikey') || '';
  return Boolean(expected && supplied && timingSafeEqual(supplied, expected));
}

/**
 * Compatibility bridge for the already-existing account-deletion callers.
 * It preserves their exact dual-header service-role contract only so a mailer
 * deployment cannot strand account recovery. It is never valid for Email OTP.
 */
export function isLegacyAccountMailerRequestAuthorized(headers, serviceRoleKey) {
  if (!headers || typeof headers.get !== 'function' || !serviceRoleKey) return false;
  const authorization = headers.get('authorization') || '';
  const suppliedApiKey = headers.get('apikey') || '';
  return timingSafeEqual(authorization, `Bearer ${serviceRoleKey}`)
    && timingSafeEqual(suppliedApiKey, serviceRoleKey);
}

export function isEmailMailerTemplateAuthorized(caller, template) {
  if (caller === 'email-otp') return template === 'email_login_otp';
  if (caller === 'account-recovery') {
    return template === 'account_deletion_requested'
      || template === 'account_deletion_cancelled'
      || template === 'account_deletion_completed';
  }
  return false;
}
