import { Types } from "mongoose";

import { Opportunity } from "./opportunity.model.js";

import type { createOpportunityInput } from "./opportunity.schema.js";
import type { NormalizedOpportunity } from "../../ingestion/types.js";
import type { SearchIntent } from "../../search/search-intent.schema.js";

const GLOBAL_LOCATION_PATTERN = "remote|global|worldwide|online|virtual|anywhere";

export async function findAllOpportunities() {
  return Opportunity.find().sort({ createdAt: -1 });
}

export async function createOpportunity(
  data: createOpportunityInput,
) {
  return Opportunity.create(data);
}

export async function findOpportunityById(id: string) {
  return Opportunity.findById(id);
}

export interface OpportunityQueryResult {
  opportunities: NormalizedOpportunity[];
  totalMatching: number;
  oldestScrapedAt: Date | null;
  freshestScrapedAt: Date | null;
}

export async function findOpportunitiesByIntent(
  intent: SearchIntent,
  limit = 50,
): Promise<OpportunityQueryResult> {
  const filter: Record<string, unknown> = {};

  if (intent.type !== "other") {
    filter.$or = [
      { category: intent.type },
      { category: "other" },
    ];
  }

  if (intent.keywords.length > 0) {
    const keywordRegex = intent.keywords.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    filter.$and = [
      ...(filter.$and as unknown[] ?? []),
      {
        $or: [
          { title: { $regex: keywordRegex, $options: "i" } },
          { description: { $regex: keywordRegex, $options: "i" } },
          { skills: { $in: intent.keywords.map((k) => new RegExp(k, "i")) } },
          { organization: { $regex: keywordRegex, $options: "i" } },
        ],
      },
    ];
  }

  if (intent.mode && intent.mode !== "any") {
    filter.$and = [
      ...(filter.$and as unknown[] ?? []),
      {
        $or: [
          { mode: intent.mode },
          { mode: "any" },
          { mode: { $exists: false } },
          { mode: null },
        ],
      },
    ];
  }

  if (intent.location?.country) {
    const countryRegex = intent.location.country.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$and = [
      ...(filter.$and as unknown[] ?? []),
      {
        $or: [
          { location: { $regex: countryRegex, $options: "i" } },
          { location: { $regex: GLOBAL_LOCATION_PATTERN, $options: "i" } },
          { location: { $in: [null, ""] } },
          { location: { $exists: false } },
        ],
      },
    ];
  }

  if (intent.skills.length > 0) {
    filter.$and = [
      ...(filter.$and as unknown[] ?? []),
      {
        $or: [
          { skills: { $in: intent.skills.map((s) => new RegExp(s, "i")) } },
          { skills: { $size: 0 } },
          { skills: { $exists: false } },
        ],
      },
    ];
  }

  const docs = await Opportunity.find(filter)
    .sort({ scrapedAt: -1, createdAt: -1 })
    .limit(limit)
    .lean();

  const opportunities: NormalizedOpportunity[] = docs.map((doc) => ({
    title: doc.title ?? "",
    organization: doc.organization ?? "",
    description: doc.description ?? "",
    eligibility: doc.eligibility ?? "",
    category: (doc.category as NormalizedOpportunity["category"]) ?? "other",
    url: doc.url ?? doc.opportunityUrl ?? "",
    opportunityUrl: doc.opportunityUrl ?? doc.url ?? "",
    applicationUrl: doc.applicationUrl ?? undefined,
    source: doc.source ?? "",
    sourceId: doc.sourceId ? String(doc.sourceId) : undefined,
    location: doc.location ?? "",
    skills: Array.isArray(doc.skills) ? doc.skills : [],
    status: (doc.status as NormalizedOpportunity["status"]) ?? "unknown",
    startDate: doc.startDate ? new Date(doc.startDate) : null,
    endDate: doc.endDate ? new Date(doc.endDate) : undefined,
    deadline: doc.deadline ? new Date(doc.deadline) : undefined,
    mode: (doc.mode as NormalizedOpportunity["mode"]) ?? undefined,
    prize: doc.prize ?? undefined,
    scrapedAt: doc.scrapedAt ? new Date(doc.scrapedAt) : new Date(),
  }));

  const scrapedDates = opportunities
    .map((o) => o.scrapedAt.getTime())
    .filter((t) => !Number.isNaN(t));

  return {
    opportunities,
    totalMatching: docs.length,
    oldestScrapedAt: scrapedDates.length > 0 ? new Date(Math.min(...scrapedDates)) : null,
    freshestScrapedAt: scrapedDates.length > 0 ? new Date(Math.max(...scrapedDates)) : null,
  };
}

export async function bulkUpsertOpportunities(
  opportunities: NormalizedOpportunity[],
) {
  if (opportunities.length === 0) {
    return { upsertedCount: 0, matchedCount: 0 };
  }

  const result = await Opportunity.bulkWrite(
    opportunities.map((opportunity) => {
      const sourceId = opportunity.sourceId
        ? new Types.ObjectId(opportunity.sourceId)
        : undefined;
      const filter = sourceId
        ? { sourceId, opportunityUrl: opportunity.opportunityUrl }
        : { source: opportunity.source, opportunityUrl: opportunity.opportunityUrl };
      const { sourceId: _sourceId, ...opportunityFields } = opportunity;

      return {
        updateOne: {
          filter,
          update: {
            $set: {
              ...opportunityFields,
              ...(sourceId ? { sourceId } : {}),
            },
          },
          upsert: true,
        },
      };
    }),
  );

  return {
    upsertedCount: result.upsertedCount,
    matchedCount: result.matchedCount,
  };
}
