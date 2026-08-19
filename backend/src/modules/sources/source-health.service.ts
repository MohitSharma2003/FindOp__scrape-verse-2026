import { calculateBaseline } from "../../health/health-analyzer.js";
import type { HealthStatus } from "../../health/health.types.js";
import {
  findRecentScrapeRunsBySource,
  findRecentSuccessfulScrapeRunsBySource,
} from "../scrape-runs/scrape-run.repository.js";
import { getSourceById } from "./source.service.js";

export async function getSourceHealth(id: string) {
  const source = await getSourceById(id);

  if (!source) {
    return null;
  }

  const recentRuns = await findRecentScrapeRunsBySource(id, 10);
  const successfulRuns = await findRecentSuccessfulScrapeRunsBySource(id, 5);
  const latestRun = recentRuns[0];
  const baselineRecords = calculateBaseline(successfulRuns);
  const currentStatus = latestRun?.healthStatus as HealthStatus | undefined;

  return {
    source: {
      id: source._id,
      name: source.name,
      url: source.url,
      category: source.category,
      enabled: source.enabled,
    },
    health: {
      status: currentStatus ?? sourceHealthStatus(source.healthStatus),
      severity: latestRun?.healthSeverity ?? "info",
      reasons: latestRun?.healthReasons ?? [],
      consecutiveFailures: source.consecutiveFailures,
      lastRunAt: source.lastRunAt,
      lastSuccessfulRunAt: source.lastSuccessfulRunAt,
      lastFailureAt: source.lastFailureAt,
      lastFailureReason: source.lastFailureReason,
      baseline: {
        records: baselineRecords,
        sampleSize: successfulRuns.length,
      },
    },
    recentHealthHistory: recentRuns.map((run) => ({
      id: run._id,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      status: run.status,
      healthStatus: run.healthStatus,
      healthSeverity: run.healthSeverity,
      healthReasons: run.healthReasons,
      healthMetrics: run.healthMetrics,
      recordsFound: run.recordsFound,
      recordsValid: run.recordsValid,
      recordsRejected: run.recordsRejected,
    })),
  };
}

function sourceHealthStatus(value: "healthy" | "unhealthy" | "unknown"): HealthStatus {
  if (value === "healthy") {
    return "healthy";
  }

  return value === "unhealthy" ? "failed" : "degraded";
}
