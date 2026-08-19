export type HealthStatus = "healthy" | "degraded" | "failed";
export type HealthSeverity = "info" | "warning" | "critical";

export interface HealthMetrics {
  baselineRecords?: number;
  currentRecords: number;
  validationFailureRate: number;
  recordCountRatio?: number;
}

export interface HistoricalScrapeRun {
  recordsFound: number;
}

export interface HealthAnalysisInput {
  recordsFound: number;
  recordsValid: number;
  recordsRejected: number;
  executionFailed?: boolean;
  zeroRecordsFailure?: boolean;
  historicalSuccessfulRuns?: HistoricalScrapeRun[];
}

export interface HealthAnalysis {
  status: HealthStatus;
  severity: HealthSeverity;
  reasons: string[];
  metrics: HealthMetrics;
}
