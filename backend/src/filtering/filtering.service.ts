import { resolveDateFilter } from "../search/date-filter.js";
import type { NormalizedOpportunity } from "../ingestion/types.js";
import { KEYWORD_ALIASES, KNOWN_COUNTRIES, TYPE_ALIASES } from "./filtering.constants.js";
import type {
  FilteredOpportunity,
  FilteringIntent,
  FilteringOptions,
  FilteringResult,
} from "./filtering.types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export function filterOpportunities(
  intent: FilteringIntent,
  opportunities: readonly NormalizedOpportunity[],
  options: FilteringOptions = {},
): FilteringResult {
  const results = opportunities.map((opportunity) => filterOpportunity(intent, opportunity, options));
  return {
    results,
    summary: {
      totalReceived: results.length,
      matched: results.filter((result) => result.decision === "match").length,
      unknown: results.filter((result) => result.decision === "unknown").length,
      rejected: results.filter((result) => result.decision === "mismatch").length,
    },
  };
}

export function filterOpportunity(
  intent: FilteringIntent,
  opportunity: NormalizedOpportunity,
  options: FilteringOptions = {},
): FilteredOpportunity {
  const matchedFilters: string[] = [];
  const unknownFilters: string[] = [];
  const failedFilters: string[] = [];
  const now = options.now ?? new Date();

  evaluateType(intent, opportunity, matchedFilters, failedFilters);
  evaluateKeywords(intent.keywords, opportunity, "keywords", matchedFilters, unknownFilters, failedFilters);
  evaluateLocation(intent.location, opportunity, matchedFilters, unknownFilters, failedFilters);
  evaluateMode(intent.mode, opportunity, matchedFilters, unknownFilters, failedFilters);
  evaluateDate(intent, opportunity, now, matchedFilters, unknownFilters, failedFilters);
  evaluateEligibility(intent, opportunity, matchedFilters, unknownFilters, failedFilters);
  evaluateSkills(intent.skills, opportunity, matchedFilters, unknownFilters, failedFilters);
  evaluateTypeFilters(intent, opportunity, matchedFilters, unknownFilters, failedFilters);

  const decision = failedFilters.length > 0
    ? "mismatch"
    : unknownFilters.length > 0
      ? "unknown"
      : "match";

  return {
    opportunity,
    decision,
    matchedFilters,
    unknownFilters,
    failedFilters,
  };
}

function evaluateType(
  intent: FilteringIntent,
  opportunity: NormalizedOpportunity,
  matched: string[],
  failed: string[],
): void {
  const requested = normalizeType(intent.type);
  const actual = normalizeType(opportunity.category);
  if (requested === actual) matched.push("type");
  else failed.push("type");
}

function evaluateKeywords(
  values: string[],
  opportunity: NormalizedOpportunity,
  name: string,
  matched: string[],
  unknown: string[],
  failed: string[],
): void {
  if (values.length === 0) return;
  const text = opportunityText(opportunity);
  if (values.every((value) => keywordMatches(value, text))) matched.push(name);
  else if (!text.trim()) unknown.push(name);
  else failed.push(name);
}

function evaluateLocation(
  location: FilteringIntent["location"],
  opportunity: NormalizedOpportunity,
  matched: string[],
  unknown: string[],
  failed: string[],
): void {
  if (!location || (!location.country && !location.city && !location.region)) return;
  const actual = normalizeText(opportunity.location);
  if (!actual) {
    unknown.push("location");
    return;
  }

  const requested = [location.country, location.city, location.region]
    .filter((value): value is string => Boolean(value))
    .map(normalizeText);
  if (requested.length > 0 && requested.every((value) => actual.includes(value))) {
    matched.push("location");
    return;
  }

  const requestedCountry = location.country ? normalizeText(location.country) : undefined;
  const opposingCountry = KNOWN_COUNTRIES.some((country) => actual.includes(country) && country !== requestedCountry);
  if (requestedCountry && opposingCountry) failed.push("location");
  else unknown.push("location");
}

function evaluateMode(
  requested: FilteringIntent["mode"],
  opportunity: NormalizedOpportunity,
  matched: string[],
  unknown: string[],
  failed: string[],
): void {
  if (requested === "any") return;
  const actual = opportunity.mode;
  if (!actual || actual === "any") {
    unknown.push("mode");
    return;
  }
  if (actual === requested) matched.push("mode");
  else failed.push("mode");
}

function evaluateDate(
  intent: FilteringIntent,
  opportunity: NormalizedOpportunity,
  now: Date,
  matched: string[],
  unknown: string[],
  failed: string[],
): void {
  const range = resolveDateFilter(intent.date, now);
  if (range) {
    const start = validDate(opportunity.startDate);
    const end = validDate(opportunity.endDate) ?? start;
    const deadline = validDate(opportunity.deadline);
    const futureRequest = !range.to || range.to >= startOfDay(now);
    if (!start && !end && !deadline) {
      unknown.push("date");
      if (futureRequest) unknown.push("deadline");
    }
    else if (intervalsOverlap(start ?? deadline, end ?? deadline, range.from, range.to)) matched.push("date");
    else failed.push("date");

    if (deadline && deadline < startOfDay(now) && futureRequest) failed.push("deadline");
    else if (!deadline && futureRequest && !unknown.includes("deadline")) unknown.push("deadline");
  }

  const deadlineRange = resolveDeadlineRange(intent.deadline, now);
  if (deadlineRange) {
    const deadline = validDate(opportunity.deadline);
    if (!deadline) unknown.push("deadline");
    else if (deadline >= deadlineRange.from && (!deadlineRange.to || deadline <= deadlineRange.to)) matched.push("deadline");
    else failed.push("deadline");
  }
}

