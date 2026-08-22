import { DemoScrape } from "./demo.model.js";
import { DemoScraper } from "./demo-scraper.model.js";
import { BrightDataExtractionClient } from "../integrations/brightdata/brightdata.extraction.client.js";
import { BrightDataDiscoveryClient } from "../integrations/brightdata/brightdata.discovery.client.js";
import { validateRawRecord } from "../ingestion/validator.js";
import { normalizeRecord } from "../ingestion/normalizer.js";
import { buildDiscoveryQueries } from "../discovery/query-builder.js";
import { extractCandidates } from "../discovery/discovery.service.js";
import type { SearchIntent } from "../search/search-intent.schema.js";
import type { CandidateUrl } from "../discovery/discovery.types.js";
import { Source } from "../modules/sources/source.model.js";
import {
  DEMO_CANDIDATE_LIMIT,
  DEMO_DEFAULT_CONFIG,
  DEMO_MAX_HEALING_ATTEMPTS,
  classifyRecordAgainstConfig,
  computeRunVerdict,
  decideHealOutcome,
  isDemoRunInFlight,
  parseDemoTarget,
  pickBreakCategory,
  buildDemoDiscoveryKeywords,
  validateDemoConfigInput,
  type DemoCategory,
  type DemoConfig,
} from "./demo.logic.js";

export class DemoScrapeFailedError extends Error {}
export class DemoInvalidStateError extends Error {}

export interface SandboxExtractionClient {
  extract(candidateUrl: string): Promise<unknown>;
}

export interface SandboxDiscoveryClient {
  search(query: string): Promise<unknown>;
}

const defaultExtractionClient: SandboxExtractionClient = new BrightDataExtractionClient();
const defaultDiscoveryClient: SandboxDiscoveryClient = new BrightDataDiscoveryClient();
const HISTORY_LIMIT = 10;

type SandboxRecord = {
  title: string;
  url: string;
  category: string;
  organization?: string;
  location?: string;
  mode?: string;
  deadline?: Date | null;
  description?: string;
  signalCategory?: string;
};

type SandboxFailure = { url: string; error: string };

type SandboxDoc = {
  _id: unknown;
  scraperId?: unknown;
  config: DemoConfig & { domain?: string };
  originalConfig?: { url: string; category: string } | null;
  status:
    | "queued"
    | "discovering"
    | "extracting"
    | "healthy"
    | "broken"
    | "healing"
    | "recovered"
    | "escalated"
    | "failed";
  progress?: { step?: string; done?: number; total?: number };
  discoveredUrls: string[];
  extractionFailures: SandboxFailure[];
  records: SandboxRecord[];
  stats: { found: number; valid: number; rejected: number };
  validationErrors: string[];
  healingAttempts: number;
  healingTimeline: { step: string; detail?: string; at?: Date }[];
  scrapedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
};

function toRawRecords(payload: unknown): unknown[] {
  return Array.isArray(payload) ? payload : [payload];
}

async function latestRun(): Promise<SandboxDoc | null> {
  return DemoScrape.findOne().sort({ createdAt: -1 }).lean<SandboxDoc>();
}

/** A run with no writes for this long is considered dead (e.g. server restart mid-run). */
const STALL_TIMEOUT_MS = 5 * 60_000;

function stalledOut(doc: SandboxDoc): boolean {
  if (!isDemoRunInFlight(doc.status)) return false;
  const lastTouch = doc.updatedAt ?? doc.createdAt;
  if (!lastTouch) return false;
  return Date.now() - new Date(lastTouch).getTime() > STALL_TIMEOUT_MS;
}

export async function getDemoState(): Promise<SandboxDoc> {
  let doc = await latestRun();
  if (doc && stalledOut(doc)) {
    await DemoScrape.findByIdAndUpdate(doc._id, {
      $set: { status: "failed", progress: { step: "done", done: 0, total: 0 } },
      $push: { healingTimeline: [{ step: "run_failed", detail: "Run stalled and was reaped by the sandbox watchdog", at: new Date() }] },
    });
    doc = await latestRun();
  }
  return doc ?? createDefaultRun();
}

