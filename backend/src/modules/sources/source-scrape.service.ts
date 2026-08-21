import { env } from "../../config/env.js";
import { BrightDataClient, BrightDataError } from "../../integrations/brightdata/brightdata.client.js";
import { ingest } from "../../ingestion/ingestion.service.js";
import type { IngestionResult } from "../../ingestion/types.js";
import { analyzeHealth } from "../../health/health-analyzer.js";
import type { HealthAnalysis } from "../../health/health.types.js";
import {
  createScrapeRun,
  findRecentSuccessfulScrapeRunsBySource,
  updateScrapeRun,
} from "../scrape-runs/scrape-run.repository.js";
import {
  getSourceById,
  sourceRunStarted,
  updateSourceHealthService,
  markCollectorUnavailableService,
} from "./source.service.js";

export class SourceNotFoundError extends Error {}
export class SourceDisabledError extends Error {}

export type ProviderFailureKind =
  | "collector_deleted"
  | "template_missing"
  | "rate_limited"
  | "auth"
  | "transient"
  | "unknown";

export function classifyBrightDataFailure(error: unknown): ProviderFailureKind {
  if (!(error instanceof BrightDataError)) return "unknown";
  const detail = `${error.message} ${error.providerMessage ?? ""}`.toLowerCase();
  if (error.statusCode === 404 || /collector.*not found|not found.*collector|deleted/.test(detail)) return "collector_deleted";
  if (error.statusCode === 429 || /rate limit|too many requests/.test(detail)) return "rate_limited";
  if (/missing.*template|no.*template|template.*(missing|not found|does not exist)/.test(detail)) return "template_missing";
  if (error.statusCode === 401 || error.statusCode === 403) return "auth";
  if (error.statusCode !== undefined && error.statusCode >= 500) return "transient";
  return "unknown";
}

export interface SourceScrapeResult {
  scrapeRun: unknown;
  ingestion: IngestionResult;
  snapshotId: string;
  health: HealthAnalysis;
}

export class SourceScrapeFailedError extends Error {
  public constructor(
    message: string,
    public readonly scrapeRun: unknown,
    public readonly health?: HealthAnalysis,
    public readonly providerKind?: ProviderFailureKind,
  ) {
    super(message);
  }
}

export interface ScrapeSourceOptions {
  allowAutomaticHealing?: boolean;
  /** Verification runs may scrape sources that are not enabled/ready yet. */
  verificationRun?: boolean;
}

