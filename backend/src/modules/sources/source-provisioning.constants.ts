export const MAX_PROVISIONING_ATTEMPTS = 5;
export const PROVISIONING_BASE_RETRY_MS = 60_000;
export const PROVISIONING_MAX_RETRY_MS = 15 * 60_000;
export const RATE_LIMIT_EXTRA_BACKOFF_MS = 2 * 60_000;

/** Exponential backoff: 60s, 120s, 240s, 480s, capped at 15 minutes. */
export function nextProvisioningRetryDelayMs(attempts: number): number {
  return Math.min(
    PROVISIONING_BASE_RETRY_MS * 2 ** Math.max(0, attempts - 1),
    PROVISIONING_MAX_RETRY_MS,
  );
}
