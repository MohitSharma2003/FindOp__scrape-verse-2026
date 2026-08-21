import assert from "node:assert/strict";
import test from "node:test";

import { diagnoseFailure } from "./failure-diagnoser.js";
import { MAX_HEALING_ATTEMPTS } from "./healing.constants.js";
import {
  healSource,
  HealingNotEligibleError,
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

function createHealSourceHarness(opts: {
  recentRuns: any[];
  collectorId?: string | null;
  verificationHealthy?: boolean;
}) {
  const sourceId = "source-heal";
  const source: any = {
    collectorId: "collector-test",
    url: "https://example.com",
    lastFailureReason: "scrape_execution_failed",
  };
  if (opts.collectorId !== undefined) source.collectorId = opts.collectorId;
  const sourceState: any = {};
  const calls = { repairs: 0, scrapes: 0, creates: 0 };

  const dependencies = {
    getSourceById: async () => source,
    findScrapeRunById: async (_id: string) => {
      if (_id === "diag-run-1") {
        return {
          _id: { toString: () => "diag-run-1" },
          sourceId,
          healthStatus: "failed",
          healthReasons: ["scrape_execution_failed"],
          healingAttempts: 0,
          healingHistory: [],
        };
      }
      return opts.recentRuns.find((r: any) => r._id.toString() === _id) ?? null;
    },
    findRecentScrapeRunsBySource: async () => opts.recentRuns,
    findHealingRunsBySource: async () => [],
    createScrapeRun: async (input: any) => {
      calls.creates += 1;
      return {
        _id: { toString: () => "diag-run-1" },
        ...input,
      };
    },
    updateScrapeRunHealing: async (_id: string, update: any) => {
      return { _id, ...update };
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
      const healthy = opts.verificationHealthy !== false;
      const health = healthy
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
      const run = {
        _id: { toString: () => "verify-run" },
        sourceId,
        healthStatus: healthy ? "healthy" : "failed",
        healthReasons: [],
        healingAttempts: 0,
      };
      if (!healthy) {
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

  return { sourceId, sourceState, calls, dependencies };
}

test("healSource finds eligible failed run and heals it", async () => {
  const eligibleRun = {
    _id: { toString: () => "run-eligible" },
    sourceId: "source-heal",
    healthStatus: "failed",
    healthReasons: ["scrape_execution_failed"],
    healingAttempts: 0,
    healingStatus: null,
  };

  const harness = createHealSourceHarness({
    recentRuns: [eligibleRun],
    verificationHealthy: true,
  });

  const result = await healSource(harness.sourceId, {
    dependencies: harness.dependencies,
  });

  assert.equal(result.status, "recovered");
  assert.equal(result.attempts, 1);
  assert.equal(harness.calls.repairs, 1);
});

test("healSource skips escalated runs and picks eligible one", async () => {
  const escalatedRun = {
    _id: { toString: () => "run-esc" },
    sourceId: "source-heal",
    healthStatus: "failed",
    healthReasons: ["scrape_execution_failed"],
    healingAttempts: 2,
    healingStatus: "escalated",
  };
  const eligibleRun = {
    _id: { toString: () => "run-ok" },
    sourceId: "source-heal",
    healthStatus: "failed",
    healthReasons: ["scrape_execution_failed"],
    healingAttempts: 0,
    healingStatus: null,
  };

  const harness = createHealSourceHarness({
    recentRuns: [escalatedRun, eligibleRun],
    verificationHealthy: true,
  });

  const result = await healSource(harness.sourceId, {
    dependencies: harness.dependencies,
  });

  assert.equal(result.status, "recovered");
  assert.equal(harness.calls.repairs, 1);
});

test("healSource creates diagnostic run when no eligible failed run exists", async () => {
  const harness = createHealSourceHarness({
    recentRuns: [],
    verificationHealthy: true,
  });

  const result = await healSource(harness.sourceId, {
    dependencies: harness.dependencies,
  });

  assert.equal(harness.calls.creates, 1);
  assert.equal(result.status, "recovered");
  assert.equal(harness.calls.repairs, 1);
});

test("healSource throws when source has no collectorId", async () => {
  const harness = createHealSourceHarness({
    recentRuns: [],
    collectorId: null,
  });

  await assert.rejects(
    () => healSource(harness.sourceId, { dependencies: harness.dependencies }),
    (err: any) => {
      assert.ok(err.message.includes("no Bright Data collector"));
      return true;
    },
  );
});
