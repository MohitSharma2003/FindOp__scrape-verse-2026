import type { NormalizedOpportunity } from "../ingestion/types.js";
import type { ExtractionQuality } from "./extraction.types.js";

export const CRITICAL_EXTRACTION_FIELDS = ["title", "opportunityUrl", "organization", "description"] as const;
export const IMPORTANT_EXTRACTION_FIELDS = ["location", "dates", "deadline", "mode", "skills", "eligibility", "prize"] as const;
const ALL_FIELDS = [...CRITICAL_EXTRACTION_FIELDS, ...IMPORTANT_EXTRACTION_FIELDS] as const;

export function assessExtractionQuality(opportunity: NormalizedOpportunity): ExtractionQuality {
  const present = new Set<string>();
  if (opportunity.title.trim()) present.add("title");
  if (opportunity.opportunityUrl) present.add("opportunityUrl");
  if (opportunity.organization.trim()) present.add("organization");
  if (opportunity.description.trim()) present.add("description");
  if (opportunity.location.trim()) present.add("location");
  if (opportunity.startDate || opportunity.endDate) present.add("dates");
  if (opportunity.deadline) present.add("deadline");
  if (opportunity.mode) present.add("mode");
  if (opportunity.skills.length > 0) present.add("skills");
  if (opportunity.eligibility.trim()) present.add("eligibility");
  if (opportunity.prize?.trim()) present.add("prize");
  const criticalFieldsPresent = CRITICAL_EXTRACTION_FIELDS.filter((field) => present.has(field));
  const importantFieldsPresent = IMPORTANT_EXTRACTION_FIELDS.filter((field) => present.has(field));
  const missingFields = ALL_FIELDS.filter((field) => !present.has(field));
  return {
    status: criticalFieldsPresent.length === CRITICAL_EXTRACTION_FIELDS.length && importantFieldsPresent.length >= 3 ? "healthy" : "incomplete",
    score: Math.round(((criticalFieldsPresent.length + importantFieldsPresent.length) / ALL_FIELDS.length) * 100),
    missingFields: [...missingFields],
    criticalFieldsPresent: [...criticalFieldsPresent],
    importantFieldsPresent: [...importantFieldsPresent],
  };
}
