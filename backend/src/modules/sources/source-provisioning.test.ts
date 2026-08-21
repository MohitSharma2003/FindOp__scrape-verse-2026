import assert from "node:assert/strict";
import test from "node:test";
import { BrightDataError } from "../../integrations/brightdata/brightdata.client.js";
import type { CollectorProvisioner } from "../../integrations/brightdata/brightdata.collector.client.js";
import {
  activateSource,
  isActivationInFlight,
  type ProvisioningDependencies,
  type SourceActivationResult,
} from "./source-provisioning.service.js";
import { SourceScrapeFailedError, classifyBrightDataFailure, type ScrapeSourceOptions } from "./source-scrape.service.js";

interface FakeSource {
  _id: { toString(): string };
  id?: never;
  name: string;
  url: string;
  collectorId?: string | null;
  scraperVersion?: string | null;
  enabled: boolean;
  provisioningStatus: "pending" | "provisioning" | "verifying" | "ready" | "failed";
  provisioningError?: string;
  provisioningAttempts: number;
  nextProvisioningRetryAt?: Date | null;
}

function fakeSource(overrides: Partial<FakeSource> = {}): FakeSource {
  return {
    _id: { toString: () => "source-1" },
    name: "Example Source",
    url: "https://example.org/opportunities",
    collectorId: "c_existing",
    enabled: false,
    provisioningStatus: "pending",
    provisioningAttempts: 0,
    ...overrides,
  };
}

interface FixtureOptions {
  source?: FakeSource;
  scrapeError?: Error;
  provisionerError?: Error;
  templateResult?: { ok: boolean; error?: string };
}

function fixture(options: FixtureOptions = {}) {
  const state = {
    source: options.source ?? fakeSource(),
    scrapeCalls: [] as Array<{ id: string; options?: ScrapeSourceOptions }>,
    readyCalls: 0,
    failures: [] as Array<{ reason: string; rateLimited: boolean }>,
    statusUpdates: [] as string[],
    collectorCreations: 0,
    updates: [] as Array<Record<string, unknown>>,
  };

  const provisioner: CollectorProvisioner = {
    createCollector: async () => {
      state.collectorCreations += 1;
      if (options.provisionerError) throw options.provisionerError;
      state.source = { ...state.source, collectorId: `c_new_${state.collectorCreations}` };
      return { collectorId: `c_new_${state.collectorCreations}`, scraperVersion: "dev" };
    },
  };

  const deps: ProvisioningDependencies = {
    getSource: async () => state.source as never,
    provisioner,
    scrape: async (id, scrapeOptions) => {
      state.scrapeCalls.push({ id, options: scrapeOptions });
      if (options.scrapeError) throw options.scrapeError;
      return { scrapeRun: {}, ingestion: {}, snapshotId: "snap", health: { status: "healthy", reasons: [], signals: {} } } as never;
    },
    markReady: async () => {
      state.readyCalls += 1;
      state.source = { ...state.source, enabled: true, provisioningStatus: "ready" };
      return state.source as never;
    },
    recordFailure: async (_id, reason) => {
      state.failures.push({ reason, rateLimited: false });
      state.source = {
        ...state.source,
        provisioningStatus: "failed",
        provisioningAttempts: state.source.provisioningAttempts + 1,
        nextProvisioningRetryAt: new Date(Date.now() + 60_000),
      };
      return state.source as never;
    },
    recordRateLimit: async (_id, reason) => {
      state.failures.push({ reason, rateLimited: true });
      state.source = {
        ...state.source,
        provisioningStatus: "failed",
        provisioningAttempts: state.source.provisioningAttempts + 1,
        nextProvisioningRetryAt: new Date(Date.now() + 180_000),
      };
      return state.source as never;
    },
    markStatus: async (_id, patch) => {
      state.statusUpdates.push(patch.provisioningStatus);
      state.updates.push(patch as Record<string, unknown>);
      state.source = { ...state.source, provisioningStatus: patch.provisioningStatus };
      return state.source as never;
    },
    updateSource: async (_id, patch) => {
      state.updates.push(patch);
      state.source = { ...state.source, ...patch } as FakeSource;
      return state.source as never;
    },
    ensureTemplate: async () => options.templateResult ?? { ok: true },
  };

  return { deps, state };
}

function scrapeFailure(kind: string, message = kind): SourceScrapeFailedError {
  const providerError = new BrightDataError(message, kind === "rate_limited" ? 429 : kind === "collector_deleted" ? 404 : undefined);
  return new SourceScrapeFailedError(message, {}, undefined, classifyBrightDataFailure(providerError));
}

test("Stabilization: collector with working template → verification → source becomes ready and enabled", async () => {
  const { deps, state } = fixture();
  const result = await activateSource("source-1", deps);
  assert.equal(result.status, "ready");
  assert.equal(state.readyCalls, 1);
  assert.equal(state.source.enabled, true);
  assert.equal(state.source.provisioningStatus, "ready");
  assert.ok(state.scrapeCalls.every((call) => call.options?.verificationRun === true), "Verification must bypass the disabled gate explicitly");
});

test("Stabilization: already-ready sources short-circuit without scraping", async () => {
  const { deps, state } = fixture({ source: fakeSource({ enabled: true, provisioningStatus: "ready" }) });
  const result = await activateSource("source-1", deps);
  assert.equal(result.status, "ready");
  assert.equal(state.scrapeCalls.length, 0);
  assert.equal(state.collectorCreations, 0);
});

