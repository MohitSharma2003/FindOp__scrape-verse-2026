import type {
  NormalizedOpportunity,
  RawDevfolioRecord,
  ValidatedRawRecord,
} from "./types.js";

export interface NormalizationContext {
  sourceId: string;
  sourceUrl: string;
}

export function normalizeRecord(
  candidate: ValidatedRawRecord,
  context: NormalizationContext,
): NormalizedOpportunity {
  const record = candidate.record;
  const opportunityUrl = normalizeUrl(candidate.opportunityUrl);
  const applicationUrl = candidate.applicationUrl
    ? normalizeUrl(candidate.applicationUrl)
    : undefined;

  return {
    title: readString(record.title) ?? "",
    organization: readString(record.organization ?? record.organizer ?? record.company) ?? "",
    description: readString(record.description ?? record.summary ?? record.snippet) ?? "",
    eligibility: readString(record.eligibility) ?? "",
    category: inferCategory(record),
    url: opportunityUrl,
    opportunityUrl,
    applicationUrl,
    source: context.sourceUrl,
    sourceId: context.sourceId,
    location: normalizeLocation(record),
    skills: extractSkills(record),
    status: normalizeStatus(record),
    startDate: normalizeDate(record.start_date ?? record.startDate ?? record.event_start_date),
    endDate: normalizeDate(record.end_date ?? record.endDate ?? record.event_end_date),
    deadline: normalizeDate(record.deadline ?? record.application_deadline ?? record.applicationDeadline),
    mode: normalizeMode(record),
    prize: readString(record.prize ?? record.prizeAmount ?? record.prize_or_rewards ?? record.rewards),
    scrapedAt: new Date(),
  };
}

function inferCategory(record: RawDevfolioRecord): NormalizedOpportunity["category"] {
  const text = [
    record.category,
    record.opportunity_type,
    record.type,
    record.title,
    record.description,
    record.status,
  ].filter((v): v is string => typeof v === "string").join(" ").toLowerCase();

  if (text.includes("hackathon") || text.includes("hack ")) return "hackathon";
  if (text.includes("intern")) return "internship";
  if (text.includes("fellowship")) return "fellowship";
  if (text.includes("scholarship")) return "scholarship";
  if (text.includes("competition") || text.includes("contest")) return "competition";
  if (text.includes("job") || text.includes("career") || text.includes("position")) return "job";
  if (text.includes("program") || text.includes("accelerator")) return "program";
  return "other";
}

function normalizeMode(record: RawDevfolioRecord): NormalizedOpportunity["mode"] {
  const value = readString(record.participation_mode ?? record.mode ?? record.participationMode);
  if (!value) return undefined;
  const lower = value.toLowerCase();
  if (lower.includes("remote") || lower.includes("online") || lower.includes("virtual")) return "remote";
  if (lower.includes("in_person") || lower.includes("in-person") || lower.includes("onsite") || lower.includes("on-site") || lower.includes("offline")) return "in_person";
  if (lower.includes("hybrid")) return "hybrid";
  return undefined;
}

function extractSkills(record: RawDevfolioRecord): string[] {
  const candidates = record.skills ?? record.technologies ?? record.themes ?? record.required_skills_or_technologies;
  if (Array.isArray(candidates)) {
    return candidates.filter((v) => typeof v === "string" && v.trim()).map((v) => String(v).trim());
  }
  if (typeof candidates === "string") {
    return candidates.split(/[,;\n|]/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export function normalizeUrl(value: string): string {
  const url = new URL(value);

  url.hostname = url.hostname.toLowerCase();
  url.hash = "";

  if ((url.protocol === "https:" && url.port === "443") ||
      (url.protocol === "http:" && url.port === "80")) {
    url.port = "";
  }

  url.pathname = url.pathname.replace(/\/+$/, "") || "/";

  return url.toString();
}

function normalizeStatus(record: RawDevfolioRecord): NormalizedOpportunity["status"] {
  const values = [record.status, record.application_status, record.hackathon_status]
    .map(readString)
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  const combined = values.join(" ");

  if (combined.includes("closed") || combined.includes("ended")) {
    return "closed";
  }

  if (combined.includes("closes in") || combined.includes("open now") || combined.includes("open")) {
    return "open";
  }

  if (combined.includes("opens in") || combined.includes("opening soon") || combined.includes("upcoming")) {
    return "upcoming";
  }

  return "unknown";
}

function normalizeLocation(record: RawDevfolioRecord): string {
  const location = readString(record.location);

  if (location) {
    return location;
  }

  const participationMode = readString(record.participation_mode)?.toLowerCase();

  if (participationMode?.includes("online") || participationMode?.includes("remote")) {
    return "Remote";
  }

  return "";
}

function normalizeDate(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}
