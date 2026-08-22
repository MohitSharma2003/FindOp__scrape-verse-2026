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
  // `site:` operators cannot be combined - Google intersects them and the
  // intersection is always empty. Each scoped keyword therefore becomes its
  // own query; unscoped keywords merge into the shared term base.
  const scopedKeywords = intent.keywords.filter((k) => /^site:/i.test(k.trim()));
  const plainTerms = [
    ...intent.keywords.filter((k) => !/^site:/i.test(k.trim())).slice(0, 3),
    intent.type,
    intent.location?.country,
    intent.location?.region,
    intent.location?.city,
    intent.mode === "remote" ? "online" : intent.mode === "in_person" ? "in person" : intent.mode === "hybrid" ? "hybrid" : undefined,
    dateTerm(intent, now),
  ].filter((value): value is string => Boolean(value));
  const base = plainTerms.join(" ");
  const bases = scopedKeywords.length > 0
    ? scopedKeywords.map((scope) => [scope.trim(), base].filter(Boolean).join(" "))
    : [base];
  // Direct queries outrank phrasing variants so every scope gets a slot
  // before any single scope spends extra budget on rewordings.
  const variants = [
    ...bases,
    ...bases.flatMap((scopedBase) => [
      [scopedBase, intent.mode === "remote" ? "remote" : "applications"].filter(Boolean).join(" "),
      [scopedBase, "opportunity"].join(" "),
    ]),
  ];
  return [...new Set(variants.map((query) => query.trim()).filter(Boolean))]
    .slice(0, MAX_DISCOVERY_QUERIES);
}
