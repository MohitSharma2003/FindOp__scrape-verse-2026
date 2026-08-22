import { BrightDataExtractionClient } from "../integrations/brightdata/brightdata.extraction.client.js";
import { ingestNormalizedOpportunities } from "../ingestion/ingestion.service.js";
import { env } from "../config/env.js";
import { extractionRequestSchema } from "./extraction.schema.js";
import { describeExtractionRejection, parseExtractionResult, toNormalizedOpportunity } from "./extraction.parser.js";
import { assessExtractionQuality, CRITICAL_EXTRACTION_FIELDS } from "./extraction-quality.js";
import { buildHealingPrompt, diagnoseExtractionQuality } from "./extraction-healing.js";
import { BrightDataHealingClient } from "../integrations/brightdata/brightdata.healing.client.js";
import type {
  ExtractionBatchResult,
  ExtractionCandidate,
  ExtractionClient,
  ExtractionResultItem,
  ExtractionHealingMetadata,
} from "./extraction.types.js";
import type { NormalizedOpportunity } from "../ingestion/types.js";
import { BrightDataError } from "../integrations/brightdata/brightdata.client.js";
import type { BrightDataHealingResult } from "../integrations/brightdata/brightdata.healing.client.js";

export class ExtractionValidationError extends Error {}

export interface ExtractionDependencies {
  client: ExtractionClient;
  ingest: typeof ingestNormalizedOpportunities;
  createHealingClient: () => Pick<BrightDataHealingClient, "heal">;
  collectorId?: string;
  extractionTimeoutMs?: number;
  healingTimeoutMs?: number;
  /** Extract through a repaired, explicitly verified collector/template. */
  extractHealed?: (url: string, repair: Pick<BrightDataHealingResult, "productionState" | "repairedScraper">) => Promise<unknown>;
}

const productionDependencies: ExtractionDependencies = {
  client: new BrightDataExtractionClient(),
  ingest: ingestNormalizedOpportunities,
  createHealingClient: () => new BrightDataHealingClient({
    apiToken: env.BRIGHT_DATA_API_TOKEN,
    timeoutMs: env.BRIGHT_DATA_HEALING_TIMEOUT_MS,
    pollIntervalMs: env.BRIGHT_DATA_POLL_INTERVAL_MS,
  }),
  collectorId: env.BRIGHT_DATA_EXTRACTION_COLLECTOR_ID,
  extractHealed: (url, repair) => new BrightDataExtractionClient().extractWithVersion(url, repair),
  extractionTimeoutMs: env.BRIGHT_DATA_TIMEOUT_MS,
  healingTimeoutMs: env.BRIGHT_DATA_HEALING_TIMEOUT_MS,
};

const activeHealingOperations = new Map<string, Promise<BrightDataHealingResult>>();

function healOncePerCollector(
  dependencies: ExtractionDependencies,
  collectorId: string,
  prompt: string,
  input: unknown[],
): Promise<BrightDataHealingResult> {
  const existing = activeHealingOperations.get(collectorId);
  if (existing) return existing;

  const operation = dependencies.createHealingClient().heal(collectorId, prompt, input);
  activeHealingOperations.set(collectorId, operation);
  const clear = () => {
    if (activeHealingOperations.get(collectorId) === operation) activeHealingOperations.delete(collectorId);
  };
  operation.then(clear, clear);
  return operation;
}

