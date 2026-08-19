export const OPPORTUNITY_TYPES = [
  "hackathon", "internship", "fellowship", "scholarship", "competition",
  "grant", "job", "conference", "workshop", "accelerator", "other",
] as const;

export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];
export type SearchMode = "remote" | "in_person" | "hybrid" | "any";

export interface ResolvedDateRange {
  from?: Date;
  to?: Date;
}
