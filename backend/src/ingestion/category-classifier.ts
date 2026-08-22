import type { NormalizedOpportunity } from "./types.js";

export type CategorySignal = "title" | "url" | "provider" | "description";
export interface CategoryInput { title?: string; url?: string; providerType?: string; description?: string; }

const categories: NormalizedOpportunity["category"][] = ["hackathon", "internship", "job", "fellowship", "scholarship", "grant", "competition", "program", "other"];
const patterns: Record<Exclude<NormalizedOpportunity["category"], "other">, RegExp[]> = {
  fellowship: [/\bfellowships?\b/i],
  internship: [/\binternships?\b/i, /\bintern\b/i, /\bco[- ]?op\b/i],
  hackathon: [/\bhackathons?\b/i],
  grant: [/\bgrants?\b/i],
  scholarship: [/\bscholarships?\b/i, /\bbursar(y|ies)\b/i],
  competition: [/\bcompetitions?\b/i, /\bcontests?\b/i],
  job: [/\bjobs?\b/i, /\bcareers?\b/i, /\bpositions?\b/i],
  program: [/\bprograms?\b/i, /\bprogrammes?\b/i, /\baccelerators?\b/i],
};
const weights: Record<CategorySignal, number> = { title: 8, url: 6, provider: 3, description: 2 };

export function classifyOpportunityCategory(input: CategoryInput): NormalizedOpportunity["category"] {
  const scores = new Map<string, number>();
  for (const category of categories) scores.set(category, 0);
  for (const [field, value] of Object.entries({ title: input.title, url: input.url, provider: input.providerType, description: input.description }) as [CategorySignal, string | undefined][]) {
    if (!value) continue;
    for (const [category, categoryPatterns] of Object.entries(patterns)) {
      if (categoryPatterns.some(pattern => pattern.test(value))) scores.set(category, (scores.get(category) ?? 0) + weights[field]);
    }
  }
  let winner: NormalizedOpportunity["category"] = "other";
  let bestScore = 0;
  for (const category of categories) {
    const score = scores.get(category) ?? 0;
    if (score > bestScore) { winner = category; bestScore = score; }
  }
  return winner;
}

/**
 * Placeholder/generic SERP artifacts that must never be stored as an
 * opportunity title even when every other field looks acceptable.
 */
const JUNK_TITLE_EXACT = new Set([
  "website", "web site", "home", "homepage", "home page", "official site", "official website",
  "read more", "learn more", "view all", "see more", "see all", "more info", "more information",
  "details", "detail", "apply now", "apply", "apply here", "register now", "register", "registration",
  "click here", "untitled", "unknown", "n/a", "na", "none", "blog", "news",
  "translate this page", "cached", "similar pages",
]);

