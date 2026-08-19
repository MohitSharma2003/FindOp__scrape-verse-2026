import {
  createSource,
  findAllSources,
  findSourceById,
  findSourceByCollectorId,
  markSourceRunFailed,
  markSourceRunPartial,
  markSourceRunStarted,
  markSourceRunSucceeded,
  updateSourceHealth,
  updateSourceHealing,
  updateSource,
  setSourceEnabled,
} from "./source.repository.js";
import type { CreateSourceInput, UpdateSourceInput } from "./source.schema.js";
import type { HealthAnalysis } from "../../health/health.types.js";
import type { HealingStatus } from "../../healing/healing.types.js";

export async function getAllSources() {
  return findAllSources();
}

export async function getSourceById(id: string) {
  return findSourceById(id);
}

export async function createSourceService(data: CreateSourceInput) {
  if (data.enabled && !data.collectorId) {
    throw new SourceRegistryValidationError("Enabled sources require collectorId");
  }
  if (data.collectorId && await findSourceByCollectorId(data.collectorId)) {
    throw new DuplicateCollectorError("collectorId is already registered");
  }
  return createSource(data);
}

export async function updateSourceService(id: string, data: UpdateSourceInput) {
  const current = await findSourceById(id);
  if (!current) return null;
  const enabled = data.enabled ?? current.enabled;
  const collectorId = data.collectorId === undefined ? current.collectorId : data.collectorId ?? undefined;
  if (enabled && !collectorId) throw new SourceRegistryValidationError("Enabled sources require collectorId");
  if (collectorId && await findSourceByCollectorId(collectorId, id)) {
    throw new DuplicateCollectorError("collectorId is already registered");
  }
  return updateSource(id, data);
}

export async function setSourceEnabledService(id: string, enabled: boolean) {
  const current = await findSourceById(id);
  if (!current) return null;
  if (enabled && !current.collectorId) throw new SourceRegistryValidationError("Enabled sources require collectorId");
  return setSourceEnabled(id, enabled);
}

export class DuplicateCollectorError extends Error {}
export class SourceRegistryValidationError extends Error {}

export async function sourceRunStarted(id: string, startedAt: Date) {
  return markSourceRunStarted(id, startedAt);
}

export async function sourceRunSucceeded(id: string, completedAt: Date) {
  return markSourceRunSucceeded(id, completedAt);
}

export async function sourceRunFailed(
  id: string,
  failedAt: Date,
  reason: string,
) {
  return markSourceRunFailed(id, failedAt, reason);
}

export async function sourceRunPartial(
  id: string,
  completedAt: Date,
  reason: string,
  highRejectionRate: boolean,
) {
  return markSourceRunPartial(id, completedAt, reason, highRejectionRate);
}

export async function updateSourceHealthService(
  id: string,
  completedAt: Date,
  analysis: HealthAnalysis,
  qualityScore?: number,
) {
  return updateSourceHealth(id, completedAt, analysis, qualityScore);
}

export async function updateSourceHealingService(
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
  return updateSourceHealing(id, data);
}
