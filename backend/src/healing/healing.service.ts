import { env } from "../config/env.js";
import { BrightDataHealingClient } from "../integrations/brightdata/brightdata.healing.client.js";
import {
  SourceScrapeFailedError,
  scrapeSource,
} from "../modules/sources/source-scrape.service.js";
import {
  createScrapeRun,
  findScrapeRunById,
  findHealingRunsBySource,
  findRecentScrapeRunsBySource,
  updateScrapeRunHealing,
} from "../modules/scrape-runs/scrape-run.repository.js";
import {
  getSourceById,
  updateSourceHealingService,
} from "../modules/sources/source.service.js";
import {
  MAX_HEALING_ATTEMPTS,
  HEALABLE_REASONS,
} from "./healing.constants.js";
import { diagnoseFailure } from "./failure-diagnoser.js";
import {
  canAttemptHealing,
  finalHealingStatus,
  verifyRepair,
} from "./repair-verifier.js";
import type {
  FailureDiagnosis,
  HealingResult,
  HealingStatus,
} from "./healing.types.js";

interface HealingSource {
  kind?: string | null;
  collectorId?: string | null;
  url?: string;
  enabled?: boolean;
  lastFailureReason?: string | null;
}

interface HealingRun {
  _id: { toString(): string };
  sourceId: unknown;
  healthStatus?: string | null;
  healthReasons?: string[];
  healingAttempts?: number;
  healingStatus?: string | null;
}

interface HealingDependencies {
  getSourceById: (id: string) => Promise<HealingSource | null>;
  findScrapeRunById: (id: string) => Promise<HealingRun | null>;
  updateScrapeRunHealing: typeof updateScrapeRunHealing;
  updateSourceHealing: typeof updateSourceHealingService;
  findHealingRunsBySource: typeof findHealingRunsBySource;
  findRecentScrapeRunsBySource: typeof findRecentScrapeRunsBySource;
  createScrapeRun: typeof createScrapeRun;
  createHealingClient: () => Pick<BrightDataHealingClient, "heal">;
  scrapeSource: typeof scrapeSource;
}

const productionDependencies: HealingDependencies = {
  getSourceById,
  findScrapeRunById,
  updateScrapeRunHealing,
  updateSourceHealing: updateSourceHealingService,
  findHealingRunsBySource,
  findRecentScrapeRunsBySource,
  createScrapeRun,
  createHealingClient: () => new BrightDataHealingClient({
    apiToken: env.BRIGHT_DATA_API_TOKEN,
    timeoutMs: env.BRIGHT_DATA_HEALING_TIMEOUT_MS,
    pollIntervalMs: env.BRIGHT_DATA_POLL_INTERVAL_MS,
  }),
  scrapeSource,
};

export class HealingSourceNotFoundError extends Error {}
export class HealingScrapeRunNotFoundError extends Error {}
export class HealingOwnershipError extends Error {}
export class HealingNotEligibleError extends Error {}
export class HealingAlreadyInProgressError extends Error {}
export class HealingAlreadyRecoveredError extends Error {}

const activeHealingRuns = new Set<string>();

export async function startHealing(
  sourceId: string,
  scrapeRunId: string,
  options: { allowAutomaticHealing?: boolean; dependencies?: Partial<HealingDependencies> } = {},
): Promise<HealingResult> {
  const key = `${sourceId}:${scrapeRunId}`;
  if (activeHealingRuns.has(key)) {
    throw new HealingAlreadyInProgressError("Healing is already in progress");
  }
  activeHealingRuns.add(key);
  try {
    return await startHealingInternal(sourceId, scrapeRunId, options);
  } finally {
    activeHealingRuns.delete(key);
  }
}

