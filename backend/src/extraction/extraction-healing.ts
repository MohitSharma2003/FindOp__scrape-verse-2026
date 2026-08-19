import type { ExtractionQuality } from "./extraction.types.js";

export interface ExtractionDiagnosis {
  shouldHeal: boolean;
  reason: "critical_fields_missing" | "quality_below_threshold" | "extraction_failure";
  missingFields: string[];
  qualityScore: number;
  presentFields: string[];
}

const MAX_PROMPT_LENGTH = 1800;

export function diagnoseExtractionQuality(
  quality: ExtractionQuality,
  parserFailure = false,
): ExtractionDiagnosis {
  if (parserFailure) {
    return {
      shouldHeal: true,
      reason: "extraction_failure",
      missingFields: ["opportunity_record"],
      qualityScore: 0,
      presentFields: [],
    };
  }

  return {
    shouldHeal: quality.criticalFieldsPresent.length < 4 || quality.score < 60,
    reason: quality.criticalFieldsPresent.length < 4 ? "critical_fields_missing" : "quality_below_threshold",
    missingFields: [...quality.missingFields],
    qualityScore: quality.score,
    presentFields: [...quality.criticalFieldsPresent, ...quality.importantFieldsPresent],
  };
}

export function buildHealingPrompt(
  targetUrl: string,
  diagnosis: ExtractionDiagnosis,
): string {
  const missing = diagnosis.missingFields.join(", ") || "none";
  const present = diagnosis.presentFields.join(", ") || "none";
  const prompt = [
    "Repair the scraper for the current target page.",
    `Target URL: ${targetUrl}`,
    "The extraction returned an incomplete opportunity record.",
    `Missing fields: ${missing}.`,
    `Already extracted fields: ${present}.`,
    `Current extraction quality score: ${diagnosis.qualityScore}/100.`,
    "Preserve the existing output schema and input.url as source_url.",
    "Use semantic and structural signals: JSON-LD/schema.org, OpenGraph and metadata, headings, visible sections, label/value pairs, relevant links, tables, and lists.",
    "Use page meaning rather than site-specific selectors; do not assume Devpost or any other domain.",
    "The application URL must be the actual opportunity registration/application URL, not a generic login or signup URL.",
    "Distinguish event dates from the application deadline.",
    "Preserve the configured schema and input.url/source_url. Do not invent values; leave unavailable fields null or empty.",
  ].join("\n");
  return prompt.slice(0, MAX_PROMPT_LENGTH);
}
