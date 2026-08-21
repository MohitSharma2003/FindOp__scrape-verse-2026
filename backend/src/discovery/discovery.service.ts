import { BrightDataDiscoveryClient } from "../integrations/brightdata/brightdata.discovery.client.js";
import { parseSearchIntent } from "../search/search-intent.service.js";
import type { SearchIntent } from "../search/search-intent.schema.js";
import { buildDiscoveryQueries } from "./query-builder.js";
import type {
  CandidateUrl,
  DiscoveryClient,
  DiscoveryQueryResult,
  DiscoveryResponse,
} from "./discovery.types.js";

export const MAX_RESULTS_PER_QUERY = 20;
export const MAX_CANDIDATES = 30;

function normalizeUrl(value: unknown): URL | undefined {
  if (typeof value !== "string") return undefined;
  let input = value.trim();
  try {
    let parsed: URL;
    try {
      parsed = new URL(input);
    } catch {
      input = decodeURIComponent(input);
      parsed = new URL(input);
    }
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return undefined;
    if (parsed.hostname.toLowerCase() === "www.google.com" && parsed.pathname === "/url") {
      const destination = parsed.searchParams.get("q") ?? parsed.searchParams.get("url");
      if (destination) return normalizeUrl(destination);
    }
    for (const key of [...parsed.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_") || ["gclid", "fbclid", "ref", "source"].includes(key.toLowerCase())) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.hostname = parsed.hostname.toLowerCase();
    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    parsed.hash = "";
    return parsed;
  } catch {
    return undefined;
  }
}

export function normalizeCandidateUrl(value: unknown): string | undefined {
  return normalizeUrl(value)?.toString();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function textFromHtml(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function htmlResultItems(html: string): DiscoveryQueryResult[] {
  const items: DiscoveryQueryResult[] = [];
  const anchorPattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const rawHref = decodeHtml(match[1] ?? "");
    const content = match[2] ?? "";
    let href = rawHref;
    try {
      const parsed = new URL(rawHref, "https://www.google.com");
      if (parsed.hostname === "www.google.com" && parsed.pathname === "/url") {
        href = parsed.searchParams.get("q") ?? parsed.searchParams.get("url") ?? "";
      }
    } catch {
      continue;
    }

    if (!/^https?:\/\//i.test(href)) continue;
    const heading = content.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
    const title = heading ? textFromHtml(heading[1] ?? "") : textFromHtml(content);
    if (!title) continue;
    items.push({ link: href, title, description: "", rank: items.length + 1 });
    if (items.length >= MAX_RESULTS_PER_QUERY) break;
  }

  return items;
}

function resultItems(payload: unknown, depth = 0): DiscoveryQueryResult[] {
  if (depth > 4 || payload === null || payload === undefined) return [];
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return [];
    try {
      return resultItems(JSON.parse(trimmed) as unknown, depth + 1);
    } catch {
      return /<a\b/i.test(trimmed) ? htmlResultItems(trimmed) : [];
    }
  }
  if (Array.isArray(payload)) {
    return payload.slice(0, MAX_RESULTS_PER_QUERY).filter((item): item is DiscoveryQueryResult => Boolean(item && typeof item === "object"));
  }
  if (typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  for (const key of ["organic", "organic_results", "results"]) {
    if (Array.isArray(record[key])) {
      return record[key].slice(0, MAX_RESULTS_PER_QUERY).filter((item): item is DiscoveryQueryResult => Boolean(item && typeof item === "object"));
    }
  }
  for (const key of ["data", "body", "result", "response", "content"]) {
    const nested = resultItems(record[key], depth + 1);
    if (nested.length > 0) return nested;
  }
  return [];
}

function isObviousJunk(url: URL, title: string, description: string): boolean {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  let path = url.pathname.toLowerCase();
  try {
    path = decodeURIComponent(path);
  } catch {
    // Keep the safely parsed pathname when it contains malformed encoding.
  }
  const text = `${title} ${description}`.trim().toLowerCase();
  const exactJunkTitles = new Set([
    "sign in", "login", "log in", "search", "google search", "404 not found",
    "page not found", "access denied", "create account",
  ]);

  if (host === "accounts.google.com" && /^\/(servicelogin|login|signin|sign-in|oauth|o\/oauth2)(\/|$)/i.test(path)) return true;
  if (host === "accounts.bing.com" && /^\/(login|signin|sign-in|oauth)(\/|$)/i.test(path)) return true;
  if (/(^|\/)(login|signin|sign-in|authenticate|oauth|callback)(\/|$)/i.test(path)) return true;
  if ((host.includes("google.") || host.includes("bing.com")) && path === "/search") return true;
  if (exactJunkTitles.has(title.trim().toLowerCase())) return true;
  if (/^(404|error)\b/.test(text) || /^(page not found|access denied)\b/.test(text)) return true;
  if (host === "www.youtube.com" && path === "/watch" && /\b(top\s+\d+|how to|explained|webinar|podcast|video)\b/.test(text)) return true;
  return false;
}

function opportunityTerms(type: SearchIntent["type"]): string[] {
  switch (type) {
    case "hackathon": return ["hackathon", "hack", "challenge", "competition"];
    case "fellowship": return ["fellowship", "program", "scholarship"];
    case "internship": return ["internship", "intern", "summer program", "placement"];
    default: return [type];
  }
}

function isRelevant(item: DiscoveryQueryResult, intent: SearchIntent): boolean {
  const title = typeof item.title === "string" ? item.title : "";
  const description = typeof item.description === "string" ? item.description : typeof item.snippet === "string" ? item.snippet : "";
  const text = [title, description, item.link, item.url]
    .filter((value): value is string => typeof value === "string")
    .join(" ").toLowerCase();
  const candidateUrl = normalizeUrl(item.link ?? item.url);
  if (!candidateUrl || isObviousJunk(candidateUrl, title, description)) return false;
  const typeTerms = intent.type === "other" ? ["opportunity", "program", "application"] : opportunityTerms(intent.type);
  const keywordMatch = intent.keywords.length === 0 || intent.keywords.some((keyword) => text.includes(keyword.toLowerCase()));
  return keywordMatch && typeTerms.some((term) => text.includes(term));
}

export function extractCandidates(payload: unknown, query: string, intent: SearchIntent): CandidateUrl[] {
  const category: string = intent.type;
  return resultItems(payload).map((item, index) => {
    const url = normalizeUrl(item.link ?? item.url);
    if (!url || !isRelevant(item, intent)) return undefined;
    return {
      url: url.toString(),
      title: typeof item.title === "string" ? item.title.trim() : "",
      description: typeof item.description === "string" ? item.description.trim() : typeof item.snippet === "string" ? item.snippet.trim() : "",
      source: "web_search" as const,
      searchQuery: query,
      rank: typeof item.rank === "number" ? item.rank : index + 1,
      discoveryMetadata: { domain: url.hostname, category: category as string },
    };
  }).filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
}

export async function discoverCandidates(
  rawIntent: unknown,
  client: DiscoveryClient = new BrightDataDiscoveryClient(),
): Promise<DiscoveryResponse> {
  const intent = parseSearchIntent(rawIntent);
  const queries = buildDiscoveryQueries(intent);
  const seen = new Set<string>();
  const candidates: CandidateUrl[] = [];
  let resultsDiscovered = 0;
  let duplicatesRemoved = 0;

  for (const query of queries) {
    const payload = await client.search(query);
    const items = resultItems(payload);
    resultsDiscovered += items.length;
    for (const candidate of extractCandidates(payload, query, intent)) {
      if (seen.has(candidate.url)) {
        duplicatesRemoved += 1;
      } else if (candidates.length < MAX_CANDIDATES) {
        seen.add(candidate.url);
        candidates.push(candidate);
      }
    }
  }

  return {
    queries,
    candidates,
    metadata: {
      queriesExecuted: queries.length,
      resultsDiscovered,
      duplicatesRemoved,
      candidatesReturned: candidates.length,
    },
  };
}
