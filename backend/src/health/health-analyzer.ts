import { HEALTH_RULES } from "./health.constants.js";
import type {
  HealthAnalysis,
  HealthAnalysisInput,
  HealthSeverity,
  HealthStatus,
} from "./health.types.js";

export function analyzeHealth(input: HealthAnalysisInput): HealthAnalysis {
  const reasons: string[] = [];
  let status: HealthStatus = "healthy";
  let severity: HealthSeverity = "info";
  const validationFailureRate = input.recordsFound === 0
    ? 0
    : input.recordsRejected / input.recordsFound;
  const baselineRecords = calculateBaseline(input.historicalSuccessfulRuns ?? []);
  const recordCountRatio = baselineRecords === undefined || baselineRecords === 0
    ? undefined
    : input.recordsFound / baselineRecords;

  const metrics = {
    baselineRecords,
    currentRecords: input.recordsFound,
    validationFailureRate,
    recordCountRatio,
  };

  if (input.executionFailed) {
    reasons.push("scrape_execution_failed");
    status = "failed";
    severity = "critical";
  }

  if (input.zeroRecordsFailure && input.recordsFound === 0) {
    reasons.push("zero_records");
    status = "failed";
    severity = "critical";
  }

  if (validationFailureRate > HEALTH_RULES.VALIDATION_FAILURE_RATE) {
    reasons.push("high_validation_failure_rate");
    if (validationFailureRate > 0.5) {
      status = "failed";
      severity = "critical";
    } else {
      status = maxStatus(status, "degraded");
      severity = maxSeverity(severity, "warning");
    }
  }

  if (
    input.recordsFound > 0 &&
    input.recordsValid / input.recordsFound < HEALTH_RULES.MOSTLY_INVALID_VALID_RATE
  ) {
    reasons.push("mostly_invalid_records");
    status = "failed";
    severity = "critical";
  }

  if (
    recordCountRatio !== undefined &&
    (input.historicalSuccessfulRuns?.length ?? 0) >= HEALTH_RULES.MIN_BASELINE_RUNS &&
    recordCountRatio < HEALTH_RULES.RECORD_COUNT_DROP_RATIO
  ) {
    reasons.push("record_count_drop");
    status = maxStatus(status, "degraded");
    severity = maxSeverity(severity, "warning");
  }

  return { status, severity, reasons, metrics };
}

export function calculateBaseline(
  runs: { recordsFound: number }[],
): number | undefined {
  if (runs.length < HEALTH_RULES.MIN_BASELINE_RUNS) {
    return undefined;
  }

  const values = runs
    .slice(0, HEALTH_RULES.BASELINE_RUN_COUNT)
    .map((run) => run.recordsFound)
    .sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);

  const middleValue = values[middle];

  if (middleValue === undefined) {
    return undefined;
  }

  if (values.length % 2 !== 0) {
    return middleValue;
  }

  const lowerMiddleValue = values[middle - 1];

  return lowerMiddleValue === undefined
    ? middleValue
    : (lowerMiddleValue + middleValue) / 2;
}

function maxStatus(current: HealthStatus, next: HealthStatus): HealthStatus {
  const rank: Record<HealthStatus, number> = {
    healthy: 0,
    degraded: 1,
    failed: 2,
  };

  return rank[next] > rank[current] ? next : current;
}

function maxSeverity(
  current: HealthSeverity,
  next: HealthSeverity,
): HealthSeverity {
  const rank: Record<HealthSeverity, number> = {
    info: 0,
    warning: 1,
    critical: 2,
  };

  return rank[next] > rank[current] ? next : current;
}
