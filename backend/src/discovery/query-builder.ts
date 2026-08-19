import { resolveDateFilter } from "../search/date-filter.js";
import type { SearchIntent } from "../search/search-intent.schema.js";

export const MAX_DISCOVERY_QUERIES = 3;

function dateTerm(intent: SearchIntent, now: Date): string | undefined {
  if (!intent.date) return undefined;
  if (intent.date.kind === "custom") return `${intent.date.from.getUTCFullYear()}`;
  if (["next_month", "this_month"].includes(intent.date.kind)) {
    const range = resolveDateFilter(intent.date, now);
    return range?.from ? range.from.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) : undefined;
  }
  return intent.date.kind.replaceAll("_", " ");
}

export function buildDiscoveryQueries(intent: SearchIntent, now = new Date()): string[] {
  const terms = [
    ...intent.keywords.slice(0, 3),
    intent.type,
    intent.location?.country,
    intent.location?.region,
    intent.location?.city,
    intent.mode === "remote" ? "online" : intent.mode === "in_person" ? "in person" : intent.mode === "hybrid" ? "hybrid" : undefined,
    dateTerm(intent, now),
  ].filter((value): value is string => Boolean(value));
  const base = terms.join(" ");
  const variants = [
    base,
    [base, intent.mode === "remote" ? "remote" : "applications"].filter(Boolean).join(" "),
    [base, "opportunity"].join(" "),
  ];
  return [...new Set(variants.map((query) => query.trim()).filter(Boolean))]
    .slice(0, MAX_DISCOVERY_QUERIES);
}
