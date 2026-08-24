// Verification-flow tuning knobs. Plain constants instead of env vars so
// behaviour stays predictable (and tests deterministic) across environments.

/** How long a emailed code stays valid. */
export const OTP_TTL_MS = 10 * 60 * 1000;
/** Wrong entries allowed before the code locks. */
export const OTP_MAX_ATTEMPTS = 5;
/** Minimum gap between two codes for the same address. */
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const OTP_LENGTH = 6;