function evaluateEligibility(
  intent: FilteringIntent,
  opportunity: NormalizedOpportunity,
  matched: string[],
  unknown: string[],
  failed: string[],
): void {
  const requested = intent.eligibility;
  if (!requested) return;
  const text = normalizeText(opportunity.eligibility);
  if (!text) {
    unknown.push("eligibility");
    return;
  }
  if (requested.student !== undefined) {
    const contradiction = requested.student
      ? /professionals?\s+only|not\s+for\s+students/.test(text)
      : /student\s*only|students\s*only/.test(text);
    if (contradiction) failed.push("eligibility");
    else if (requested.student && /student/.test(text)) matched.push("eligibility");
    else unknown.push("eligibility");
  } else if (requested.professional !== undefined || requested.beginner !== undefined || requested.experienceLevel || requested.ageRange) {
    unknown.push("eligibility");
  }
}

function evaluateSkills(
  skills: string[],
  opportunity: NormalizedOpportunity,
  matched: string[],
  unknown: string[],
  failed: string[],
): void {
  if (skills.length === 0) return;
  const skillData = [
    ...opportunity.skills,
    String((opportunity as unknown as Record<string, unknown>).technologies ?? ""),
  ].filter(Boolean).join(" ");
  if (skills.every((skill) => keywordMatches(skill, normalizeText(skillData)))) matched.push("skills");
  else if (!skillData.trim()) unknown.push("skills");
  else failed.push("skills");
}

function evaluateTypeFilters(
  intent: FilteringIntent,
  opportunity: NormalizedOpportunity,
  matched: string[],
  unknown: string[],
  failed: string[],
): void {
  const filters = intent.typeFilters;
  if (!filters) return;
  const candidate = opportunity as unknown as Record<string, unknown>;
  const text = opportunityText(opportunity);

  if (filters.technologies?.length) evaluateKeywords(filters.technologies, opportunity, "technologies", matched, unknown, failed);
  if (filters.field) {
    if (text.includes(normalizeText(filters.field))) matched.push("field");
    else unknown.push("field");
  }
  if (filters.prize) {
    if (normalizeText(opportunity.prize ?? "").includes(normalizeText(filters.prize))) matched.push("prize");
    else unknown.push("prize");
  }
  if (filters.paid !== undefined) evaluateBooleanFilter(filters.paid, candidate.paid, "paid", matched, unknown, failed);
  if (filters.funded !== undefined) evaluateBooleanFilter(filters.funded, candidate.funded, "funded", matched, unknown, failed);
  if (filters.teamSize) evaluateRangeFilter(filters.teamSize, candidate.teamSize, "teamSize", matched, unknown, failed);
  if (filters.duration) {
    const duration = candidate.duration;
    if (typeof duration === "string" && normalizeText(duration).includes(normalizeText(filters.duration))) matched.push("duration");
    else unknown.push("duration");
  }
}

function evaluateBooleanFilter(expected: boolean, actual: unknown, name: string, matched: string[], unknown: string[], failed: string[]): void {
  if (typeof actual !== "boolean") unknown.push(name);
  else if (actual === expected) matched.push(name);
  else failed.push(name);
}

function evaluateRangeFilter(range: { min?: number; max?: number }, actual: unknown, name: string, matched: string[], unknown: string[], failed: string[]): void {
  if (typeof actual !== "number") unknown.push(name);
  else if ((range.min === undefined || actual >= range.min) && (range.max === undefined || actual <= range.max)) matched.push(name);
  else failed.push(name);
}

function resolveDeadlineRange(filter: FilteringIntent["deadline"], now: Date): { from: Date; to?: Date } | undefined {
  if (!filter || filter.kind === "any") return undefined;
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  if (filter.kind === "custom") return { from: filter.from, to: filter.to };
  if (filter.kind === "within_days") return { from: start, to: new Date(start.getTime() + filter.days * DAY_MS) };
  if (filter.kind === "open") return { from: start };
  const days = filter.kind === "closing_this_week" ? 7 : 31;
  return { from: start, to: new Date(start.getTime() + days * DAY_MS) };
}

function intervalsOverlap(start: Date | undefined, end: Date | undefined, from?: Date, to?: Date): boolean {
  if (!start && !end) return false;
  const left = start ?? end as Date;
  const right = end ?? start as Date;
  return (!to || left <= to) && (!from || right >= from);
}

function normalizeType(value: string): string {
  const normalized = normalizeText(value);
  return TYPE_ALIASES[normalized] ?? normalized;
}

function keywordMatches(value: string, text: string): boolean {
  const normalized = normalizeText(value);
  return (KEYWORD_ALIASES[normalized] ?? [normalized]).some((alias) => text.includes(alias));
}

function opportunityText(opportunity: NormalizedOpportunity): string {
  return normalizeText([
    opportunity.title,
    opportunity.description,
    opportunity.organization,
    opportunity.location,
    opportunity.prize,
    ...opportunity.skills,
    String((opportunity as unknown as Record<string, unknown>).technologies ?? ""),
  ].join(" "));
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function validDate(value: Date | null | undefined): Date | undefined {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value : undefined;
}

function startOfDay(value: Date): Date {
  const result = new Date(value);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}