async function startHealingInternal(
  sourceId: string,
  scrapeRunId: string,
  options: { allowAutomaticHealing?: boolean; dependencies?: Partial<HealingDependencies> } = {},
): Promise<HealingResult> {
  const dependencies = { ...productionDependencies, ...options.dependencies };
  const source = await dependencies.getSourceById(sourceId);

  if (!source) {
    throw new HealingSourceNotFoundError("Source not found");
  }

  const failedRun = await dependencies.findScrapeRunById(scrapeRunId);

  if (!failedRun) {
    throw new HealingScrapeRunNotFoundError("Scrape run not found");
  }

  if (!scrapeRunBelongsToSource(sourceId, String(failedRun.sourceId))) {
    throw new HealingOwnershipError("Scrape run does not belong to source");
  }

  const reasons = failedRun.healthReasons ?? [];
  const isEligible = isEligibleHealingRun(failedRun.healthStatus ?? undefined, reasons);

  if (!isEligible) {
    throw new HealingNotEligibleError("Scrape run has no healable failure");
  }

  if (!source.collectorId && !isDiscoverySource(source)) {
    throw new HealingNotEligibleError("Source has no Bright Data collector configured");
  }

  if (["pending", "diagnosing", "repairing", "verifying"].includes(failedRun.healingStatus ?? "")) {
    throw new HealingAlreadyInProgressError("Healing is already in progress");
  }

  if (failedRun.healingStatus === "recovered") {
    throw new HealingAlreadyRecoveredError("Scrape run has already recovered");
  }

  const diagnosis = diagnoseFailure(reasons);
  console.log("Healing started", { sourceId, scrapeRunId, category: diagnosis.category });
  let attempts = failedRun.healingAttempts ?? 0;

  await updateHealingState(dependencies, sourceId, scrapeRunId, "diagnosing", {
    healingAttempts: attempts,
    repairStrategy: diagnosis.recommendedAction,
  });

  if (!canAttemptHealing(attempts, MAX_HEALING_ATTEMPTS)) {
    const reason = "Maximum healing attempts already reached";
    const completedAt = new Date();
    const scrapeRun = await dependencies.updateScrapeRunHealing(scrapeRunId, {
      healingStatus: "escalated",
      healingAttempts: attempts,
      lastHealingCompletedAt: completedAt,
      lastHealingError: reason,
    });
    await dependencies.updateSourceHealing(sourceId, {
      healingStatus: "escalated",
      healingAttempts: attempts,
      lastHealingCompletedAt: completedAt,
      lastHealingError: reason,
    });

    return {
      status: "escalated",
      attempts,
      diagnosis,
      scrapeRun,
      error: reason,
    };
  }

  while (canAttemptHealing(attempts, MAX_HEALING_ATTEMPTS)) {
    attempts += 1;
    const startedAt = new Date();

    await updateHealingState(dependencies, sourceId, scrapeRunId, "repairing", {
      healingAttempts: attempts,
      lastHealingStartedAt: startedAt,
      repairStrategy: diagnosis.recommendedAction,
    });

    const client = dependencies.createHealingClient();

    let repairSucceeded = false;
    let repairError: string | undefined;
    let pendingApproval = false;
    let repairProductionState: "not_verified" | "verified" | undefined;

    if (isDiscoverySource(source)) {
      // SERP-discovery sources have no collector to trigger: the repair step
      // IS the retry - a fresh discovery pass selects new candidate URLs.
      repairSucceeded = true;
      console.log("Healing repair (discovery re-scrape)", { sourceId, scrapeRunId, attempts });
    } else {
      try {
        const repair = await client.heal(
          source.collectorId as string,
          diagnosis.recommendedAction,
          source.url ? [{ url: source.url }] : [],
        );
        repairSucceeded = repair.success;
        repairError = repair.error;
        pendingApproval = repair.pendingApproval;
        repairProductionState = repair.productionState;
      } catch (error: unknown) {
        repairError = error instanceof Error ? error.message : "Healing failed";
      }
    }

    if (!repairSucceeded) {
      const completedAt = new Date();
      const status = pendingApproval ? "pending_approval" : "failed";
      const finalStatus = pendingApproval || attempts >= MAX_HEALING_ATTEMPTS
        ? "escalated"
        : "repairing";
      const reason = repairError ?? "Bright Data repair did not succeed";

      const scrapeRun = await finishAttempt(
        dependencies,
        sourceId,
        scrapeRunId,
        attempts,
        startedAt,
        completedAt,
        status,
        reason,
        finalStatus,
      );

      if (finalStatus === "escalated") {
        console.error("Healing escalated", { sourceId, scrapeRunId, attempts, reason });
        return {
          status: "escalated",
          attempts,
          diagnosis,
          scrapeRun,
          error: reason,
        };
      }

      continue;
    }

    await updateHealingState(dependencies, sourceId, scrapeRunId, "verifying", {
      healingAttempts: attempts,
    });

    let verificationRun: unknown;
    let verificationHealth;

    try {
      const verification = await dependencies.scrapeSource(sourceId, {
        allowAutomaticHealing: false,
        verificationRun: true,
      });
      verificationRun = verification.scrapeRun;
      verificationHealth = verification.health;
    } catch (error: unknown) {
      if (error instanceof SourceScrapeFailedError) {
        verificationRun = error.scrapeRun;
        verificationHealth = error.health;
      }
    }

    const verification = verifyRepair({
      repairSucceeded: true,
      scrapeCompleted: Boolean(verificationRun),
      health: verificationHealth,
    });
    const completedAt = new Date();
    const finalStatus = finalHealingStatus(
      verification.recovered,
      attempts,
      MAX_HEALING_ATTEMPTS,
    );
    const scrapeRun = await finishAttempt(
      dependencies,
      sourceId,
      scrapeRunId,
      attempts,
      startedAt,
      completedAt,
      verification.recovered ? "recovered" : "verification_failed",
      verification.recovered ? undefined : verification.reason,
      finalStatus,
      verification.recovered ? verification.reason : undefined,
    );

    if (verification.recovered) {
      console.log("Healing completed", { sourceId, scrapeRunId, status: "recovered", attempts });
      return {
        status: "recovered",
        attempts,
        diagnosis,
        scrapeRun,
        verificationRun,
        recoveryReason: verification.reason,
      };
    }

    if (finalStatus === "escalated") {
      console.error("Healing escalated", { sourceId, scrapeRunId, attempts, reason: verification.reason });
      return {
        status: "escalated",
        attempts,
        diagnosis,
        scrapeRun,
        verificationRun,
        error: verification.reason,
      };
    }
  }

  throw new Error("Healing attempt limit reached without a final state");
}

