
import type { createOpportunityInput } from "./opportunity.schema.js"
import {
  createOpportunity,
  findAllOpportunities,
  findOpportunitiesPage,
  findOpportunityById,
} from "./opportunity.repository.js";


export async function getAllOpportunities() {
    return findAllOpportunities();

}

export const OPPORTUNITY_PAGE_SIZE = 15;

export async function getOpportunityPage(limit: number, offset: number) {
  const { items, total } = await findOpportunitiesPage(limit, offset);
  return {
    items,
    total,
    limit,
    offset,
    hasMore: offset + items.length < total,
  };
}

export async function getOpportunityById(id: string) {
  return findOpportunityById(id);
}

export async function createOpportunityService(
    data: createOpportunityInput,
) {
    return createOpportunity(data)
}