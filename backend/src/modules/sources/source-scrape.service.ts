import { env } from "../../config/env.js";
import { BrightDataClient, BrightDataError } from "../../integrations/brightdata/brightdata.client.js";
import { BrightDataDiscoveryClient } from "../../integrations/brightdata/brightdata.discovery.client.js";
import { ingest } from "../../ingestion/ingestion.service.js";
import type { IngestionResult } from "../../ingestion/types.js";
import { enrichSparseOpportunities } from "../../enrichment/enrichment.service.js";
import { BrightDataExtractionClient } from "../../integrations/brightdata/brightdata.extraction.client.js";
import { analyzeHealth } from "../../health/health-analyzer.js";
import type { HealthAnalysis } from "../../health/health.types.js";
import { buildDiscoveryQueries } from "../../discovery/query-builder.js";
import { extractCandidates } from "../../discovery/discovery.service.js";
import type { SearchIntent } from "../../search/search-intent.schema.js";
import {
  createScrapeRun,
  findRecentSuccessfulScrapeRunsBySource,
  findRunningScrapeRunBySource,
  updateScrapeRun,
} from "../scrape-runs/scrape-run.repository.js";
import {
  getSourceById,
  sourceRunStarted,
  updateSourceHealthService,
  markCollectorUnavailableService,
} from "./source.service.js";

export class SourceNotFoundError extends Error {}
export class SourceDisabledError extends Error {}
export class SourceScrapeInProgressError extends Error {
  public constructor() {
    super("A scrape is already running for this source");
    this.name = "SourceScrapeInProgressError";
  }
}

export type ProviderFailureKind =
  | "collector_deleted"
  | "template_missing"
  | "rate_limited"
  | "auth"
  | "transient"
  | "unknown";

export function classifyBrightDataFailure(error: unknown): ProviderFailureKind {
  if (!(error instanceof BrightDataError)) return "unknown";
  const detail = `${error.message} ${error.providerMessage ?? ""}`.toLowerCase();
  if (error.statusCode === 404 || /collector.*not found|not found.*collector|deleted/.test(detail)) return "collector_deleted";
  if (error.statusCode === 429 || /rate limit|too many requests/.test(detail)) return "rate_limited";
  if (/missing.*template|no.*template|template.*(missing|not found|does not exist)/.test(detail)) return "template_missing";
  if (error.statusCode === 401 || error.statusCode === 403) return "auth";
  if (error.statusCode !== undefined && error.statusCode >= 500) return "transient";
  return "unknown";
}

export interface SourceScrapeResult {
  scrapeRun: unknown;
  ingestion: IngestionResult;
  snapshotId: string;
  health: HealthAnalysis;
}

export class SourceScrapeFailedError extends Error {
  public constructor(
    message: string,
    public readonly scrapeRun: unknown,
    public readonly health?: HealthAnalysis,
    public readonly providerKind?: ProviderFailureKind,
  ) {
    super(message);
  }
}

export interface ScrapeSourceOptions {
  allowAutomaticHealing?: boolean;
  /** Verification runs may scrape sources that are not enabled/ready yet. */
  verificationRun?: boolean;
}

const SCRAPE_RETRY_DELAY_MS = 3_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Permanent misconfigurations are not worth retrying; transient provider
 * hiccups (timeouts, rate limits, queue congestion, 5xx) get one more shot so
 * a flaky network moment never becomes a permanent "failed" run.
 */
function isRetryableScrapeFailure(error: unknown): boolean {
  const kind = classifyBrightDataFailure(error);
  return !(kind === "auth" || kind === "collector_deleted" || kind === "template_missing");
}

async function collectRawRecords(
  source: {
    kind: string;
    collectorId?: string | null;
    url: string;
    scraperVersion?: string | null;
    category: string;
    discoveryKeywords?: string[] | null;
  },
  client: BrightDataClient,
): Promise<{ rawRecords: unknown[]; snapshotId: string }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      if (source.kind === "serp_discovery") {
        return { rawRecords: await collectDiscoveryRecords(source), snapshotId: "serp-discovery" };
      }
      const result = await client.scrape({
        collectorId: source.collectorId!,
        url: source.url,
        ...(source.scraperVersion === "dev" ? { version: "dev" as const } : {}),
      });
      return {
        rawRecords: Array.isArray(result.rawResult) ? result.rawResult : [result.rawResult],
        snapshotId: result.snapshotId,
      };
    } catch (error) {
      lastError = error;
      if (attempt >= 2 || !isRetryableScrapeFailure(error)) throw error;
      console.warn("Transient scrape failure — retrying once", {
        attempt,
        waitMs: SCRAPE_RETRY_DELAY_MS,
        message: error instanceof Error ? error.message : String(error),
      });
      await delay(SCRAPE_RETRY_DELAY_MS);
    }
  }
  throw lastError;
}

