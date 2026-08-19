import type { NormalizedOpportunity } from "../ingestion/types.js";
import type { ExtractionCandidate, ExtractedOpportunity } from "./extraction.types.js";

const categories = ["hackathon", "internship", "job", "fellowship", "scholarship", "competition", "program", "other"] as const;
type Category = (typeof categories)[number];

function recordFrom(payload: unknown, depth = 0): Record<string, unknown> | undefined {
  if (depth > 4 || payload === null || payload === undefined) return undefined;
  if (typeof payload === "string") {
    try { return recordFrom(JSON.parse(payload) as unknown, depth + 1); } catch { return undefined; }
  }
  if (Array.isArray(payload)) return recordFrom(payload[0], depth + 1);
  if (typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  if (typeof record.title === "string" || typeof record.name === "string") return record;
  for (const key of ["data", "result", "record", "opportunity", "items", "results"]) {
    const nested = recordFrom(record[key], depth + 1);
    if (nested) return nested;
  }
  return record;
}

function stringValue(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function textValue(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  const direct = stringValue(record, ...keys);
  if (direct) return direct;
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      const items = value.filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
      if (items.length) return items.join("; ");
    }
  }
  return undefined;
}

function urlValue(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  const value = stringValue(record, ...keys);
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : undefined;
  } catch { return undefined; }
}

function parseDate(value: unknown): Date | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : new Date(value.getTime());
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  if (typeof value === "string" && !/\b\d{4}\b/.test(value)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function normalizeMode(value: string | undefined): ExtractedOpportunity["mode"] {
  const mode = value?.toLowerCase().replace(/[-\s]/g, "_");
  if (mode === "online" || mode === "virtual" || mode === "remote") return "remote";
  if (mode === "in_person" || mode === "offline" || mode === "onsite" || mode === "on_site") return "in_person";
  if (mode === "hybrid") return "hybrid";
  return undefined;
}

function normalizeCategory(value: string): Category {
  const text = value.toLowerCase();
  if (text.includes("hackathon")) return "hackathon";
  if (text.includes("intern")) return "internship";
  if (text.includes("fellowship")) return "fellowship";
  if (text.includes("scholarship")) return "scholarship";
  if (text.includes("competition") || text.includes("contest")) return "competition";
  if (text.includes("job") || text.includes("career")) return "job";
  if (text.includes("program")) return "program";
  return categories.includes(text as Category) ? text as Category : "other";
}

function normalizeSkills(value: unknown): string[] | undefined {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,;\n|]/) : [];
  const skills = values.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  return skills.length ? [...new Set(skills)] : undefined;
}

export function parseExtractionResult(
  payload: unknown,
  candidate: ExtractionCandidate,
): ExtractedOpportunity | undefined {
  return parseExtractionResultDetailed(payload, candidate).value;
}

export interface ExtractionParserDiagnostic {
  reason: "no_record" | "missing_title" | "invalid_opportunity_url" | "insufficient_opportunity_fields" | "blocked_page";
  responseShape: string;
  firstRecordType: string;
  firstRecordKeys: string[];
}

export function describeExtractionRejection(
  payload: unknown,
  candidate: ExtractionCandidate,
): ExtractionParserDiagnostic {
  return parseExtractionResultDetailed(payload, candidate).diagnostic ?? {
    reason: "no_record",
    responseShape: describePayloadShape(payload),
    firstRecordType: "undefined",
    firstRecordKeys: [],
  };
}

