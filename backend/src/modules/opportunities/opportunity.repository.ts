import { Opportunity } from "./opportunity.model.js";

import type { createOpportunityInput } from "./opportunity.schema.js";

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