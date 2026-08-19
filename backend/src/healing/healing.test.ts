import assert from "node:assert/strict";
import test from "node:test";

import { diagnoseFailure } from "./failure-diagnoser.js";
import { MAX_HEALING_ATTEMPTS } from "./healing.constants.js";
import {
  isEligibleHealingRun,
  scrapeRunBelongsToSource,
  startHealing,
} from "./healing.service.js";
import { SourceScrapeFailedError } from "../modules/sources/source-scrape.service.js";
import {
  canAttemptHealing,
  finalHealingStatus,
  verifyRepair,
} from "./repair-verifier.js";

test("zero records diagnoses as empty output", () => {
  const diagnosis = diagnoseFailure(["zero_records"]);

  assert.equal(diagnosis.category, "empty_output");
  assert.deepEqual(diagnosis.evidence, ["zero_records"]);
});

test("record count drop diagnoses as extraction regression", () => {
  const diagnosis = diagnoseFailure(["record_count_drop"]);

  assert.equal(diagnosis.category, "extraction_regression");
});

test("invalid LLM output falls back to deterministic diagnosis", () => {
  const diagnosis = diagnoseFailure(["mostly_invalid_records"], {
    diagnosis: "",
    repairInstruction: 123,
    confidence: "high",
  });

  assert.equal(diagnosis.category, "extraction_quality");
  assert.equal(diagnosis.diagnosis, undefined);
  assert.match(diagnosis.recommendedAction, /extraction rules/);
});

test("healing attempts are bounded and escalate at the limit", () => {
  assert.equal(canAttemptHealing(0, MAX_HEALING_ATTEMPTS), true);
  assert.equal(canAttemptHealing(MAX_HEALING_ATTEMPTS, MAX_HEALING_ATTEMPTS), false);
  assert.equal(
    finalHealingStatus(false, MAX_HEALING_ATTEMPTS, MAX_HEALING_ATTEMPTS),
    "escalated",
  );
});

test("successful repair requires healthy verification", () => {
  const result = verifyRepair({
    repairSucceeded: true,
    scrapeCompleted: true,
    health: {
      status: "healthy",
      severity: "info",
      reasons: [],
      metrics: {
        currentRecords: 28,
        validationFailureRate: 0,
      },
    },
  });

  assert.equal(result.recovered, true);
});

test("failed verification does not recover", () => {
  const result = verifyRepair({
    repairSucceeded: true,
    scrapeCompleted: true,
    health: {
      status: "degraded",
      severity: "warning",
      reasons: ["record_count_drop"],
      metrics: {
        currentRecords: 4,
        validationFailureRate: 0,
      },
    },
  });

  assert.equal(result.recovered, false);
});

test("healthy scrape cannot start healing", () => {
  assert.equal(isEligibleHealingRun("healthy", ["zero_records"]), false);
});

test("healing validates source and scrape-run ownership", () => {
  assert.equal(scrapeRunBelongsToSource("source-a", "source-a"), true);
  assert.equal(scrapeRunBelongsToSource("source-a", "source-b"), false);
});

function createHealingHarness(verificationHealthy: boolean) {
  const sourceId = "source-1";
  const runId = "run-1";
  const source = { collectorId: "collector-test" };
  const run: any = {
    _id: { toString: () => runId },
    sourceId: sourceId,
    healthStatus: "failed",
    healthReasons: ["record_count_drop"],
    healingAttempts: 0,
    healingHistory: [],
  };
  const sourceState: any = {};
  const calls = { repairs: 0, scrapes: 0 };

  const dependencies = {
    getSourceById: async () => source,
    findScrapeRunById: async () => run,
    updateScrapeRunHealing: async (_id: string, update: any) => {
      Object.assign(run, update);
      if (update.historyEntry) run.healingHistory.push(update.historyEntry);
      return run;
    },
    updateSourceHealing: async (_id: string, update: any) => {
      Object.assign(sourceState, update);
      return sourceState;
    },
    createHealingClient: () => ({
      heal: async () => {
        calls.repairs += 1;
        return { success: true, pendingApproval: false, status: "completed" };
      },
    }),
    scrapeSource: async () => {
      calls.scrapes += 1;
      const health = verificationHealthy
        ? {
            status: "healthy" as const,
            severity: "info" as const,
            reasons: [],
            metrics: { currentRecords: 10, validationFailureRate: 0 },
          }
        : {
            status: "failed" as const,
            severity: "critical" as const,
            reasons: ["record_count_drop"],
            metrics: { currentRecords: 1, validationFailureRate: 0 },
          };
      if (!verificationHealthy) {
        throw new SourceScrapeFailedError("verification failed", run, health);
      }
      return {
        scrapeRun: run,
        health,
        snapshotId: "mock-snapshot",
        ingestion: {
          recordsFound: 10,
          recordsValid: 10,
          recordsRejected: 0,
          duplicatesFound: 0,
          recordsPersisted: 10,
          validationErrors: [],
        },
      };
    },
  };

  return { sourceId, runId, run, sourceState, calls, dependencies };
}

test("complete healing orchestration recovers with isolated mocked dependencies", async () => {
  const harness = createHealingHarness(true);

  const result = await startHealing(
    harness.sourceId,
    harness.runId,
    { dependencies: harness.dependencies },
  );

  assert.equal(result.status, "recovered");
  assert.equal(result.attempts, 1);
  assert.equal(harness.calls.repairs, 1);
  assert.equal(harness.calls.scrapes, 1);
  assert.equal(harness.run.healingStatus, "recovered");
  assert.equal(harness.sourceState.healingStatus, "recovered");
});

test("failed verification escalates after the maximum healing attempts", async () => {
  const harness = createHealingHarness(false);

  const result = await startHealing(
    harness.sourceId,
    harness.runId,
    { dependencies: harness.dependencies },
  );

  assert.equal(result.status, "escalated");
  assert.equal(result.attempts, MAX_HEALING_ATTEMPTS);
  assert.equal(harness.calls.repairs, MAX_HEALING_ATTEMPTS);
  assert.equal(harness.calls.scrapes, MAX_HEALING_ATTEMPTS);
  assert.equal(harness.run.healingStatus, "escalated");
  assert.equal(harness.run.healingHistory.length, MAX_HEALING_ATTEMPTS);
});