export async function extractOpportunities(
  input: unknown,
  dependencies: Partial<ExtractionDependencies> = {},
): Promise<ExtractionBatchResult> {
  const parsed = extractionRequestSchema.safeParse(input);
  if (!parsed.success) throw new ExtractionValidationError("Invalid extraction candidates");

  const candidates = parsed.data.candidates.slice(0, env.MAX_EXTRACTION_CANDIDATES);
  const active = { ...productionDependencies, ...dependencies };
  const results: ExtractionResultItem[] = [];
  const normalized: Array<NormalizedOpportunity | undefined> = [];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < candidates.length) {
      const index = nextIndex++;
      const candidate = candidates[index] as ExtractionCandidate;
      try {
        const raw = await withTimeout(
          active.client.extract(candidate.url),
          active.extractionTimeoutMs ?? env.BRIGHT_DATA_TIMEOUT_MS,
          "Extraction timed out",
        );
        const extracted = parseExtractionResult(raw, candidate);
        if (!extracted) {
          console.error("Extraction parser rejected provider response", {
            url: candidate.url,
            ...describeExtractionRejection(raw, candidate),
          });
          results[index] = { url: candidate.url, status: "rejected", error: "Invalid or insufficient extraction" };
          continue;
        }
        let opportunity = toNormalizedOpportunity(extracted);
        let extractionQuality = assessExtractionQuality(opportunity);
        let healing: ExtractionHealingMetadata = {
          attempted: false,
          status: "not_needed",
          missingFields: extractionQuality.missingFields,
          originalQualityScore: extractionQuality.score,
          healingImproved: false,
          productionState: "not_attempted",
        };

        const diagnosis = diagnoseExtractionQuality(extractionQuality);
        if (diagnosis.shouldHeal && active.collectorId) {
          healing = {
            attempted: true,
            status: "failed",
            reason: diagnosis.reason,
            missingFields: diagnosis.missingFields,
            originalQualityScore: diagnosis.qualityScore,
            healingImproved: false,
            productionState: "not_attempted",
          };
          try {
            const repair = await withTimeout(
              healOncePerCollector(active,
                active.collectorId,
                buildHealingPrompt(candidate.url, diagnosis),
                [{ url: candidate.url }],
              ),
              active.healingTimeoutMs ?? env.BRIGHT_DATA_HEALING_TIMEOUT_MS,
              "Bright Data healing timed out",
            );
            if (repair.pendingApproval) {
              healing = { ...healing, status: "pending_approval", error: repair.error };
            } else if (repair.success) {
              healing = { ...healing, status: "repair_available", productionState: repair.productionState ?? "not_verified", error: repair.productionState === "not_verified" ? "Re-extraction skipped: repaired production version is not verified" : undefined };
              if (!active.extractHealed || !repair.repairedScraper) {
                normalized[index] = opportunity;
                results[index] = { url: candidate.url, status: "extracted", opportunity, extractionQuality, healing };
                continue;
              }
              const healedRaw = await withTimeout(
                active.extractHealed(candidate.url, repair),
                active.extractionTimeoutMs ?? env.BRIGHT_DATA_TIMEOUT_MS,
                "Extraction timed out",
              );
              const healed = parseExtractionResult(healedRaw, candidate);
              if (healed) {
                const healedOpportunity = toNormalizedOpportunity(healed);
                const healedQuality = assessExtractionQuality(healedOpportunity);
                const noCriticalRegression = CRITICAL_EXTRACTION_FIELDS.every((field) =>
                  !extractionQuality.criticalFieldsPresent.includes(field) || healedQuality.criticalFieldsPresent.includes(field),
                );
                if (healedQuality.score > extractionQuality.score && noCriticalRegression) {
                  opportunity = healedOpportunity;
                  extractionQuality = healedQuality;
                  healing = {
                    ...healing,
                    status: "recovered",
                    healedQualityScore: healedQuality.score,
                    missingFields: healedQuality.missingFields,
                    healingImproved: true,
                    productionState: repair.productionState === "verified" ? "verified" : "not_verified",
                  };
                } else {
                  healing = {
                    ...healing,
                    status: "no_improvement",
                    healedQualityScore: healedQuality.score,
                    healingImproved: false,
                  };
                }
              } else {
                healing = { ...healing, status: "failed", error: "Healed extraction was invalid", healingImproved: false };
              }
            } else {
              healing = { ...healing, status: "failed", error: repair.error ?? "Bright Data healing failed" };
            }
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Bright Data healing failed";
            healing = {
              ...healing,
              status: /timed out/i.test(message) ? "timeout" : "failed",
              error: message,
              healingImproved: false,
              productionState: healing.productionState,
            };
          }
        }

        normalized[index] = opportunity;
        results[index] = {
          url: candidate.url,
          status: "extracted",
          opportunity,
          extractionQuality,
          healing,
        };
      } catch (error: unknown) {
        if (error instanceof BrightDataError) {
          console.error("Bright Data extraction failed", {
            url: candidate.url,
            stage: error.stage ?? "unknown",
            statusCode: error.statusCode,
            responseContentType: error.responseContentType,
            message: error.message,
            providerMessage: error.providerMessage,
          });
        } else {
          console.error("Extraction failed", {
            url: candidate.url,
            message: error instanceof Error ? error.message : "Unknown extraction error",
          });
        }
        results[index] = { url: candidate.url, status: "rejected", error: "Extraction failed" };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(env.EXTRACTION_CONCURRENCY, candidates.length) }, () => worker()));
  const valid = normalized.filter((value): value is NonNullable<typeof value> => Boolean(value));
  const ingestion = await active.ingest(valid);

  return {
    candidatesReceived: parsed.data.candidates.length,
    candidatesProcessed: candidates.length,
    extracted: valid.length,
    rejected: candidates.length - valid.length,
    persisted: ingestion.recordsPersisted,
    newRecords: ingestion.newRecords,
    updatedRecords: ingestion.updatedRecords,
    duplicates: ingestion.duplicatesFound,
    results: results.filter((value): value is ExtractionResultItem => Boolean(value)),
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}
