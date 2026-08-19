import { resolveDateFilter } from "../search/date-filter.js";
import type { NormalizedOpportunity } from "../ingestion/types.js";
import { RANKING_KEYWORD_ALIASES, RANKING_WEIGHTS } from "./ranking.constants.js";
import type {
  RankedOpportunity,
  RankingBreakdown,
  RankingInput,
  RankingIntent,
  RankingOptions,
  RankingResult,
  RankableFilteredOpportunity,
} from "./ranking.types.js";

export function rankOpportunities(
  intent: RankingIntent,
  input: RankingInput,
  options: RankingOptions = {},
): RankingResult {
  const filtered = "results" in input ? input.results : input;
  const results = filtered
    .filter((item): item is RankableFilteredOpportunity => item.decision !== "mismatch")
    .map((item) => scoreOpportunity(intent, item, options))
    .sort(compareRankedOpportunities);
  return { results };
}

export function scoreOpportunity(
  intent: RankingIntent,
  item: RankableFilteredOpportunity,
  options: RankingOptions = {},
): RankedOpportunity {
  const breakdown: RankingBreakdown = {
    type: scoreType(intent, item),
    keywords: scoreKeywords(intent.keywords, item, RANKING_WEIGHTS.keywords, "keywords"),
    location: scoreLocation(intent.location, item),
    mode: scoreMode(intent.mode, item),
    date: scoreDate(intent, item, options.referenceDate),
    deadline: scoreDeadline(intent, item, options.referenceDate),
    skills: scoreKeywords(intent.skills, item, RANKING_WEIGHTS.skills, "skills"),
    eligibility: scoreEligibility(intent, item.opportunity, item.unknownFilters ?? []),
    completeness: scoreCompleteness(item.opportunity),
  };
  const score = Object.values(breakdown).reduce((total, value) => total + value, 0);
  const explanation = explain(intent, item.opportunity, breakdown, item.unknownFilters ?? [], options.referenceDate);
  return {
    opportunity: item.opportunity,
    decision: item.decision,
    score,
    breakdown,
    reasons: explanation.reasons,
    uncertainties: explanation.uncertainties,
  };
}

function scoreType(intent: RankingIntent, item: RankableFilteredOpportunity): number {
  if (item.unknownFilters.includes("type")) return 0;
  const opportunity = item.opportunity;
  return normalize(intent.type) === normalize(opportunity.category) ? RANKING_WEIGHTS.type : 0;
}

function scoreKeywords(values: string[], item: RankableFilteredOpportunity, weight: number, filterName: string): number {
  if (values.length === 0) {
    if (filterName === "skills" && !readDynamic(item.opportunity, "technologies") && item.opportunity.skills.length === 0) return 2;
    return weight;
  }
  if (item.unknownFilters.includes(filterName)) return 0;
  const opportunity = item.opportunity;
  const title = normalize(opportunity.title);
  const skills = normalize([...opportunity.skills, readDynamic(opportunity, "technologies")].join(" "));
  const description = normalize(opportunity.description);
  const organization = normalize(opportunity.organization);
  const total = values.reduce((sum, value) => {
    const aliases = aliasesFor(value);
    const tier = aliases.some((alias) => title.includes(alias))
      ? 1
      : aliases.some((alias) => skills.includes(alias))
        ? 0.9
        : aliases.some((alias) => description.includes(alias))
          ? 0.65
          : aliases.some((alias) => organization.includes(alias))
            ? 0.4
            : 0;
    return sum + tier;
  }, 0);
  return round(weight * total / values.length);
}

function scoreLocation(location: RankingIntent["location"], item: RankableFilteredOpportunity): number {
  if (!location || (!location.country && !location.city && !location.region)) return item.opportunity.location.trim() ? RANKING_WEIGHTS.location : 5;
  if (item.unknownFilters.includes("location")) return 5;
  const opportunity = item.opportunity;
  const actual = normalize(opportunity.location);
  if (!actual) return 5;
  const country = location.country ? normalize(location.country) : "";
  const city = location.city ? normalize(location.city) : "";
  const region = location.region ? normalize(location.region) : "";
  if (country && city && actual.includes(country) && actual.includes(city)) return RANKING_WEIGHTS.location;
  if (country && actual.includes(country)) return 13;
  if (city && actual.includes(city)) return 12;
  if (region && actual.includes(region)) return 9;
  return 4;
}

