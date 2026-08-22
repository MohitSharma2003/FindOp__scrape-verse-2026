import { Source } from "./source.model.js";
import type { CreateSourceInput, UpdateSourceInput } from "./source.schema.js";
import type { HealthAnalysis } from "../../health/health.types.js";
import type { HealingStatus } from "../../healing/healing.types.js";

export async function findAllSources() {
  return Source.find().sort({ createdAt: -1 });
}

export async function findSourceById(id: string) {
  return Source.findById(id);
}

export async function findSourceByUrl(url: string) {
  return Source.findOne({ url });
}

export async function findSourceByDomain(domain: string) {
  const escaped = domain.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Source.findOne({
    $or: [
      { domain: domain.toLowerCase() },
      { url: { $regex: `^https?://(?:www\\.)?${escaped}(?:/|$)`, $options: "i" } },
    ],
  });
}

export async function createSource(data: CreateSourceInput & { domain?: string }) {
  return Source.create(data);
}

export async function findSourceByCollectorId(collectorId: string, excludeId?: string) {
  return Source.findOne({ collectorId, ...(excludeId ? { _id: { $ne: excludeId } } : {}) });
}

export async function updateSource(id: string, data: UpdateSourceInput & { domain?: string }) {
  return Source.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });
}

export async function setSourceEnabled(id: string, enabled: boolean) {
  return Source.findByIdAndUpdate(id, { $set: { enabled } }, { new: true, runValidators: true });
}

export async function markSourceProvisioningFailed(id: string, reason: string) {
  return recordProvisioningFailure(id, reason, { retryable: true });
}

export type ProvisioningStatus = "pending" | "provisioning" | "verifying" | "ready" | "failed";

export async function markProvisioningStatus(
  id: string,
  patch: {
    provisioningStatus: ProvisioningStatus;
    provisioningError?: string;
    nextProvisioningRetryAt?: Date | null;
    lastProvisionedCollectorId?: string;
  },
) {
  return Source.findByIdAndUpdate(
    id,
    {
      $set: {
        provisioningStatus: patch.provisioningStatus,
        ...(patch.provisioningError !== undefined ? { provisioningError: patch.provisioningError } : {}),
        ...(patch.nextProvisioningRetryAt !== undefined ? { nextProvisioningRetryAt: patch.nextProvisioningRetryAt } : {}),
        ...(patch.lastProvisionedCollectorId ? { lastProvisionedCollectorId: patch.lastProvisionedCollectorId } : {}),
      },
    },
    { new: true },
  );
}

export async function recordProvisioningFailure(
  id: string,
  reason: string,
  options: { retryable: boolean; nextRetryAt?: Date },
) {
  return Source.findByIdAndUpdate(
    id,
    {
      $set: {
        provisioningStatus: "failed",
        provisioningError: reason,
        enabled: false,
        healthStatus: "unhealthy",
        lastFailureAt: new Date(),
        lastFailureReason: reason,
        ...(options.nextRetryAt ? { nextProvisioningRetryAt: options.nextRetryAt } : { nextProvisioningRetryAt: null }),
      },
      $inc: { provisioningAttempts: 1 },
    },
    { new: true },
  );
}

export async function markSourceReady(id: string) {
  return Source.findByIdAndUpdate(
    id,
    {
      $set: { provisioningStatus: "ready", enabled: true },
      $unset: { provisioningError: 1, nextProvisioningRetryAt: 1 },
    },
    { new: true },
  );
}

export async function markCollectorUnavailable(id: string, reason: string, staleCollectorId?: string) {
  return Source.findByIdAndUpdate(
    id,
    {
      $set: {
        enabled: false,
        healthStatus: "unhealthy",
        lastFailureAt: new Date(),
        lastFailureReason: reason,
        provisioningStatus: "failed",
        provisioningError: reason,
        ...(staleCollectorId ? { lastProvisionedCollectorId: staleCollectorId } : {}),
      },
    },
    { new: true },
  );
}

export async function markSourceRunStarted(id: string, startedAt: Date) {
  return Source.findByIdAndUpdate(
    id,
    { $set: { lastRunAt: startedAt } },
    { new: true },
  );
}