export async function scrapeSource(
  id: string,
  options: ScrapeSourceOptions = {},
): Promise<SourceScrapeResult> {
  console.log("Scrape started", { sourceId: id });
  const source = await getSourceById(id);

  if (!source) {
    throw new SourceNotFoundError("Source not found");
  }

  if (!source.enabled && !options.verificationRun) {
    throw new SourceDisabledError("Source is disabled");
  }

  if (source.kind !== "serp_discovery" && !source.collectorId) {
    throw new SourceNotFoundError("Source has no Bright Data collector configured");
  }

  // Overlap guard: verification scrapes (self-healing) may run alongside an
  // active run; regular scheduled/manual scrapes may not duplicate one.
  if (!options.verificationRun && await findRunningScrapeRunBySource(id)) {
    throw new SourceScrapeInProgressError();
  }

  const startedAt = new Date();
  const runningScrapeRun = await createScrapeRun({
    sourceId: id,
    startedAt,
    status: "running",
    recordsFound: 0,
    recordsValid: 0,
    recordsRejected: 0,
    duplicatesFound: 0,
    recordsPersisted: 0,
    validationErrors: [],
    healthReasons: [],
    healingAttempts: 0,
    healingHistory: [],
  });

  await sourceRunStarted(id, startedAt);

  const client = new BrightDataClient({
    apiToken: env.BRIGHT_DATA_API_TOKEN,
    timeoutMs: env.BRIGHT_DATA_TIMEOUT_MS,
    pollIntervalMs: env.BRIGHT_DATA_POLL_INTERVAL_MS,
  });

  try {
    // Both source kinds feed the SAME ingestion pipeline; only raw-record
    // collection differs (DCA collector vs SERP discovery + extraction).
    // Collection is retry-wrapped so transient provider failures don't turn
    // into permanent failed runs.
    const { rawRecords, snapshotId } = await collectRawRecords(source, client);
    const ingestion = await ingest(rawRecords, {
      sourceId: id,
      sourceUrl: source.url,
      sourceCategory: source.category,
    });
    console.log("Ingestion completed", {
      sourceId: id,
      recordsFound: ingestion.recordsFound,
      recordsValid: ingestion.recordsValid,
      recordsRejected: ingestion.recordsRejected,
      duplicatesFound: ingestion.duplicatesFound,
    });
    // Listing-derived records are often title+URL only; top up the sparsest
    // ones in the background without blocking or failing this scrape.
    if (ingestion.recordsPersisted > 0 && env.BRIGHT_DATA_API_TOKEN && env.BRIGHT_DATA_EXTRACTION_COLLECTOR_ID) {
      void enrichSparseOpportunities(new BrightDataExtractionClient())
        .then((summary) => {
          if (summary.enriched > 0) {
            console.log("Enrichment completed", { sourceId: id, ...summary });
          }
        })
        .catch((error) => console.log("Enrichment skipped", {
          sourceId: id,
          error: error instanceof Error ? error.message : String(error),
        }));
    }
    const history = await findRecentSuccessfulScrapeRunsBySource(id, 5);
    const health = analyzeHealth({
      recordsFound: ingestion.recordsFound,
      recordsValid: ingestion.recordsValid,
      recordsRejected: ingestion.recordsRejected,
      // A discovery/collector run returning literally zero records is a
      // zero-records failure: the source is expected to produce opportunities.
      zeroRecordsFailure: ingestion.recordsFound === 0,
      historicalSuccessfulRuns: history.map((run) => ({
        recordsFound: run.recordsFound,
      })),
    });
    const completedAt = new Date();
    const status = health.status === "failed"
      ? "failed"
      : ingestion.recordsRejected > 0
        ? "partial"
        : "success";
    const scrapeRun = await updateScrapeRun(runningScrapeRun._id.toString(), {
      completedAt,
      status,
      recordsFound: ingestion.recordsFound,
      recordsValid: ingestion.recordsValid,
      recordsRejected: ingestion.recordsRejected,
      duplicatesFound: ingestion.duplicatesFound,
      recordsPersisted: ingestion.recordsPersisted,
      validationErrors: formatValidationErrors(ingestion),
      error: health.status === "failed" ? health.reasons.join(", ") : undefined,
      health,
    });

    await updateSourceHealthService(id, completedAt, health);

    console.log("Scrape completed", { sourceId: id, status, health: health.status });

    if (status === "failed") {
      await maybeStartAutomaticHealing(
        id,
        runningScrapeRun._id.toString(),
        options.allowAutomaticHealing !== false,
      );
      throw new SourceScrapeFailedError(
        health.reasons.join(", ") || "Scrape health failed",
        scrapeRun,
        health,
      );
    }

    return {
      scrapeRun,
      ingestion,
      snapshotId,
      health,
    };
  } catch (error: unknown) {
    if (error instanceof SourceScrapeFailedError) {
      throw error;
    }

    const completedAt = new Date();
    const reason = error instanceof Error ? error.message : "Unknown scrape error";
    const providerKind = classifyBrightDataFailure(error);
    if (providerKind === "collector_deleted") {
      await markCollectorUnavailableService(id, `Collector unavailable (deleted or invalid): ${reason}`, source.collectorId ?? undefined);
    }
    const health = analyzeHealth({
      recordsFound: 0,
      recordsValid: 0,
      recordsRejected: 0,
      executionFailed: true,
      zeroRecordsFailure: false,
    });
    const scrapeRun = await updateScrapeRun(runningScrapeRun._id.toString(), {
      completedAt,
      status: "failed",
      error: reason,
      health,
    });

    await updateSourceHealthService(id, completedAt, health);
    console.error("Scrape failed", { sourceId: id, message: reason, providerKind });
    await maybeStartAutomaticHealing(
      id,
      runningScrapeRun._id.toString(),
      options.allowAutomaticHealing !== false,
    );
    throw new SourceScrapeFailedError(reason, scrapeRun, health, providerKind);
  }
}