function scoreMode(requested: RankingIntent["mode"], item: RankableFilteredOpportunity): number {
  if (requested === "any") return item.opportunity.mode ? RANKING_WEIGHTS.mode : 4;
  if (item.unknownFilters.includes("mode")) return 4;
  const opportunity = item.opportunity;
  if (!opportunity.mode || opportunity.mode === "any") return 4;
  if (opportunity.mode === requested) return RANKING_WEIGHTS.mode;
  if (opportunity.mode === "hybrid" || requested === "hybrid") return 6;
  return 0;
}

function scoreDate(intent: RankingIntent, item: RankableFilteredOpportunity, referenceDate?: Date): number {
  if (!intent.date && !item.opportunity.startDate && !item.opportunity.endDate && !item.opportunity.deadline) return 4;
  if (!intent.date) return RANKING_WEIGHTS.date;
  if (item.unknownFilters.includes("date")) return 4;
  const opportunity = item.opportunity;
  const start = validDate(opportunity.startDate);
  const end = validDate(opportunity.endDate) ?? start;
  const deadline = validDate(opportunity.deadline);
  const range = intent.date.kind === "custom"
    ? resolveDateFilter(intent.date, referenceDate ?? new Date(0))
    : referenceDate ? resolveDateFilter(intent.date, referenceDate) : undefined;
  if (!start && !end && !deadline) return 4;
  if (!range) return 6;
  const left = start ?? deadline;
  const right = end ?? deadline;
  if (!left || !right) return 4;
  if (left >= (range.from ?? left) && right <= (range.to ?? right)) return RANKING_WEIGHTS.date;
  if (overlap(left, right, range.from, range.to)) return 6;
  return 2;
}

function scoreDeadline(intent: RankingIntent, item: RankableFilteredOpportunity, referenceDate?: Date): number {
  if ((intent.deadline || intent.date) && item.unknownFilters.includes("deadline")) return 4;
  const opportunity = item.opportunity;
  const deadline = validDate(opportunity.deadline);
  if (!deadline) return 4;
  if (!intent.deadline) return 8;
  const range = referenceDate ? resolveDeadlineRange(intent.deadline, referenceDate) : undefined;
  if (!range) return 7;
  return deadline >= range.from && (!range.to || deadline <= range.to) ? 10 : 3;
}

function scoreEligibility(intent: RankingIntent, opportunity: NormalizedOpportunity, unknownFilters: string[]): number {
  if (!opportunity.eligibility.trim()) return 2;
  if (!intent.eligibility) return RANKING_WEIGHTS.eligibility;
  if (unknownFilters.includes("eligibility")) return 2;
  return opportunity.eligibility.trim() ? RANKING_WEIGHTS.eligibility : 2;
}

function scoreCompleteness(opportunity: NormalizedOpportunity): number {
  const fields: unknown[] = [
    opportunity.title, opportunity.organization, opportunity.description,
    opportunity.applicationUrl, opportunity.deadline, opportunity.startDate,
    opportunity.endDate, opportunity.location, opportunity.mode,
    opportunity.eligibility, opportunity.skills.length > 0, opportunity.prize,
  ];
  return Math.round(RANKING_WEIGHTS.completeness * fields.filter((value) => Boolean(value)).length / fields.length);
}

