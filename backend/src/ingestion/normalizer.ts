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
    organization: "",
    description: "",
    eligibility: "",
    category: "hackathon",
    url: opportunityUrl,
    opportunityUrl,
    applicationUrl,
    source: context.sourceUrl,
    sourceId: context.sourceId,
    location: normalizeLocation(record),
    skills: [],
  status: normalizeStatus(record),
    startDate: normalizeDate(record.start_date),
    scrapedAt: new Date(),
  };
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
  const values = [record.status, record.application_status]
    .map(readString)
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  const combined = values.join(" ");

  if (combined.includes("closed") || combined.includes("ended")) {
    return "closed";
  }

  if (combined.includes("closes in") || combined.includes("open now")) {
    return "open";
  }

  if (combined.includes("opens in") || combined.includes("opening soon")) {
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
