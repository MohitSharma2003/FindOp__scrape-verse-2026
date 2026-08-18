
import type { createOpportunityInput } from "./opportunity.schema.js"
import {
  createOpportunity,
  findAllOpportunities,
  findOpportunityById,
} from "./opportunity.repository.js";


export async function getAllOpportunities() {
    return findAllOpportunities();

}

export async function getOpportunityById(id: string) {
  return findOpportunityById(id);
}

export async function createOpportunityService(
    data: createOpportunityInput,
) {
    return createOpportunity(data)
}