function explain(
  intent: RankingIntent,
  opportunity: NormalizedOpportunity,
  breakdown: RankingBreakdown,
  unknownFilters: string[],
  referenceDate?: Date,
): { reasons: string[]; uncertainties: string[] } {
  const reasons: string[] = [];
  const uncertainties: string[] = [];
  if (breakdown.type === RANKING_WEIGHTS.type) reasons.push("Exact opportunity type match");
  if (intent.keywords.length > 0 && breakdown.keywords > 0) reasons.push("Requested keywords matched in opportunity text");
  if (intent.location && breakdown.location >= 13) reasons.push("Requested location matched");
  if (intent.mode !== "any" && breakdown.mode === RANKING_WEIGHTS.mode) reasons.push(`${capitalize(intent.mode)} participation confirmed`);
  if (intent.date && breakdown.date >= 6) reasons.push("Opportunity dates overlap the requested timeframe");
  if (opportunity.deadline && breakdown.deadline >= 7) reasons.push("Known application deadline");
  if (intent.skills.length > 0 && breakdown.skills > 0) reasons.push("Requested skills matched");
  if (intent.eligibility && breakdown.eligibility > 2) reasons.push("Eligibility information is available");
  if (breakdown.completeness >= 4) reasons.push("Opportunity has useful complete information");
  for (const filter of unknownFilters) {
    uncertainties.push(`Unknown ${filter} data`);
    if (filter === "skills") uncertainties.push("Required skills could not be verified");
    if (filter === "eligibility") uncertainties.push("Eligibility information is unavailable");
    if (filter === "mode") uncertainties.push("Participation mode is unknown");
    if (filter === "location") uncertainties.push("Location is unknown");
    if (filter === "date") uncertainties.push("Event date is unknown");
    if (filter === "deadline") uncertainties.push("Application deadline is unknown");
  }
  if (intent.mode !== "any" && !opportunity.mode && !unknownFilters.includes("mode")) uncertainties.push("Participation mode is unknown");
  if ((intent.deadline || intent.date) && !opportunity.deadline && !unknownFilters.includes("deadline")) uncertainties.push("Application deadline is unknown");
  if (intent.location && !opportunity.location && !unknownFilters.includes("location")) uncertainties.push("Location is unknown");
  if (intent.date && !opportunity.startDate && !opportunity.endDate && !opportunity.deadline && !unknownFilters.includes("date")) uncertainties.push("Event date is unknown");
  if (intent.date && !referenceDate && (intent.date.kind !== "custom")) uncertainties.push("Relative date score requires an explicit reference date");
  if (opportunity.skills.length === 0 && !uncertainties.includes("Required skills could not be verified")) uncertainties.push("Required skills could not be verified");
  if (!opportunity.eligibility.trim() && !uncertainties.includes("Eligibility information is unavailable")) uncertainties.push("Eligibility information is unavailable");
  if (reasons.length === 0) reasons.push("Limited deterministic relevance evidence");
  return { reasons, uncertainties };
}

function compareRankedOpportunities(left: RankedOpportunity, right: RankedOpportunity): number {
  if (left.score !== right.score) return right.score - left.score;
  if (left.decision !== right.decision) return left.decision === "match" ? -1 : 1;
  return normalize(left.opportunity.opportunityUrl || left.opportunity.url)
    .localeCompare(normalize(right.opportunity.opportunityUrl || right.opportunity.url));
}

function capitalize(value: string): string {
  return value.replace("_", " ").replace(/^./, (character) => character.toUpperCase());
}

function resolveDeadlineRange(filter: NonNullable<RankingIntent["deadline"]>, now: Date): { from: Date; to?: Date } | undefined {
  if (filter.kind === "any") return undefined;
  const from = new Date(now);
  from.setUTCHours(0, 0, 0, 0);
  if (filter.kind === "custom") return { from: filter.from, to: filter.to };
  if (filter.kind === "within_days") return { from, to: new Date(from.getTime() + filter.days * 86400000) };
  if (filter.kind === "open") return { from };
  return { from, to: new Date(from.getTime() + (filter.kind === "closing_this_week" ? 7 : 31) * 86400000) };
}

function overlap(start: Date, end: Date, from?: Date, to?: Date): boolean {
  return (!to || start <= to) && (!from || end >= from);
}

function aliasesFor(value: string): string[] {
  const normalized = normalize(value);
  return RANKING_KEYWORD_ALIASES[normalized] ?? [normalized];
}

function readDynamic(opportunity: NormalizedOpportunity, key: string): string {
  const value = (opportunity as unknown as Record<string, unknown>)[key];
  return typeof value === "string" ? value : Array.isArray(value) ? value.join(" ") : "";
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function validDate(value: Date | null | undefined): Date | undefined {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value : undefined;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