/**
 * SERP-discovery sources: run category queries through the Bright Data SERP
 * API, keep relevant individual-opportunity URLs, then extract each URL with
 * the generic extraction collector. Raw records feed the shared ingest().
 */
/** Extract the scoped domain from a `site:` discovery keyword, if any. */
function scopedDomainFromKeywords(keywords: string[] | null | undefined): string | undefined {
  for (const keyword of keywords ?? []) {
    const match = /^site:([a-z0-9.-]+)$/i.exec(keyword.trim());
    if (match?.[1]) return match[1].toLowerCase().replace(/^www\./i, "");
  }
  return undefined;
}

function sameDomain(url: string, domain: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./i, "");
    return host === domain || host.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

export async function collectDiscoveryRecords(
  source: { category: string; discoveryKeywords?: string[] | null },
): Promise<unknown[]> {
  if (!env.BRIGHT_DATA_API_TOKEN) throw new BrightDataError("BRIGHT_DATA_API_TOKEN is not configured");
  if (!env.BRIGHT_DATA_EXTRACTION_COLLECTOR_ID) {
    throw new BrightDataError("BRIGHT_DATA_EXTRACTION_COLLECTOR_ID is not configured");
  }

  const intent = {
    type: source.category,
    // Full keywords (incl. `site:` filters) scope the SERP queries. Relevance
    // matching inside extractCandidates ignores `site:` operators because no
    // result text contains them literally; category terms decide relevance.
    keywords: (source.discoveryKeywords ?? []).slice(0, 5),
    mode: "any",
    skills: [],
  } as unknown as SearchIntent;

  // A `site:`-scoped source must only ingest pages from that domain — SERP
  // results routinely leak aggregators/news/social pages whose extraction
  // yields untitled junk and listing URLs, poisoning validation rates.
  const scopeDomain = scopedDomainFromKeywords(source.discoveryKeywords);

  const discoveryClient = new BrightDataDiscoveryClient();
  const extractionClient = new BrightDataExtractionClient();

  const seen = new Set<string>();
  const candidateUrls: string[] = [];
  const rawRecords: unknown[] = [];

  for (const query of buildDiscoveryQueries(intent)) {
    if (candidateUrls.length >= env.SERP_DISCOVERY_CANDIDATE_LIMIT) break;
    const payload = await discoveryClient.search(query);
    // Relevance uses category terms + the junk filter only: discovery
    // keywords (incl. `site:` scopes and date phrases) belong to the query,
    // never to literal result-text matching.
    const relevanceIntent = { ...intent, keywords: [] } as SearchIntent;
    for (const candidate of extractCandidates(payload, query, relevanceIntent)) {
      if (seen.has(candidate.url)) continue;
      seen.add(candidate.url);
      if (scopeDomain && !sameDomain(candidate.url, scopeDomain)) continue;
      if (candidateUrls.length < env.SERP_DISCOVERY_CANDIDATE_LIMIT) {
        candidateUrls.push(candidate.url);
      }
    }
  }

  console.log("Discovery candidates selected", {
    sourceCategory: source.category,
    candidates: candidateUrls.length,
  });

  // One failed page must not sink the whole run; its absence simply means
  // fewer records for health analysis to evaluate.
  const results = await Promise.all(
    candidateUrls.map(async (url) => {
      try {
        return await extractionClient.extract(url);
      } catch (error) {
        console.log("Candidate extraction failed", {
          url,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    }),
  );
  for (const item of results) {
    if (Array.isArray(item)) rawRecords.push(...item);
    else if (item !== null && item !== undefined) rawRecords.push(item);
  }

  return rawRecords;
}

async function maybeStartAutomaticHealing(
  sourceId: string,
  scrapeRunId: string,
  enabled: boolean,
): Promise<void> {
  if (!enabled || !env.SELF_HEALING_ENABLED) {
    return;
  }

  try {
    const { startHealing } = await import("../../healing/healing.service.js");
    await startHealing(sourceId, scrapeRunId, { allowAutomaticHealing: false });
  } catch {
    // The failed scrape remains recorded; automatic healing must not mask it.
  }
}

function formatValidationErrors(result: IngestionResult): string[] {
  return result.validationErrors.map(
    (issue) => `record ${issue.index}: ${issue.reason}`,
  );
}
