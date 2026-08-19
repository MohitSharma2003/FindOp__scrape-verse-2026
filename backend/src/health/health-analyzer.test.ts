import assert from "node:assert/strict";
import test from "node:test";

import { analyzeHealth } from "./health-analyzer.js";

test("normal scrape is healthy", () => {
  const result = analyzeHealth({
    recordsFound: 28,
    recordsValid: 28,
    recordsRejected: 0,
    historicalSuccessfulRuns: [{ recordsFound: 28 }, { recordsFound: 29 }],
  });

  assert.equal(result.status, "healthy");
  assert.equal(result.severity, "info");
  assert.deepEqual(result.reasons, []);
  assert.equal(result.metrics.baselineRecords, 28.5);
});

test("zero records are failed for a configured source", () => {
  const result = analyzeHealth({
    recordsFound: 0,
    recordsValid: 0,
    recordsRejected: 0,
    zeroRecordsFailure: true,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.severity, "critical");
  assert.deepEqual(result.reasons, ["zero_records"]);
});

test("high validation failure rate is degraded", () => {
  const result = analyzeHealth({
    recordsFound: 10,
    recordsValid: 6,
    recordsRejected: 4,
  });

  assert.equal(result.status, "degraded");
  assert.equal(result.severity, "warning");
  assert.deepEqual(result.reasons, ["high_validation_failure_rate"]);
});

test("record-count drop is detected with enough baseline history", () => {
  const result = analyzeHealth({
    recordsFound: 40,
    recordsValid: 40,
    recordsRejected: 0,
    historicalSuccessfulRuns: [{ recordsFound: 100 }, { recordsFound: 100 }],
  });

  assert.equal(result.status, "degraded");
  assert.deepEqual(result.reasons, ["record_count_drop"]);
  assert.equal(result.metrics.recordCountRatio, 0.4);
});

test("record-count anomaly is skipped with insufficient history", () => {
  const result = analyzeHealth({
    recordsFound: 10,
    recordsValid: 10,
    recordsRejected: 0,
    historicalSuccessfulRuns: [{ recordsFound: 100 }],
  });

  assert.equal(result.status, "healthy");
  assert.deepEqual(result.reasons, []);
});

test("mostly invalid output fails", () => {
  const result = analyzeHealth({
    recordsFound: 20,
    recordsValid: 1,
    recordsRejected: 19,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.severity, "critical");
  assert.ok(result.reasons.includes("mostly_invalid_records"));
  assert.ok(result.reasons.includes("high_validation_failure_rate"));
});

test("Bright Data execution failure is critical", () => {
  const result = analyzeHealth({
    recordsFound: 0,
    recordsValid: 0,
    recordsRejected: 0,
    executionFailed: true,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.severity, "critical");
  assert.deepEqual(result.reasons, ["scrape_execution_failed"]);
});