async function createDefaultRun(): Promise<SandboxDoc> {
  await DemoScrape.create({
    config: { ...DEMO_DEFAULT_CONFIG },
    status: "healthy",
    records: [],
    stats: { found: 0, valid: 0, rejected: 0 },
    validationErrors: [],
    healingTimeline: [],
  });
  const doc = await latestRun();
  if (!doc) throw new DemoScrapeFailedError("Sandbox initialization failed");
  return doc;
}

function assertNotInFlight(doc: SandboxDoc): void {
  if (isDemoRunInFlight(doc.status)) {
    throw new DemoInvalidStateError(
      `A sandbox run is already ${doc.status} — watch it finish first.`,
    );
  }
}

function extractRecords(payload: unknown[], config: DemoConfig) {
  const rawRecords = Array.isArray(payload) ? payload : [payload];
  const errors: string[] = [];
  const views = [] as ReturnType<typeof classifyRecordAgainstConfig>[];
  let rejected = 0;
  const context = { sourceId: "demo-sandbox", sourceUrl: config.url, sourceCategory: config.category };

  rawRecords.forEach((raw, index) => {
    const validation = validateRawRecord(raw);
    if (!validation.valid || !validation.candidate) {
      rejected += 1;
      errors.push(`record ${index}: ${validation.reason ?? "invalid record"}`);
      return;
    }
    views.push(classifyRecordAgainstConfig(normalizeRecord(validation.candidate, context), config));
  });

  return { views, verdict: computeRunVerdict(views), found: rawRecords.length, rejected, errors };
}

function recordViewsToSubdocs(views: ReturnType<typeof classifyRecordAgainstConfig>[], categoryOverride?: DemoCategory) {
  return views.map((view) => ({
    title: view.title,
    url: view.url,
    category: categoryOverride ?? view.category,
    organization: view.organization,
    location: view.location,
    mode: view.mode ?? undefined,
    deadline: view.deadline ?? undefined,
    description: view.description,
    signalCategory: view.signalCategory ?? undefined,
  }));
}

/**
 * The exact production discovery flow, scoped to one site: SERP queries built
 * from `site:<domain>` + the scraper's anchor category, relevance-filtered
 * candidate URLs, then a parallel extraction fan-out. Discovery deliberately
 * ignores the LIVE config category — a poisoned config must still discover
 * the same pages so classification can contradict it.
 */
