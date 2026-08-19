import { bulkUpsertOpportunities } from "../modules/opportunities/opportunity.repository.js";
import { deduplicateRecords } from "./deduplicator.js";
import { normalizeRecord } from "./normalizer.js";
import type { IngestionResult, NormalizedOpportunity } from "./types.js";
import { validateRawRecord } from "./validator.js";

export interface IngestionContext {
  sourceId: string;
  sourceUrl: string;
}

export async function ingest(
  rawRecords: unknown,
  context: IngestionContext,
): Promise<IngestionResult> {
  const records = Array.isArray(rawRecords) ? rawRecords : [];
  const validRecords: NormalizedOpportunity[] = [];
  const validationErrors: IngestionResult["validationErrors"] = [];

  records.forEach((record, index) => {
    const validation = validateRawRecord(record);

    if (!validation.valid || !validation.candidate) {
      validationErrors.push({
        index,
        reason: validation.reason ?? "record is invalid",
      });
      return;
    }

    try {
      validRecords.push(normalizeRecord(validation.candidate, context));
    } catch (error: unknown) {
      validationErrors.push({
        index,
        reason: error instanceof Error ? error.message : "normalization failed",
      });
    }
  });

  const deduplicated = deduplicateRecords(validRecords);
  const persistence = await bulkUpsertOpportunities(deduplicated.records);

  return {
    recordsFound: records.length,
    recordsValid: validRecords.length,
    recordsRejected: validationErrors.length,
    duplicatesFound: deduplicated.duplicatesFound,
    recordsPersisted: persistence.upsertedCount + persistence.matchedCount,
    validationErrors,
  };
}

export async function ingestNormalizedOpportunities(
  records: NormalizedOpportunity[],
) {
  const deduplicated = deduplicateRecords(records);
  const persistence = await bulkUpsertOpportunities(deduplicated.records);

  return {
    recordsValid: records.length,
    duplicatesFound: deduplicated.duplicatesFound,
    recordsPersisted: persistence.upsertedCount + persistence.matchedCount,
  };
}
