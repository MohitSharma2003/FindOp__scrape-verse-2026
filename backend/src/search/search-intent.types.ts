export const OPPORTUNITY_TYPES = [
  "hackathon", "internship", "job", "fellowship", "scholarship", "competition",
  "program", "grant", "conference", "workshop", "accelerator", "other",
] as const;

export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];
export type SearchMode = "remote" | "in_person" | "hybrid" | "any";

export interface ResolvedDateRange {
  from?: Date;
  to?: Date;
}