async function runSandboxPipeline(
  target: { inputUrl: string; domain: string },
  discoveryCategory: string,
  classificationConfig: DemoConfig,
  discovery: SandboxDiscoveryClient = defaultDiscoveryClient,
  extraction: SandboxExtractionClient = defaultExtractionClient,
  hooks: {
    onDiscovering?: () => void;
    onDiscovered?: (urls: string[]) => void;
    onExtractProgress?: (done: number, total: number) => void;
  } = {},
  preDiscoveredUrls?: string[],
): Promise<{ rawRecords: unknown[]; discoveredUrls: string[]; failures: SandboxFailure[] }> {
  hooks.onDiscovering?.();

  const seen = new Set<string>();
  const candidates: CandidateUrl[] = [];

  if (preDiscoveredUrls && preDiscoveredUrls.length > 0) {
    // Warm cache: reuse recently verified page URLs and skip the SERP entirely.
    for (const url of preDiscoveredUrls.slice(0, DEMO_CANDIDATE_LIMIT)) {
      if (seen.has(url)) continue;
      seen.add(url);
      candidates.push({
        url,
        title: "",
        description: "",
        source: "web_search",
        searchQuery: "cache",
        rank: candidates.length,
        discoveryMetadata: { domain: target.domain, category: discoveryCategory },
      });
    }
  } else {
    const intent = {
      type: discoveryCategory,
      keywords: buildDemoDiscoveryKeywords(target.domain),
      mode: "any",
      skills: [],
    } as unknown as SearchIntent;
    const relevanceIntent = { ...intent, keywords: [] } as unknown as SearchIntent;

    for (const query of buildDiscoveryQueries(intent)) {
      if (candidates.length >= DEMO_CANDIDATE_LIMIT) break;
      hooks.onDiscovering?.();
      let payload: unknown;
      try {
        payload = await discovery.search(query);
      } catch {
        continue;
      }
      for (const candidate of extractCandidates(payload, query, relevanceIntent)) {
        if (seen.has(candidate.url)) continue;
        seen.add(candidate.url);
        const host = safeHost(candidate.url);
        if (!host || !(host === target.domain || host.endsWith(`.${target.domain}`))) continue;
        if (candidates.length < DEMO_CANDIDATE_LIMIT) candidates.push(candidate);
      }
    }
  }

  const discoveredUrls = candidates.map((candidate) => candidate.url);
  hooks.onDiscovered?.(discoveredUrls);

  if (discoveredUrls.length === 0) {
    return { rawRecords: [], discoveredUrls, failures: [] };
  }

  const results = await Promise.all(
    discoveredUrls.map(async (url, index) => {
      try {
        const payload = await extraction.extract(url);
        hooks.onExtractProgress?.(index + 1, discoveredUrls.length);
        return { url, payload };
      } catch (error) {
        return {
          url,
          payload: undefined,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );

  const rawRecords: unknown[] = [];
  const failures: SandboxFailure[] = [];
  for (const result of results) {
    if ("error" in result && result.error !== undefined) {
      failures.push({ url: result.url, error: result.error });
      continue;
    }
    rawRecords.push(...toRawRecords(result.payload));
  }

  return { rawRecords, discoveredUrls, failures };
}

function safeHost(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./i, "");
  } catch {
    return undefined;
  }
}

async function markFailed(runId: unknown, message: string): Promise<void> {
  await DemoScrape.findByIdAndUpdate(runId, {
    $set: { status: "failed" },
    $push: { healingTimeline: [{ step: "run_failed", detail: message.slice(0, 300), at: new Date() }] },
  });
}

export async function scrapeDemo(
  input?: { url?: string; category?: string },
  clients: { discovery?: SandboxDiscoveryClient; extraction?: SandboxExtractionClient } = {},
): Promise<SandboxDoc> {
  const previous = await getDemoState();
  assertNotInFlight(previous);

  const targetInput = input?.url ?? previous.config.url ?? DEMO_DEFAULT_CONFIG.url;
  const parsedTarget = parseDemoTarget(targetInput);
  if (!parsedTarget.ok) throw new DemoInvalidStateError(parsedTarget.error);

  const categoryInput = input?.category ?? previous.config.category ?? DEMO_DEFAULT_CONFIG.category;
  if (typeof categoryInput !== "string" || !isValidCategory(categoryInput)) {
    throw new DemoInvalidStateError("category must be one of: hackathon, internship, job, fellowship, scholarship, grant, competition, program, other");
  }

  const config: DemoConfig = { url: parsedTarget.target.inputUrl, category: categoryInput };

  const scraper = await DemoScraper.findOneAndUpdate(
    { domain: parsedTarget.target.domain },
    {
      $set: { inputUrl: config.url, category: config.category, lastRunAt: new Date() },
      $inc: { runCount: 1 },
      $setOnInsert: { name: `${parsedTarget.target.domain} · ${config.category}`, anchorCategory: config.category },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean<{ _id: unknown; anchorCategory?: string; lastDiscovery?: { urls?: string[]; at?: Date } | null }>();

  // Discovery is anchored to what the scraper was born as, so a poisoned
  // config still discovers the same pages and gets contradicted by them.
  let anchorCategory = scraper.anchorCategory;
  const originalCategory = previous.originalConfig?.category;
  if (!anchorCategory && typeof originalCategory === "string" && isValidCategory(originalCategory)) {
    anchorCategory = originalCategory;
  }
  if (!anchorCategory) anchorCategory = config.category;
  if (scraper.anchorCategory !== anchorCategory) {
    void DemoScraper.updateOne({ _id: scraper._id }, { $set: { anchorCategory } }).catch((error: unknown) => {
      console.error("[demo] anchor backfill failed:", error instanceof Error ? error.message : error);
    });
  }
  const discoveryCategory = anchorCategory;

  // Warm discovery cache: only trust it when it can still satisfy the full
  // candidate budget — a short cache must not starve deeper runs.
  const DISCOVERY_CACHE_TTL_MS = 15 * 60_000;
  const cachedDiscovery =
    scraper.lastDiscovery?.at &&
    Array.isArray(scraper.lastDiscovery.urls) &&
    scraper.lastDiscovery.urls.length >= DEMO_CANDIDATE_LIMIT &&
    Date.now() - new Date(scraper.lastDiscovery.at).getTime() < DISCOVERY_CACHE_TTL_MS
      ? (scraper.lastDiscovery.urls ?? [])
      : undefined;

  const created = await DemoScrape.create({
    scraperId: scraper._id,
    config: { ...config, domain: parsedTarget.target.domain },
    originalConfig: previous.originalConfig ?? { url: previous.config.url, category: previous.config.category },
    status: "queued",
    progress: { step: "queued", done: 0, total: 0 },
    records: [],
    stats: { found: 0, valid: 0, rejected: 0 },
    validationErrors: [],
    healingTimeline: [],
    scrapedAt: new Date(),
  });

  void processScrapeRun(created._id, parsedTarget.target, discoveryCategory, config, clients, scraper._id, cachedDiscovery).catch(() => undefined);
  return ((await latestRun())!);
}

async function processScrapeRun(
  runId: unknown,
  target: { inputUrl: string; domain: string },
  discoveryCategory: string,
  config: DemoConfig,
  clients: { discovery?: SandboxDiscoveryClient; extraction?: SandboxExtractionClient },
  scraperId?: unknown,
  preDiscoveredUrls?: string[],
): Promise<void> {
  let pendingDiscoverUpdate: Promise<unknown> = Promise.resolve();
  try {
    await DemoScrape.findByIdAndUpdate(runId, { $set: { status: "discovering", progress: { step: "discovering", done: 0, total: 0 } } });

    const { rawRecords, discoveredUrls, failures } = await runSandboxPipeline(target, discoveryCategory, config, clients.discovery, clients.extraction, {
      onDiscovering: () => {
        pendingDiscoverUpdate = DemoScrape.findByIdAndUpdate(runId, { $set: { status: "discovering", progress: { step: "discovering", done: 0, total: 0 } } })
          .catch((error: unknown) => {
            console.error("[demo] heartbeat failed:", error instanceof Error ? error.message : error);
          });
      },
      onDiscovered: (urls) => {
        const warm = Boolean(preDiscoveredUrls?.length);
        pendingDiscoverUpdate = DemoScrape.findByIdAndUpdate(runId, {
          $set: { discoveredUrls: urls, status: "extracting", progress: { step: "extracting", done: 0, total: urls.length } },
          $push: {
            healingTimeline: [{
              step: "discovered",
              detail: urls.length > 0
                ? warm
                  ? `Warm start — reusing ${urls.length} recently verified page${urls.length === 1 ? "" : "s"} on ${target.domain}`
                  : `SERP discovery found ${urls.length} relevant page${urls.length === 1 ? "" : "s"} on ${target.domain}`
                : `No relevant ${discoveryCategory} pages found on ${target.domain}`,
              at: new Date(),
            }],
          },
        }).catch((error: unknown) => {
          console.error("[demo] discovered-state update failed:", error instanceof Error ? error.message : error);
        });
      },
      onExtractProgress: (done, total) => {
        void DemoScrape.findByIdAndUpdate(runId, { $set: { status: "extracting", progress: { step: "extracting", done, total } } })
          .catch((error: unknown) => {
            console.error("[demo] progress update failed:", error instanceof Error ? error.message : error);
          });
      },
    });
    await pendingDiscoverUpdate;

    if (discoveredUrls.length === 0) {
      await DemoScrape.findByIdAndUpdate(runId, {
        $set: { status: "failed", scrapedAt: new Date(), stats: { found: 0, valid: 0, rejected: 0 }, progress: { step: "done", done: 0, total: 0 }, extractionFailures: failures },
      });
      return;
    }

    const { views, verdict, found, rejected, errors } = extractRecords(rawRecords, config);
    await DemoScrape.findByIdAndUpdate(runId, {
      $set: {
        status: verdict.status,
        records: recordViewsToSubdocs(views),
        stats: { found, valid: views.length, rejected },
        validationErrors: [...errors],
        extractionFailures: failures,
        scrapedAt: new Date(),
        progress: { step: "verdict", done: discoveredUrls.length, total: discoveredUrls.length },
      },
      $push: {
        healingTimeline: [{
          step: "verified",
          detail: verdict.status === "healthy"
            ? `${views.length} valid record${views.length === 1 ? "" : "s"} consistent with "${config.category}"`
            : `${verdict.conflictCount}/${verdict.classifiedCount} records contradict "${config.category}"`,
          at: new Date(),
        }],
      },
    });
    if (scraperId && discoveredUrls.length > 0) {
      // Durable copy for easy retrieval — only verified-healthy results are kept.
      void DemoScraper.findByIdAndUpdate(scraperId, {
        $set: {
          lastDiscovery: { urls: discoveredUrls, at: new Date() },
          ...(verdict.status === "healthy"
            ? { lastRecords: recordViewsToSubdocs(views), lastStats: { found, valid: views.length, rejected } }
            : {}),
        },
      }).catch((error: unknown) => {
        console.error("[demo] scraper cache write failed:", error instanceof Error ? error.message : error);
      });
    }
  } catch (error) {
    await markFailed(runId, error instanceof Error ? error.message : "Unknown sandbox failure");
  }
}

export async function healDemo(
  clients: { discovery?: SandboxDiscoveryClient; extraction?: SandboxExtractionClient } = {},
): Promise<SandboxDoc> {
  const doc = await getDemoState();

  if (!["broken", "escalated"].includes(doc.status)) {
    throw new DemoInvalidStateError(
      `Healing requires a broken scraper; current status is "${doc.status}". Break the scraper first.`,
    );
  }
  assertNotInFlight(doc);

  const attempts = (doc.healingAttempts ?? 0) + 1;
  const conflictCount = doc.records.filter(
    (r) => r.signalCategory !== undefined && r.signalCategory !== null && r.signalCategory !== doc.config.category,
  ).length;

  // Heal must re-discover with the scraper's identity taxonomy, not the
  // poisoned config — otherwise SERP would search for pages that never existed.
  const scraper = doc.scraperId
    ? await DemoScraper.findById(doc.scraperId).lean<{ anchorCategory?: string } | null>()
    : null;
  const discoveryCategory = scraper?.anchorCategory ?? doc.originalConfig?.category ?? doc.config.category;

  await DemoScrape.findByIdAndUpdate(doc._id, {
    $set: { status: "healing", healingAttempts: attempts, progress: { step: "healing", done: 0, total: 0 } },
    $push: {
      healingTimeline: [
        { step: "diagnosed", detail: `${conflictCount}/${doc.records.length} records conflict with configured category "${doc.config.category}"`, at: new Date() },
        { step: "repair_started", detail: `Fresh discovery + extraction, attempt ${attempts}/${DEMO_MAX_HEALING_ATTEMPTS}`, at: new Date() },
      ],
    },
  });

  void processHealRun(doc._id, doc.config, discoveryCategory, conflictCount, attempts, doc.scraperId, clients).catch(() => undefined);
  return (await latestRun())!;
}

async function processHealRun(
  runId: unknown,
  config: DemoConfig & { domain?: string },
  discoveryCategory: string,
  conflictCountBefore: number,
  attempts: number,
  scraperId?: unknown,
  clients: { discovery?: SandboxDiscoveryClient; extraction?: SandboxExtractionClient } = {},
): Promise<void> {
  let pendingDiscoverUpdate: Promise<unknown> = Promise.resolve();
  try {
    const domain = config.domain || safeHost(config.url) || "";
    const { rawRecords, discoveredUrls, failures } = await runSandboxPipeline({ inputUrl: config.url, domain }, discoveryCategory, config, clients.discovery, clients.extraction, {
      onDiscovered: (urls) => {
        pendingDiscoverUpdate = DemoScrape.findByIdAndUpdate(runId, {
          $set: { discoveredUrls: urls, progress: { step: "re_extracting", done: 0, total: urls.length } },
        }).catch((error: unknown) => {
          console.error("[demo] heal discovered-state update failed:", error instanceof Error ? error.message : error);
        });
      },
      onExtractProgress: (done, total) => {
        void DemoScrape.findByIdAndUpdate(runId, { $set: { progress: { step: "re_extracting", done, total } } })
          .catch((error: unknown) => {
            console.error("[demo] heal progress update failed:", error instanceof Error ? error.message : error);
          });
      },
    });
    await pendingDiscoverUpdate;

    if (discoveredUrls.length === 0) {
      const failed = attempts >= DEMO_MAX_HEALING_ATTEMPTS;
      await DemoScrape.findByIdAndUpdate(runId, {
        $set: { status: failed ? "escalated" : "broken" },
        $push: { healingTimeline: [{ step: failed ? "escalated" : "attempt_failed", detail: "Heal run discovered no verifiable pages", at: new Date() }] },
      });
      return;
    }

    const repaired = extractRecords(rawRecords, config);
    const signalViews = repaired.views.map((view) => ({ ...view, conflictsWithConfig: false }));
    const afterVerdict = computeRunVerdict(signalViews);
    const decision = decideHealOutcome({
      verdictBefore: { status: "broken", classifiedCount: repaired.views.length, conflictCount: conflictCountBefore, signalMajorityCategory: null, evidence: [] },
      verdictAfter: afterVerdict,
      attempts,
    });

    const recovered = decision.outcome === "recovered";
    const timelinePush = recovered
      ? [
          { step: "verified", detail: decision.reason, at: new Date() },
          { step: "recovered", detail: `Scraper configuration corrected to "${decision.correctedCategory}"`, at: new Date() },
        ]
      : [{ step: "verification_failed", detail: decision.reason, at: new Date() }];

    await DemoScrape.findByIdAndUpdate(runId, {
      $set: {
        status: recovered ? "recovered" : attempts >= DEMO_MAX_HEALING_ATTEMPTS ? "escalated" : "broken",
        ...(recovered && decision.correctedCategory ? { "config.category": decision.correctedCategory } : {}),
        records: recordViewsToSubdocs(repaired.views, recovered ? (decision.correctedCategory ?? undefined) : undefined),
        stats: { found: repaired.found, valid: repaired.views.length, rejected: repaired.rejected },
        validationErrors: repaired.errors,
        extractionFailures: failures,
        scrapedAt: new Date(),
        progress: { step: "done", done: discoveredUrls.length, total: discoveredUrls.length },
      },
      $push: { healingTimeline: timelinePush },
    });
    if (recovered && decision.correctedCategory && scraperId) {
      await DemoScraper.findByIdAndUpdate(scraperId, {
        $set: {
          category: decision.correctedCategory,
          lastDiscovery: { urls: discoveredUrls, at: new Date() },
          lastRecords: recordViewsToSubdocs(repaired.views, decision.correctedCategory),
          lastStats: { found: repaired.found, valid: repaired.views.length, rejected: repaired.rejected },
        },
      }).catch((error: unknown) => {
        console.error("[demo] scraper category sync failed:", error instanceof Error ? error.message : error);
      });
    }
  } catch (error) {
    const failed = attempts >= DEMO_MAX_HEALING_ATTEMPTS;
    await DemoScrape.findByIdAndUpdate(runId, {
      $set: { status: failed ? "escalated" : "broken" },
      $push: { healingTimeline: [{ step: failed ? "escalated" : "attempt_failed", detail: (error instanceof Error ? error.message : "Heal failed").slice(0, 300), at: new Date() }] },
    });
  }
}

/** One-click sabotage for judges: poison the configured category. */
export async function breakDemo(): Promise<SandboxDoc> {
  const doc = await getDemoState();
  assertNotInFlight(doc);
  if (doc.records.length === 0 && !["healthy", "broken", "escalated"].includes(doc.status)) {
    throw new DemoInvalidStateError("Scrape some data before breaking the scraper.");
  }

  const poisoned = pickBreakCategory(doc.config.category);
  const updated = await DemoScrape.findByIdAndUpdate(
    doc._id,
    {
      $set: {
        "config.category": poisoned,
        status: "healthy",
        healingTimeline: [],
      },
    },
    { new: true },
  ).lean<SandboxDoc>();

  if (!updated) throw new DemoInvalidStateError("Sandbox disappeared during break");
  return updated;
}

export async function listDemoScrapers() {
  return DemoScraper.find().sort({ lastRunAt: -1 }).limit(8).lean();
}

export async function promoteDemoScraper(scraperId?: string) {
  const findScraper = () =>
    scraperId
      ? DemoScraper.findById(scraperId)
      : DemoScraper.findOne().sort({ lastRunAt: -1 });

  const scraper = await findScraper().lean<{
    _id: unknown;
    domain: string;
    inputUrl: string;
    category: string;
    discoveryKeywords?: string[];
    name?: string;
    promotedSourceId?: unknown;
  } | null>();

  if (!scraper) throw new DemoInvalidStateError("No sandbox scraper found — run a scrape first.");

  if (scraper.promotedSourceId) {
    return { alreadyPromoted: true, sourceId: scraper.promotedSourceId };
  }

  try {
    const source = await Source.create({
      name: scraper.name ?? `${scraper.domain} (demo)`,
      url: scraper.inputUrl,
      domain: scraper.domain,
      category: scraper.category,
      kind: "serp_discovery",
      discoveryKeywords: [...(scraper.discoveryKeywords ?? [])],
      scrapeFrequencyMinutes: 180,
      enabled: true,
      nextRunAt: new Date(Date.now() + 60_000),
      provisioningStatus: "ready",
    });
    await DemoScraper.findByIdAndUpdate(scraper._id, {
      $set: { promotedSourceId: source._id, promotedAt: new Date() },
    });
    return { alreadyPromoted: false, sourceId: source._id };
  } catch (error) {
    // Unique index collision: this site is already registered as a source.
    if (typeof error === "object" && error !== null && (error as { code?: number }).code === 11000) {
      const existing = await Source.findOne({ domain: scraper.domain }).lean<{ _id: unknown } | null>();
      if (existing) {
        await DemoScraper.findByIdAndUpdate(scraper._id, {
          $set: { promotedSourceId: existing._id, promotedAt: new Date() },
        });
        return { alreadyPromoted: true, sourceId: existing._id };
      }
    }
    throw error;
  }
}

export async function updateDemoConfig(input: unknown) {
  const parsed = validateDemoConfigInput(input);
  if (!parsed.ok) throw new DemoInvalidStateError(parsed.error);
  const doc = await getDemoState();
  assertNotInFlight(doc);
  const originalConfig = doc.originalConfig?.url ? doc.originalConfig : { url: doc.config.url, category: doc.config.category as string };

  const updated = await DemoScrape.findByIdAndUpdate(
    doc._id,
    {
      $set: {
        ...(parsed.config.url !== undefined ? { "config.url": parsed.config.url } : {}),
        ...(parsed.config.category !== undefined ? { "config.category": parsed.config.category } : {}),
        originalConfig,
        status: "healthy",
        healingTimeline: [],
      },
    },
    { new: true },
  ).lean<SandboxDoc>();

  if (!updated) throw new DemoInvalidStateError("Sandbox disappeared during update");
  return updated;
}

export async function resetDemo() {
  const doc = await getDemoState();
  assertNotInFlight(doc);
  // Sandbox runs are ephemeral — wiping on reset keeps every fresh visit
  // instant and stops demo data from piling up in the database.
  await DemoScrape.deleteMany({});
  return createDefaultRun();
}

function isValidCategory(value: string): value is DemoCategory {
  return (
    value === "hackathon" ||
    value === "internship" ||
    value === "job" ||
    value === "fellowship" ||
    value === "scholarship" ||
    value === "grant" ||
    value === "competition" ||
    value === "program" ||
    value === "other"
  );
}