export function isJunkTitle(title: string): boolean {
  const normalizedTitle = title.trim().toLowerCase().replace(/[\s]+/g, " ").replace(/[.:!?,;]+"?$/, "").trim();
  if (!normalizedTitle || normalizedTitle.length < 3) return true;
  return JUNK_TITLE_EXACT.has(normalizedTitle);
}

/** Titles that describe a listing/category of opportunities rather than one opportunity. */
const LISTING_TITLE_PATTERN = /^(browse|find|search|explore|discover|view|all)\s+(the\s+)?(best\s+)?(hackathons?|internships?|fellowships?|scholarships?|grants?|competitions?|jobs?|programs?|opportunities?)\b/i;

export function isListingTitle(title: string): boolean {
  return LISTING_TITLE_PATTERN.test(title.trim());
}

export interface OpportunityUrlQuality { accepted: boolean; reason?: "generic_listing_url" | "homepage_url" | "blocked_or_search_page" | "junk_title" | "listing_title"; }

const BLOCKED_FIRST_SEGMENTS = /^\/(login|signin|sign-in|signup|register|search|results|browse|categories|category|tags?|topics?|collections?|c\/|listing|list)(\/|$)/i;

/** A URL whose last path segment is a plural category word is a listing page (…/hackathons, …/jobs), not an opportunity. */
const BARE_CATEGORY_SEGMENT = /^(hackathons|internships|fellowships|scholarships|grants|competitions|jobs|careers|programs|programmes|opportunities)$/i;
const BARE_CATEGORY_SEGMENT_ANY = /^(hackathons?|internships?|fellowships?|scholarships?|grants?|competitions?|jobs?|careers?|programs?|programmes?|opportunities?)$/i;
/** Platforms whose entire business is listings: any bare category path there is a listing. */
const KNOWN_AGGREGATOR_HOST = /(^|\.)(unstop\.com|internshala\.com|devpost\.com|dorahacks\.io|devfolio\.co)$/i;
const GENERIC_PREFIXED_SEGMENT = /^(browse|search|category|categories)[-][^/]*$/i;
const GOOGLE_SERP_JUNK_PATH = /^\/(translate|search|url|amp|cache)(\/|$|\?)/i;
const GOOGLE_HOST = /(^|\.)google\.[a-z.]{2,}$/i;
/** Encyclopedias, dictionaries, social media and login-walled networks are never opportunity pages. */
const BLOCKED_HOST = /(^|\.)(wikipedia\.org|wikimedia\.org|wiktionary\.org|wikiwand\.com|merriam-webster\.com|dictionary\.cambridge\.org|collinsdictionary\.com|linguee\.[a-z.]{2,}|lawinsider\.com|reddit\.com|facebook\.com|instagram\.com|x\.com|twitter\.com|threads\.net|youtube\.com|pinterest\.[a-z.]{2,}|quora\.com|play\.google\.com|medium\.com|linkedin\.com|brightidea\.com)$/i;

export function assessOpportunityUrlQuality(url: string, title?: string): OpportunityUrlQuality {
  const normalizedTitle = title?.trim().toLowerCase() ?? "";
  if (isJunkTitle(normalizedTitle)) return { accepted: false, reason: "junk_title" };
  if (isListingTitle(normalizedTitle)) return { accepted: false, reason: "listing_title" };

  let parsed: URL;
  try { parsed = new URL(url); } catch { return { accepted: false, reason: "generic_listing_url" }; }

  const path = parsed.pathname.replace(/\/+$/, "") || "/";
  const segments = path.split("/").filter(Boolean);
  const lastSegment = segments[segments.length - 1]?.toLowerCase() ?? "";

  if (path === "/" && !isProviderDetailSubdomain(parsed.hostname)) return { accepted: false, reason: "homepage_url" };
  if (BLOCKED_HOST.test(parsed.hostname)) return { accepted: false, reason: "blocked_or_search_page" };
  if (BLOCKED_FIRST_SEGMENTS.test(path)) return { accepted: false, reason: "blocked_or_search_page" };
  if (GOOGLE_HOST.test(parsed.hostname) && GOOGLE_SERP_JUNK_PATH.test(path)) return { accepted: false, reason: "blocked_or_search_page" };

  // Devpost community/category pages are collections, never single opportunities.
  if (/^\/c(\/|$)/i.test(path) && /(^|\.)devpost\.com$/i.test(parsed.hostname)) return { accepted: false, reason: "generic_listing_url" };

  // Known aggregators: a bare category path (any depth, singular or plural) is always a listing.
  if (KNOWN_AGGREGATOR_HOST.test(parsed.hostname)) {
    const aggregatorSegments = path.split("/").filter(Boolean).map(segment => segment.toLowerCase());
    if (aggregatorSegments.length > 0 && aggregatorSegments.every(segment => BARE_CATEGORY_SEGMENT_ANY.test(segment))) {
      return { accepted: false, reason: "generic_listing_url" };
    }
  }

  // Known aggregator listing layouts.
  if (/internshala\.com$/i.test(parsed.hostname) && /^\/internships?\//i.test(path) && /(work-from-home|category|browse|search|-\d+\/?$)/i.test(path)) return { accepted: false, reason: "generic_listing_url" };

  // A path that ends in a bare category word is a listing (…/hackathons, …/jobs).
  if (BARE_CATEGORY_SEGMENT.test(lastSegment)) return { accepted: false, reason: "generic_listing_url" };
  // Listing-style compounds such as browse-scholarships or category-grants.
  if (GENERIC_PREFIXED_SEGMENT.test(lastSegment)) return { accepted: false, reason: "generic_listing_url" };

  return { accepted: true };
}

function isProviderDetailSubdomain(hostname: string): boolean {
  const labels = hostname.split(".").filter(Boolean);
  return labels.length >= 3 && !labels[0]?.toLowerCase().startsWith("www");
}

/**
 * When title/URL/description carry no signal at all ("other"), the source
 * listing's own taxonomy is trustworthy provenance: everything scraped from
 * devfolio.co/hackathons is a hackathon even when named "HackSpire'26".
 */
export function applyCategoryFallback(
  category: NormalizedOpportunity["category"],
  sourceCategory?: string,
): NormalizedOpportunity["category"] {
  if (category !== "other") return category;
  const value = sourceCategory?.trim().toLowerCase();
  if (!value) return category;
  const match = categories.find(candidate => candidate === value);
  return match ?? category;
}

/**
 * A record is worth storing only when its title carries a real opportunity
 * identity and at least some supporting signal exists beyond title+URL.
 * Junk/listing titles are rejected outright regardless of other fields.
 */
export function hasMeaningfulOpportunitySignal(title: string, fields: string[]): boolean {
  if (isJunkTitle(title) || isListingTitle(title)) return false;
  return classifyOpportunityCategory({ title }) !== "other" || fields.some(value => value.trim().length > 0);
}