test("Stabilization: template failure keeps source not-ready, disabled, and retryable", async () => {
  const { deps, state } = fixture({
    scrapeError: scrapeFailure("template_missing", "HTTP 500: missing template id"),
    templateResult: { ok: false, error: "automate_template failed: AI rejected page" },
  });
  const result = await activateSource("source-1", deps);
  assert.equal(result.status, "failed_retryable");
  assert.equal(state.source.enabled, false, "Source must NOT be enabled after template failure");
  assert.equal(state.source.provisioningStatus, "failed");
  assert.ok(result.nextRetryAt, "Failure must remain retryable with a scheduled retry");
  assert.equal(state.readyCalls, 0);
});

test("Stabilization: HTTP 429 during verification records bounded retryable rate-limited state", async () => {
  const { deps, state } = fixture({
    scrapeError: scrapeFailure("rate_limited", "HTTP 429: too many requests"),
  });
  const result = await activateSource("source-1", deps);
  assert.equal(result.status, "rate_limited");
  assert.equal(state.source.enabled, false);
  assert.ok(state.failures.every((failure) => failure.rateLimited), "429 must be recorded as rate limited");
  assert.ok(result.nextRetryAt, "Rate-limited failures must schedule a retry");
});

test("Stabilization: HTTP 500 transient failure is recorded as retryable, not ready", async () => {
  const { deps, state } = fixture({
    scrapeError: scrapeFailure("transient", "HTTP 502: bad gateway"),
  });
  const result = await activateSource("source-1", deps);
  assert.equal(result.status, "failed_retryable");
  assert.equal(state.source.enabled, false);
  assert.ok(result.nextRetryAt);
  assert.equal(state.readyCalls, 0);
});

test("Stabilization: missing template triggers ensureTemplate then re-verification succeeds", async () => {
  let ensureTemplateCalled = 0;
  const { deps, state } = fixture();
  deps.ensureTemplate = async () => {
    ensureTemplateCalled += 1;
    return { ok: true };
  };
  // First verification fails (missing template), second (after template creation) succeeds.
  let scrapeCount = 0;
  const originalScrape = deps.scrape;
  deps.scrape = async (id, opts) => {
    scrapeCount += 1;
    if (scrapeCount === 1) throw scrapeFailure("template_missing", "missing template id");
    return originalScrape(id, opts);
  };

  const result = await activateSource("source-1", deps);
  assert.equal(ensureTemplateCalled, 1, "ensureTemplate must run exactly once for missing template");
  assert.equal(result.status, "ready");
  assert.equal(state.source.enabled, true);
});

test("Stabilization: deleted collector (404) triggers single reprovision on same Source, old collector preserved", async () => {
  const { deps, state } = fixture();
  let scrapeCount = 0;
  const originalScrape = deps.scrape;
  deps.scrape = async (id, opts) => {
    scrapeCount += 1;
    if (scrapeCount === 1) throw scrapeFailure("collector_deleted", "HTTP 404: collector not found");
    return originalScrape(id, opts);
  };

  const result = await activateSource("source-1", deps);
  assert.equal(result.status, "ready");
  assert.equal(state.collectorCreations, 1, "Exactly one replacement collector must be created");
  assert.equal(state.updates.some((update) => update.lastProvisionedCollectorId === "c_existing"), true, "Old collectorId must be preserved");
  assert.notEqual(state.source.collectorId, "c_existing", "collectorId must be replaced only after successful reprovisioning");
  assert.equal(state.source.enabled, true);
});

test("Stabilization: reprovisioning failure after deleted collector stays retryable and disabled", async () => {
  const { deps, state } = fixture({
    provisionerError: new BrightDataError("HTTP 500: provisioning unavailable", 500),
  });
  const originalScrape = deps.scrape;
  deps.scrape = async () => { throw scrapeFailure("collector_deleted", "HTTP 404: collector not found"); };

  const result = await activateSource("source-1", deps);
  assert.equal(result.status, "failed_retryable");
  assert.equal(state.source.enabled, false);
  assert.equal(state.source.collectorId, "c_existing", "Dead collectorId must be kept until replacement succeeds");
  assert.ok(result.nextRetryAt);
});

test("Stabilization: missing collectorId provisions a new collector on the SAME Source", async () => {
  const { deps, state } = fixture({ source: fakeSource({ collectorId: null }) });
  const result = await activateSource("source-1", deps);
  assert.equal(result.status, "ready");
  assert.equal(state.collectorCreations, 1);
  assert.equal(state.source.collectorId, "c_new_1");
  assert.equal(state.source.enabled, true);
});

test("Stabilization: concurrent activations for the same source coalesce into one run", async () => {
  const { deps, state } = fixture();
  const [first, second] = await Promise.all([
    activateSource("source-coalesce", deps),
    (() => {
      assert.equal(isActivationInFlight("source-coalesce"), true, "Second activation must observe in-flight state");
      return activateSource("source-coalesce", deps);
    })(),
  ]);
  assert.equal(first.status, "ready");
  assert.equal(second.status, "ready");
  assert.equal(state.scrapeCalls.length, 1, "Verification scrape must run exactly once for coalesced activations");
});

test("Stabilization: classification maps provider errors to explicit kinds", () => {
  assert.equal(classifyBrightDataFailure(new BrightDataError("x", 404)), "collector_deleted");
  assert.equal(classifyBrightDataFailure(new BrightDataError("x", 429)), "rate_limited");
  assert.equal(classifyBrightDataFailure(new BrightDataError("missing template id", 500)), "template_missing");
  assert.equal(classifyBrightDataFailure(new BrightDataError("unauthorized", 401)), "auth");
  assert.equal(classifyBrightDataFailure(new BrightDataError("server exploded", 502)), "transient");
  assert.equal(classifyBrightDataFailure(new Error("plain")), "unknown");
});
