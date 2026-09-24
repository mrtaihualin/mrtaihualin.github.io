// Rate policy for the protected Typing round routes.
// Correct characters and Backspace are local-only. A network event is emitted
// only for wrong, hint, completion or Skip evidence. The event bucket therefore
// must support real typing bursts; control traffic keeps a separate low-rate key.

export const TYPING_ROUND_EVENT_RATE = Object.freeze({ limit: 600, window: 60 });
export const TYPING_ROUND_CONTROL_RATE = Object.freeze({ limit: 120, window: 600 });

export function typingRoundRateArgs(action, userId) {
  if (typeof userId !== 'string' || !userId) throw Object.assign(new Error('invalid_rate_owner'), { code: 'invalid_rate_owner' });
  if (action === 'typing_round_event') {
    return { p_key: `typing-round-event:${userId}`, p_limit: TYPING_ROUND_EVENT_RATE.limit,
      p_window: TYPING_ROUND_EVENT_RATE.window };
  }
  return { p_key: `typing-round-control:${userId}`, p_limit: TYPING_ROUND_CONTROL_RATE.limit,
    p_window: TYPING_ROUND_CONTROL_RATE.window };
}
