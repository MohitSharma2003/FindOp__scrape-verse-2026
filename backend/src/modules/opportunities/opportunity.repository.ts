import { Types } from "mongoose";

import { Opportunity } from "./opportunity.model.js";

import type { createOpportunityInput } from "./opportunity.schema.js";
import type { NormalizedOpportunity } from "../../ingestion/types.js";

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