function parseExtractionResultDetailed(
  payload: unknown,
  candidate: ExtractionCandidate,
): { value?: ExtractedOpportunity; diagnostic?: ExtractionParserDiagnostic } {
  const record = recordFrom(payload);
  const diagnosticBase = {
    responseShape: describePayloadShape(payload),
    firstRecordType: Array.isArray(payload) ? typeof payload[0] : typeof payload,
    firstRecordKeys: record ? Object.keys(record).slice(0, 25) : [],
  };
  if (!record) return { diagnostic: { ...diagnosticBase, reason: "no_record" } };
  const title = stringValue(record, "title", "name") ?? candidate.title;
  if (!title) return { diagnostic: { ...diagnosticBase, reason: "missing_title" } };
  const input = record.input;
  const inputUrl = input && typeof input === "object" && !Array.isArray(input)
    ? urlValue(input as Record<string, unknown>, "url")
    : undefined;
  const opportunityUrl = urlValue(record, "opportunityUrl", "opportunity_url", "source_url", "url") ?? inputUrl ?? candidate.url;
  if (!opportunityUrl) return { diagnostic: { ...diagnosticBase, reason: "invalid_opportunity_url" } };
  const description = stringValue(record, "description", "summary", "snippet", "details", "content");
  const organization = stringValue(record, "organization", "organizer", "organization_name", "company");
  const hasOpportunitySignal = Boolean(
    description || organization || stringValue(
      record,
      "type", "category", "opportunity_type", "opportunityType", "application_url",
      "start_date", "startDate", "end_date", "endDate", "application_deadline",
      "deadline", "location", "participation_mode", "participationMode", "eligibility",
      "required_skills_or_technologies", "skills", "technologies", "prize_or_rewards", "prize",
    ),
  );
  if (!hasOpportunitySignal) return { diagnostic: { ...diagnosticBase, reason: "insufficient_opportunity_fields" } };
  if (/^(sign in|login|log in|404\b|page not found|access denied)/i.test(title.trim())) {
    return { diagnostic: { ...diagnosticBase, reason: "blocked_page" } };
  }
  const sourceUrl = new URL(opportunityUrl);
  const typeText = `${stringValue(record, "type", "category", "opportunity_type", "opportunityType") ?? ""} ${title} ${description ?? ""}`;

  return { value: {
    title,
    organization,
    description,
    opportunityUrl,
    applicationUrl: urlValue(record, "applicationUrl", "application_url", "applyUrl", "registration_url"),
    type: normalizeCategory(typeText),
    startDate: parseDate(record.startDate ?? record.start_date ?? record.event_start_date),
    endDate: parseDate(record.endDate ?? record.end_date ?? record.event_end_date),
    deadline: parseDate(record.deadline ?? record.applicationDeadline ?? record.application_deadline),
    location: stringValue(record, "location", "venue", "city"),
    mode: normalizeMode(stringValue(record, "mode", "participationMode", "participation_mode")),
    eligibility: textValue(record, "eligibility", "requirements"),
    skills: normalizeSkills(record.skills ?? record.technologies ?? record.required_skills_or_technologies),
    prize: stringValue(record, "prize", "prizeAmount", "prize_or_rewards", "rewards"),
    source: { url: opportunityUrl, domain: sourceUrl.hostname.toLowerCase() },
  } };
}

function describePayloadShape(value: unknown): string {
  if (Array.isArray(value)) return `array(length=${value.length})`;
  if (value === null) return "null";
  if (typeof value === "string") return `string(length=${value.length})`;
  if (typeof value !== "object") return typeof value;
  return `object(keys=${Object.keys(value).slice(0, 20).join(",")})`;
}

export function toNormalizedOpportunity(value: ExtractedOpportunity): NormalizedOpportunity {
  const category = normalizeCategory(value.type ?? value.title);
  return {
    title: value.title,
    organization: value.organization ?? "",
    description: value.description ?? "",
    eligibility: value.eligibility ?? "",
    category,
    url: value.opportunityUrl,
    opportunityUrl: value.opportunityUrl,
    applicationUrl: value.applicationUrl,
    source: value.source.domain,
    location: value.location ?? "",
    skills: value.skills ?? [],
    status: "unknown",
    startDate: value.startDate ?? null,
    endDate: value.endDate ?? null,
    deadline: value.deadline ?? null,
    mode: value.mode ?? null,
    prize: value.prize,
    scrapedAt: new Date(),
  };
}