async function updateHealingState(
  dependencies: HealingDependencies,
  sourceId: string,
  scrapeRunId: string,
  status: HealingStatus,
  data: {
    healingAttempts?: number;
    lastHealingStartedAt?: Date;
    repairStrategy?: string;
  },
) {
  await dependencies.updateScrapeRunHealing(scrapeRunId, {
    healingStatus: status,
    ...data,
  });
  await dependencies.updateSourceHealing(sourceId, {
    healingStatus: status,
    ...data,
  });
}

async function finishAttempt(
  dependencies: HealingDependencies,
  sourceId: string,
  scrapeRunId: string,
  attempt: number,
  startedAt: Date,
  completedAt: Date,
  attemptStatus: string,
  error: string | undefined,
  finalStatus: HealingStatus,
  recoveryReason?: string,
) {
  const scrapeRun = await dependencies.updateScrapeRunHealing(scrapeRunId, {
    healingStatus: finalStatus,
    healingAttempts: attempt,
    lastHealingCompletedAt: completedAt,
    ...(error ? { lastHealingError: error } : {}),
    ...(recoveryReason ? { recoveryReason } : {}),
    historyEntry: {
      attempt,
      startedAt,
      completedAt,
      status: attemptStatus,
      ...(error ? { error } : {}),
    },
  });

  await dependencies.updateSourceHealing(sourceId, {
    healingStatus: finalStatus,
    healingAttempts: attempt,
    lastHealingCompletedAt: completedAt,
    ...(error ? { lastHealingError: error } : {}),
    ...(recoveryReason ? { recoveryReason } : {}),
  });

  return scrapeRun;
}

export function isHealableFailure(reasons: string[]): boolean {
  return reasons.some((reason) => HEALABLE_REASONS.has(reason));
}

function isDiscoverySource(source: HealingSource): boolean {
  return source.kind === "serp_discovery";
}

export function scrapeRunBelongsToSource(
  sourceId: string,
  runSourceId: string,
): boolean {
  return sourceId === runSourceId;
}

export function isEligibleHealingRun(
  healthStatus: string | undefined,
  reasons: string[],
): boolean {
  return healthStatus === "failed" && isHealableFailure(reasons);
}

export async function healSource(
  sourceId: string,
  options: { allowAutomaticHealing?: boolean; dependencies?: Partial<HealingDependencies> } = {},
): Promise<HealingResult> {
  const dependencies = { ...productionDependencies, ...options.dependencies };
  const source = await dependencies.getSourceById(sourceId);
  if (!source) {
    throw new HealingSourceNotFoundError("Source not found");
  }
  if (!source.collectorId && !isDiscoverySource(source)) {
    throw new HealingNotEligibleError("Source has no Bright Data collector configured");
  }

  const recentRuns = await dependencies.findRecentScrapeRunsBySource(sourceId, 10);
  const failedRun = recentRuns.find(
    (run) =>
      run.healthStatus === "failed" &&
      isHealableFailure(run.healthReasons ?? []) &&
      canAttemptHealing(run.healingAttempts ?? 0, MAX_HEALING_ATTEMPTS) &&
      !["recovered", "escalated"].includes(run.healingStatus ?? ""),
  );

  if (!failedRun) {
    const run = await createDiagnosticScrapeRun(sourceId, source, dependencies);
    return startHealing(sourceId, run._id.toString(), options);
  }

  return startHealing(sourceId, failedRun._id.toString(), options);
}

async function createDiagnosticScrapeRun(
  sourceId: string,
  source: HealingSource,
  dependencies: HealingDependencies,
): Promise<{ _id: { toString(): string } }> {
  const reasons: string[] = [];
  if (!source.collectorId) reasons.push("scrape_execution_failed");
  const health = diagnoseFailure(reasons.length > 0 ? reasons : ["scrape_execution_failed"]);

  const scrapeRun = await dependencies.createScrapeRun({
    sourceId,
    startedAt: new Date(),
    completedAt: new Date(),
    status: "failed",
    recordsFound: 0,
    recordsValid: 0,
    recordsRejected: 0,
    duplicatesFound: 0,
    recordsPersisted: 0,
    validationErrors: [],
    error: source.lastFailureReason ?? "Source is unhealthy - diagnostic healing run",
    healthReasons: health.evidence,
    healingAttempts: 0,
    healingHistory: [],
    healthStatus: "failed",
    healthSeverity: health.severity,
    healthMetrics: { currentRecords: 0, validationFailureRate: 0 },
  });

  await dependencies.updateSourceHealing(sourceId, {
    healingStatus: "pending",
    healingAttempts: 0,
  });

  return scrapeRun;
}

export async function getHealingHistory(sourceId: string, limit = 10) {
  const source = await productionDependencies.getSourceById(sourceId);
  if (!source) {
    throw new HealingSourceNotFoundError("Source not found");
  }
  return productionDependencies.findHealingRunsBySource(sourceId, limit);
}
