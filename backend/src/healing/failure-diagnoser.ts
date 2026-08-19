import { z } from "zod";

import { HEALABLE_REASONS } from "./healing.constants.js";
import type { FailureDiagnosis, LlmDiagnosis } from "./healing.types.js";

const llmDiagnosisSchema = z.object({
  diagnosis: z.string().trim().min(1),
  repairInstruction: z.string().trim().min(1).max(1000),
  confidence: z.number().min(0).max(1),
});

const diagnosisMap: Record<string, Omit<FailureDiagnosis, "evidence">> = {
  zero_records: {
    category: "empty_output",
    severity: "critical",
    recommendedAction: "Inspect the collector entry point and restore record emission for the configured source URL.",
  },
  high_validation_failure_rate: {
    category: "extraction_quality",
    severity: "critical",
    recommendedAction: "Repair selectors or extraction rules for the required title and opportunity URL fields.",
  },
  record_count_drop: {
    category: "extraction_regression",
    severity: "warning",
    recommendedAction: "Compare the collector output against the source page and restore missing opportunity cards.",
  },
  mostly_invalid_records: {
    category: "extraction_quality",
    severity: "critical",
    recommendedAction: "Repair extraction rules so each emitted record contains a title and absolute opportunity URL.",
  },
  scrape_execution_failed: {
    category: "scraper_execution",
    severity: "critical",
    recommendedAction: "Repair the collector execution configuration and restore a runnable published scraper.",
  },
};

export function diagnoseFailure(
  reasons: string[],
  llmOutput?: unknown,
): FailureDiagnosis {
  const evidence = reasons.filter((reason) => HEALABLE_REASONS.has(reason));
  const primaryReason = evidence[0] ?? "scrape_execution_failed";
  const base = diagnosisMap[primaryReason] ?? {
    category: "scraper_execution" as const,
    severity: "critical" as const,
    recommendedAction: "Repair the collector execution configuration and restore a runnable published scraper.",
  };
  const parsedLlm = parseLlmDiagnosis(llmOutput);

  return {
    ...base,
    evidence,
    ...(parsedLlm
      ? {
          diagnosis: parsedLlm.diagnosis,
          recommendedAction: parsedLlm.repairInstruction,
          confidence: parsedLlm.confidence,
        }
      : {}),
  };
}

export function parseLlmDiagnosis(value: unknown): LlmDiagnosis | undefined {
  const result = llmDiagnosisSchema.safeParse(value);
  return result.success ? result.data : undefined;
}
