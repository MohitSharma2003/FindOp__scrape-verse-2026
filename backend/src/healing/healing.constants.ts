export const MAX_HEALING_ATTEMPTS = 2;

export const HEALABLE_REASONS = new Set([
  "zero_records",
  "high_validation_failure_rate",
  "record_count_drop",
  "mostly_invalid_records",
  "scrape_execution_failed",
]);
