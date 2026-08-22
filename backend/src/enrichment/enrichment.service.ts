import { Opportunity } from "../modules/opportunities/opportunity.model.js";
import type { OpportunityDocument } from "../modules/opportunities/opportunity.model.js";
import type { ExtractionClient, ExtractedOpportunity } from "../extraction/extraction.types.js";
import { parseExtractionResult } from "../extraction/extraction.parser.js";
import { env } from "../config/env.js";

export interface EnrichmentSummary {
  examined: number;
  enriched: number;
  failed: number;
  skippedIncomplete: number;
}

/** A stored record is sparse when it carries almost no usable detail beyond its title/URL. */
export function isSparse(opportunity: {
  description?: string;
  eligibility?: string;
  skills?: string[];
}): boolean {
  return (
    (!opportunity.description || opportunity.description.trim().length < 40)
    && !opportunity.eligibility
    && !(opportunity.skills && opportunity.skills.length > 0)
  );
}

type EnrichmentPatch = Partial<OpportunityDocument>;

/** Merge rule: fill EMPTY fields only — never overwrite data we already hold. */
export function buildEnrichmentPatch(
  existing: { description?: string | null; organization?: string | null; eligibility?: string | null; skills?: string[] | null; deadline?: Date | null; startDate?: Date | null; endDate?: Date | null; prize?: string | null; location?: string | null; mode?: string | null; applicationUrl?: string | null },
  fresh: ExtractedOpportunity,
): EnrichmentPatch {
  const patch: EnrichmentPatch = {};
  if (!existing.description?.trim() && fresh.description?.trim()) patch.description = fresh.description.trim();
  if (!existing.organization?.trim() && fresh.organization?.trim()) patch.organization = fresh.organization.trim();
  if (!existing.eligibility?.trim() && fresh.eligibility?.trim()) patch.eligibility = fresh.eligibility.trim();
  if (!(existing.skills && existing.skills.length > 0) && fresh.skills && fresh.skills.length > 0) patch.skills = fresh.skills;
  if (!existing.deadline && fresh.deadline) patch.deadline = fresh.deadline;
  if (!existing.startDate && fresh.startDate) patch.startDate = fresh.startDate;
  if (!existing.endDate && fresh.endDate) patch.endDate = fresh.endDate;
  if (!existing.prize?.trim() && fresh.prize?.trim()) patch.prize = fresh.prize.trim();
  const existingLocation = existing.location?.trim();
  if ((!existingLocation || existingLocation === "Remote") && fresh.location?.trim()) patch.location = fresh.location.trim();
  if ((!existing.mode || existing.mode === "any") && fresh.mode) patch.mode = fresh.mode;
  if (!existing.applicationUrl?.trim() && fresh.applicationUrl?.trim()) patch.applicationUrl = fresh.applicationUrl.trim();
  return patch;
}

export async function enrichSparseOpportunities(
  extractionClient: ExtractionClient,
  options: { batchSize?: number } = {},
): Promise<EnrichmentSummary> {
  const summary: EnrichmentSummary = { examined: 0, enriched: 0, failed: 0, skippedIncomplete: 0 };
  const batchSize = options.batchSize ?? env.ENRICHMENT_BATCH_SIZE;
  if (batchSize <= 0) return summary;

  // Bounded batch of least-recently-updated sparse records; repeated runs converge.
  const sparseDocs = await Opportunity.find({
    $and: [
      {
        $or: [
          { description: { $in: [null, ""] } },
          { description: { $exists: false } },
          { description: { $regex: /^.{0,39}$/s } },
          { eligibility: { $in: [null, ""] } },
          { skills: { $size: 0 } },
          { skills: { $exists: false } },
        ],
      },
      { opportunityUrl: { $nin: [null, ""] } },
    ],
  })
    .sort({ updatedAt: 1 })
    .limit(batchSize)
    .lean();

  summary.examined = sparseDocs.length;

  for (const record of sparseDocs) {
    const url = record.opportunityUrl;
    if (!url) {
      summary.skippedIncomplete += 1;
      continue;
    }

    try {
      const payload = await extractionClient.extract(url);
      const parsed = parseExtractionResult(payload, { url, title: record.title ?? undefined });
      if (!parsed) {
        summary.failed += 1;
        continue;
      }

      const patch = buildEnrichmentPatch(record, parsed);
      if (Object.keys(patch).length === 0) {
        summary.skippedIncomplete += 1;
        continue;
      }

      await Opportunity.updateOne({ _id: record._id }, { $set: patch });
      summary.enriched += 1;
    } catch {
      summary.failed += 1;
    }
  }

  return summary;
}