export async function markSourceRunSucceeded(id: string, completedAt: Date) {
  return Source.findByIdAndUpdate(
    id,
    {
      $set: {
        healthStatus: "healthy",
        lastRunAt: completedAt,
        lastSuccessfulRunAt: completedAt,
        consecutiveFailures: 0,
      },
      $unset: { lastFailureAt: 1, lastFailureReason: 1 },
    },
    { new: true },
  );
}

export async function markSourceRunFailed(
  id: string,
  failedAt: Date,
  reason: string,
) {
  return Source.findByIdAndUpdate(
    id,
    {
      $set: {
        healthStatus: "unhealthy",
        lastRunAt: failedAt,
        lastFailureAt: failedAt,
        lastFailureReason: reason,
      },
      $inc: { consecutiveFailures: 1 },
    },
    { new: true },
  );
}

export async function markSourceRunPartial(
  id: string,
  completedAt: Date,
  reason: string,
  highRejectionRate: boolean,
) {
  return Source.findByIdAndUpdate(
    id,
    highRejectionRate
      ? {
          $set: {
            healthStatus: "unhealthy",
            lastRunAt: completedAt,
            lastFailureAt: completedAt,
            lastFailureReason: reason,
          },
          $inc: { consecutiveFailures: 1 },
        }
      : {
          $set: {
            healthStatus: "unknown",
            lastRunAt: completedAt,
            lastSuccessfulRunAt: completedAt,
            consecutiveFailures: 0,
          },
          $unset: { lastFailureAt: 1, lastFailureReason: 1 },
        },
    { new: true },
  );
}

export async function updateSourceHealth(
  id: string,
  completedAt: Date,
  analysis: HealthAnalysis,
  qualityScore?: number,
) {
  const reason = analysis.reasons.join(", ");

  if (analysis.status === "failed") {
    return Source.findByIdAndUpdate(
      id,
      {
        $set: {
          healthStatus: "unhealthy",
          lastRunAt: completedAt,
          lastFailureAt: completedAt,
          lastFailureReason: reason,
          ...(qualityScore === undefined ? {} : { qualityScore }),
        },
        $inc: { consecutiveFailures: 1 },
      },
      { new: true },
    );
  }

  return Source.findByIdAndUpdate(
    id,
    {
      $set: {
        healthStatus: analysis.status === "healthy" ? "healthy" : "unknown",
        lastRunAt: completedAt,
        lastSuccessfulRunAt: completedAt,
        consecutiveFailures: 0,
        ...(reason ? { lastFailureReason: reason } : {}),
        ...(qualityScore === undefined ? {} : { qualityScore }),
      },
      $unset: { lastFailureAt: 1 },
    },
    { new: true },
  );
}

export async function updateSourceHealing(
  id: string,
  data: {
    healingStatus: HealingStatus;
    healingAttempts?: number;
    lastHealingStartedAt?: Date;
    lastHealingCompletedAt?: Date;
    lastHealingError?: string;
    repairStrategy?: string;
    recoveryReason?: string;
    healingCount?: number;
  },
) {
  const updateData = data.healingAttempts === undefined && data.healingCount === undefined
    ? data
    : { ...data, healingCount: data.healingCount ?? data.healingAttempts };
  const update = data.healingStatus === "recovered"
    ? { $set: updateData, $unset: { lastHealingError: 1 } }
    : { $set: updateData };

  return Source.findByIdAndUpdate(id, update, { new: true });
}

// --- Phase 7A: index scheduler support ---

export async function findDueSources(now: Date, limit = 10) {
  return Source.find({
    enabled: true,
    $or: [
      { nextRunAt: { $lte: now } },
      { nextRunAt: { $exists: false } },
      { nextRunAt: null },
    ],
  })
    .sort({ nextRunAt: 1, createdAt: 1 })
    .limit(limit);
}

export async function setSourceNextRunAt(id: string, nextRunAt: Date) {
  return Source.findByIdAndUpdate(id, { $set: { nextRunAt } }, { new: true });
}
