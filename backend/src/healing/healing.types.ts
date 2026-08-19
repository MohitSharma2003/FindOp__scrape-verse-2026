import type { HealthAnalysis } from "../health/health.types.js";

export type HealingStatus =
  | "pending"
  | "diagnosing"
  | "repairing"
  | "verifying"
  | "recovered"
  | "repair_available"
  | "escalated";

export type DiagnosisCategory =
  | "empty_output"
  | "extraction_quality"
  | "extraction_regression"
  | "scraper_execution";

export interface FailureDiagnosis {
  category: DiagnosisCategory;
  evidence: string[];
  severity: "warning" | "critical";
  recommendedAction: string;
  diagnosis?: string;
  confidence?: number;
}

export interface LlmDiagnosis {
  diagnosis: string;
  repairInstruction: string;
  confidence: number;
}

export interface RepairVerificationInput {
  repairSucceeded: boolean;
  scrapeCompleted: boolean;
  health?: HealthAnalysis;
}

export interface RepairVerificationResult {
  recovered: boolean;
  reason: string;
}

export interface HealingHistoryEntry {
  attempt: number;
  startedAt: Date;
  completedAt?: Date;
  status: string;
  error?: string;
}

export interface HealingResult {
  status: HealingStatus;
  attempts: number;
  diagnosis: FailureDiagnosis;
  scrapeRun: unknown;
  verificationRun?: unknown;
  recoveryReason?: string;
  error?: string;
}
