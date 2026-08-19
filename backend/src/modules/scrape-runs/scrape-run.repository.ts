import { ScrapeRun } from "./scrape-run.model.js";
import type { CreateScrapeRunInput } from "./scrape-run.schema.js";
import type { HealthAnalysis } from "../../health/health.types.js";
import type { HealingHistoryEntry, HealingStatus } from "../../healing/healing.types.js";

export async function findAllScrapeRuns() {
  return ScrapeRun.find().sort({ startedAt: -1 });
}

export async function findScrapeRunById(id: string) {
  return ScrapeRun.findById(id);
}

export async function findRecentScrapeRunsBySource(
  sourceId: string,
  limit: number,
) {
  return ScrapeRun.find({ sourceId }).sort({ startedAt: -1 }).limit(limit);
}

export async function findRecentSuccessfulScrapeRunsBySource(
  sourceId: string,
  limit: number,
) {
  return ScrapeRun.find({ sourceId, status: "success" })
    .sort({ startedAt: -1 })
    .limit(limit);
}

export async function findHealingRunsBySource(sourceId: string, limit: number) {
  return ScrapeRun.find({ sourceId, healingAttempts: { $gt: 0 } })
    .sort({ lastHealingStartedAt: -1 })
    .limit(limit);
}

export async function createScrapeRun(data: CreateScrapeRunInput) {
  return ScrapeRun.create(data);
}

export async function updateScrapeRunHealing(
  id: string,
  data: {
    healingStatus: HealingStatus;
    healingAttempts?: number;
    lastHealingStartedAt?: Date;
    lastHealingCompletedAt?: Date;
    lastHealingError?: string;
    repairStrategy?: string;
    recoveryReason?: string;
    historyEntry?: HealingHistoryEntry;
  },
) {
  const { historyEntry, ...fields } = data;
  const update: {
    $set: typeof fields;
    $push?: { healingHistory: HealingHistoryEntry };
  } = { $set: fields };

  if (historyEntry) {
    update.$push = { healingHistory: historyEntry };
  }

  const updateWithCleanup = data.healingStatus === "recovered"
    ? { ...update, $unset: { lastHealingError: 1 } }
    : update;

  return ScrapeRun.findByIdAndUpdate(id, updateWithCleanup, { new: true });
}

export async function updateScrapeRun(
  id: string,
  data: {
    completedAt: Date;
    status: "success" | "partial" | "failed";
    recordsFound?: number;
    recordsValid?: number;
    recordsRejected?: number;
    duplicatesFound?: number;
    recordsPersisted?: number;
    validationErrors?: string[];
    error?: string;
    health?: HealthAnalysis;
  },
) {
  const { health, ...runData } = data;
  const update = health
    ? {
        ...runData,
        healthStatus: health.status,
        healthSeverity: health.severity,
        healthReasons: health.reasons,
        healthMetrics: health.metrics,
      }
    : runData;

  return ScrapeRun.findByIdAndUpdate(id, { $set: update }, { new: true });
}
