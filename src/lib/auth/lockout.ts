export const MAX_PIN_ATTEMPTS = 5;
export const LOCK_DURATION_SECONDS = 15 * 60;

/**
 * attemptNumber is failed_pin_attempts right after it was atomically incremented for this attempt.
 * Concurrent attempts beyond the limit are rejected without checking the PIN.
 */
export function mayVerify(attemptNumber: number): boolean {
  return attemptNumber <= MAX_PIN_ATTEMPTS;
}

export function shouldLockAfterFailure(attemptNumber: number): boolean {
  return attemptNumber >= MAX_PIN_ATTEMPTS;
}