export async function scrapeSource(
  id: string,
  options: ScrapeSourceOptions = {},
): Promise<SourceScrapeResult> {
  console.log("Scrape started", { sourceId: id });
  const source = await getSourceById(id);

  if (!source) {
    throw new SourceNotFoundError("Source not found");
  }

  if (!source.enabled && !options.verificationRun) {
    throw new SourceDisabledError("Source is disabled");
  }

  if (!source.collectorId) {
    throw new SourceNotFoundError("Source has no Bright Data collector configured");
  }

  const startedAt = new Date();
  const runningScrapeRun = await createScrapeRun({
    sourceId: id,
    startedAt,
    status: "running",
    recordsFound: 0,
    recordsValid: 0,
    recordsRejected: 0,
    duplicatesFound: 0,
    recordsPersisted: 0,
    validationErrors: [],
    healthReasons: [],
    healingAttempts: 0,
    healingHistory: [],
  });

  await sourceRunStarted(id, startedAt);

  const client = new BrightDataClient({
    apiToken: env.BRIGHT_DATA_API_TOKEN,
    timeoutMs: env.BRIGHT_DATA_TIMEOUT_MS,
    pollIntervalMs: env.BRIGHT_DATA_POLL_INTERVAL_MS,
  });

  try {
    const result = await client.scrape({
      collectorId: source.collectorId,
      url: source.url,
      ...(source.scraperVersion === "dev" ? { version: "dev" as const } : {}),
    });
    const ingestion = await ingest(result.rawResult, {
      sourceId: id,
      sourceUrl: source.url,
    });
    console.log("Ingestion completed", {
      sourceId: id,
      recordsFound: ingestion.recordsFound,
      recordsValid: ingestion.recordsValid,
      recordsRejected: ingestion.recordsRejected,
      duplicatesFound: ingestion.duplicatesFound,
    });
    const history = await findRecentSuccessfulScrapeRunsBySource(id, 5);
    const health = analyzeHealth({
      recordsFound: ingestion.recordsFound,
      recordsValid: ingestion.recordsValid,
      recordsRejected: ingestion.recordsRejected,
      zeroRecordsFailure: false,
      historicalSuccessfulRuns: history.map((run) => ({
        recordsFound: run.recordsFound,
      })),
    });
    const completedAt = new Date();
    const status = health.status === "failed"
      ? "failed"
      : ingestion.recordsRejected > 0
        ? "partial"
        : "success";
    const scrapeRun = await updateScrapeRun(runningScrapeRun._id.toString(), {
      completedAt,
      status,
      recordsFound: ingestion.recordsFound,
      recordsValid: ingestion.recordsValid,
      recordsRejected: ingestion.recordsRejected,
      duplicatesFound: ingestion.duplicatesFound,
      recordsPersisted: ingestion.recordsPersisted,
      validationErrors: formatValidationErrors(ingestion),
      error: health.status === "failed" ? health.reasons.join(", ") : undefined,
      health,
    });

    await updateSourceHealthService(id, completedAt, health);

    console.log("Scrape completed", { sourceId: id, status, health: health.status });

    if (status === "failed") {
      await maybeStartAutomaticHealing(
        id,
        runningScrapeRun._id.toString(),
        options.allowAutomaticHealing !== false,
      );
      throw new SourceScrapeFailedError(
        health.reasons.join(", ") || "Scrape health failed",
        scrapeRun,
        health,
      );
    }

    return {
      scrapeRun,
      ingestion,
      snapshotId: result.snapshotId,
      health,
    };
  } catch (error: unknown) {
    if (error instanceof SourceScrapeFailedError) {
      throw error;
    }

    const completedAt = new Date();
    const reason = error instanceof Error ? error.message : "Unknown scrape error";
    const providerKind = classifyBrightDataFailure(error);
    if (providerKind === "collector_deleted") {
      await markCollectorUnavailableService(id, `Collector unavailable (deleted or invalid): ${reason}`, source.collectorId ?? undefined);
    }
    const health = analyzeHealth({
      recordsFound: 0,
      recordsValid: 0,
      recordsRejected: 0,
      executionFailed: true,
      zeroRecordsFailure: false,
    });
    const scrapeRun = await updateScrapeRun(runningScrapeRun._id.toString(), {
      completedAt,
      status: "failed",
      error: reason,
      health,
    });

    await updateSourceHealthService(id, completedAt, health);
    console.error("Scrape failed", { sourceId: id, message: reason, providerKind });
    await maybeStartAutomaticHealing(
      id,
      runningScrapeRun._id.toString(),
      options.allowAutomaticHealing !== false,
    );
    throw new SourceScrapeFailedError(reason, scrapeRun, health, providerKind);
  }
}

async function maybeStartAutomaticHealing(
  sourceId: string,
  scrapeRunId: string,
  enabled: boolean,
): Promise<void> {
  if (!enabled || !env.SELF_HEALING_ENABLED) {
    return;
  }

  try {
    const { startHealing } = await import("../../healing/healing.service.js");
    await startHealing(sourceId, scrapeRunId, { allowAutomaticHealing: false });
  } catch {
    // The failed scrape remains recorded; automatic healing must not mask it.
  }
}

function formatValidationErrors(result: IngestionResult): string[] {
  return result.validationErrors.map(
    (issue) => `record ${issue.index}: ${issue.reason}`,
  );
}
