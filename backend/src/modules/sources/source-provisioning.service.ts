import { BrightDataError } from "../../integrations/brightdata/brightdata.client.js";
import { BrightDataHealingClient } from "../../integrations/brightdata/brightdata.healing.client.js";
import type { CollectorProvisioner } from "../../integrations/brightdata/brightdata.collector.client.js";
import { defaultBrightDataCollectorProvisioner } from "../../integrations/brightdata/brightdata.collector.client.js";
import { env } from "../../config/env.js";
import {
  getSourceById,
  markProvisioningStatusService,
  markSourceReadyService,
  recordRateLimitedProvisioningService,
  markSourceProvisioningFailedService,
  updateSourceService,
} from "./source.service.js";
import {
  scrapeSource,
  SourceScrapeFailedError,
  classifyBrightDataFailure,
  type ScrapeSourceOptions,
} from "./source-scrape.service.js";
import { normalizeSourceDomain } from "./source.service.js";

export interface SourceActivationResult {
  sourceId: string;
  status: "ready" | "failed_retryable" | "failed_permanent" | "skipped" | "rate_limited";
  reason?: string;
  attempts?: number;
  nextRetryAt?: Date | null;
}

export interface ProvisioningDependencies {
  getSource: typeof getSourceById;
  provisioner: CollectorProvisioner;
  scrape: (id: string, options?: ScrapeSourceOptions) => ReturnType<typeof scrapeSource>;
  markReady: typeof markSourceReadyService;
  recordFailure: typeof markSourceProvisioningFailedService;
  recordRateLimit: typeof recordRateLimitedProvisioningService;
  markStatus: typeof markProvisioningStatusService;
  updateSource: typeof updateSourceService;
  ensureTemplate: (collectorId: string, url: string) => Promise<{ ok: boolean; error?: string }>;
}

export function defaultProvisioningDependencies(): ProvisioningDependencies {
  const healingClient = () => new BrightDataHealingClient({
    apiToken: env.BRIGHT_DATA_API_TOKEN,
    timeoutMs: env.BRIGHT_DATA_HEALING_TIMEOUT_MS,
    pollIntervalMs: env.BRIGHT_DATA_POLL_INTERVAL_MS,
  });
  return {
    getSource: getSourceById,
    provisioner: defaultBrightDataCollectorProvisioner,
    scrape: (id, options) => scrapeSource(id, options),
    markReady: markSourceReadyService,
    recordFailure: markSourceProvisioningFailedService,
    recordRateLimit: recordRateLimitedProvisioningService,
    markStatus: markProvisioningStatusService,
    updateSource: updateSourceService,
    ensureTemplate: async (collectorId, url) => {
      try {
        const result = await healingClient().heal(
          collectorId,
          "Create a scraper template that extracts opportunity listings as structured JSON records.",
          [{ url }],
        );
        if (result.success || result.pendingApproval) return { ok: result.success, error: result.error };
        return { ok: false, error: result.error ?? "template generation failed" };
      } catch (error: unknown) {
        return { ok: false, error: error instanceof Error ? error.message : "template generation failed" };
      }
    },
  };
}

const inFlightActivations = new Map<string, Promise<SourceActivationResult>>();

export function isActivationInFlight(sourceId: string): boolean {
  return inFlightActivations.has(sourceId);
}

export async function activateSource(
  sourceId: string,
  dependencies: ProvisioningDependencies = defaultProvisioningDependencies(),
): Promise<SourceActivationResult> {
  const existing = inFlightActivations.get(sourceId);
  if (existing) return existing;

  const operation = activateSourceOnce(sourceId, dependencies)
    .finally(() => inFlightActivations.delete(sourceId));
  inFlightActivations.set(sourceId, operation);
  return operation;
}

/** Fire-and-forget activation for request paths; never throws, never blocks. */
export function scheduleSourceActivation(
  sourceId: string,
  dependencies: ProvisioningDependencies = defaultProvisioningDependencies(),
): void {
  void activateSource(sourceId, dependencies).catch((error: unknown) => {
    console.error("Background source activation failed", {
      sourceId,
      message: error instanceof Error ? error.message : "unknown error",
    });
  });
}

async function activateSourceOnce(
  sourceId: string,
  deps: ProvisioningDependencies,
): Promise<SourceActivationResult> {
  let source = await deps.getSource(sourceId);
  if (!source) return { sourceId, status: "skipped", reason: "source_not_found" };
  if (source.enabled && source.provisioningStatus === "ready") {
    return { sourceId, status: "ready" };
  }

  // Step 1: guarantee a collector exists on this Source (reuse the Source, never duplicate).
  if (!source.collectorId) {
    try {
      const collector = await deps.provisioner.createCollector({
        sourceUrl: source.url,
        sourceDomain: normalizeSourceDomain(source.url),
        name: source.name,
      });
      await deps.updateSource(sourceId, {
        collectorId: collector.collectorId,
        scraperVersion: collector.scraperVersion,
        enabled: false,
      });
      await deps.markStatus(sourceId, { provisioningStatus: "provisioning", lastProvisionedCollectorId: collector.collectorId });
      source = await deps.getSource(sourceId);
      if (!source?.collectorId) {
        return failRetryable(deps, sourceId, "collector provisioning did not persist a collectorId");
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "collector provisioning failed";
      if (isRateLimited(error)) {
        const recorded = await deps.recordRateLimit(sourceId, `Rate limited while provisioning collector: ${message}`);
        return rateLimitedResult(sourceId, recorded?.provisioningAttempts ?? undefined, recorded?.nextProvisioningRetryAt ?? null, message);
      }
      const recorded = await deps.recordFailure(sourceId, message);
      return {
        sourceId,
        status: "failed_retryable",
        reason: message,
        attempts: recorded?.provisioningAttempts ?? undefined,
        nextRetryAt: recorded?.nextProvisioningRetryAt ?? null,
      };
    }
  }

  // Step 2: verify the collector end-to-end (bounded: at most one template fix + one reprovision).
  await deps.markStatus(sourceId, { provisioningStatus: "verifying" });
  const first = await verifyOnce(deps, sourceId, source.collectorId!, source.url);
  if (first.outcome === "verified") {
    await deps.markReady(sourceId);
    return { sourceId, status: "ready" };
  }

  if (first.kind === "collector_deleted") {
    const reprovisioned = await reprovisionCollector(deps, sourceId, source.collectorId!);
    if (!reprovisioned.ok) return reprovisioned.failure;
    await deps.markStatus(sourceId, { provisioningStatus: "verifying" });
    const second = await verifyOnce(deps, sourceId, reprovisioned.collectorId, source.url);
    if (second.outcome === "verified") {
      await deps.markReady(sourceId);
      return { sourceId, status: "ready" };
    }
    return await persistVerificationFailure(deps, sourceId, second);
  }

  if (first.kind === "template_missing") {
    const template = await deps.ensureTemplate(source.collectorId!, source.url);
    if (!template.ok) {
      if (template.error && isRateLimitedMessage(template.error)) {
        const recorded = await deps.recordRateLimit(sourceId, `Rate limited while generating template: ${template.error}`);
        return rateLimitedResult(sourceId, recorded?.provisioningAttempts ?? undefined, recorded?.nextProvisioningRetryAt ?? null, template.error);
      }
      return await persistFailure(deps, sourceId, `Template generation failed: ${template.error ?? "unknown error"}`);
    }
    await deps.markStatus(sourceId, { provisioningStatus: "verifying" });
    const second = await verifyOnce(deps, sourceId, source.collectorId!, source.url);
    if (second.outcome === "verified") {
      await deps.markReady(sourceId);
      return { sourceId, status: "ready" };
    }
    return await persistVerificationFailure(deps, sourceId, second);
  }

  return await persistVerificationFailure(deps, sourceId, first);
}

interface VerificationOutcome {
  outcome: "verified" | "failed";
  kind: ReturnType<typeof classifyBrightDataFailure>;
  reason: string;
}

async function verifyOnce(
  deps: ProvisioningDependencies,
  sourceId: string,
  collectorId: string,
  url: string,
): Promise<VerificationOutcome> {
  try {
    await deps.scrape(sourceId, { verificationRun: true, allowAutomaticHealing: false });
    return { outcome: "verified", kind: "unknown", reason: "verification scrape succeeded" };
  } catch (error: unknown) {
    if (error instanceof SourceScrapeFailedError) {
      return {
        outcome: "failed",
        kind: error.providerKind ?? classifyBrightDataFailure(error),
        reason: error.message,
      };
    }
    if (error instanceof BrightDataError) {
      return { outcome: "failed", kind: classifyBrightDataFailure(error), reason: error.message };
    }
    return { outcome: "failed", kind: "unknown", reason: error instanceof Error ? error.message : "verification scrape failed" };
  }
}

async function reprovisionCollector(
  deps: ProvisioningDependencies,
  sourceId: string,
  staleCollectorId: string,
): Promise<{ ok: true; collectorId: string } | { ok: false; failure: SourceActivationResult }> {
  const source = await deps.getSource(sourceId);
  if (!source) {
    return { ok: false, failure: { sourceId, status: "skipped", reason: "source_not_found" } };
  }
  try {
    const collector = await deps.provisioner.createCollector({
      sourceUrl: source.url,
      sourceDomain: normalizeSourceDomain(source.url),
      name: source.name,
    });
    await deps.updateSource(sourceId, {
      collectorId: collector.collectorId,
      scraperVersion: collector.scraperVersion,
      enabled: false,
    });
    await deps.markStatus(sourceId, {
      provisioningStatus: "provisioning",
      lastProvisionedCollectorId: staleCollectorId,
    });
    return { ok: true, collectorId: collector.collectorId };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "collector reprovisioning failed";
    if (isRateLimited(error)) {
      const recorded = await deps.recordRateLimit(sourceId, `Rate limited while replacing deleted collector: ${message}`);
      return {
        ok: false,
        failure: rateLimitedResult(sourceId, recorded?.provisioningAttempts ?? undefined, recorded?.nextProvisioningRetryAt ?? null, message),
      };
    }
    const recorded = await deps.recordFailure(sourceId, `Reprovisioning after deleted collector failed: ${message}`);
    return {
      ok: false,
      failure: {
        sourceId,
        status: "failed_retryable",
        reason: message,
        attempts: recorded?.provisioningAttempts ?? undefined,
        nextRetryAt: recorded?.nextProvisioningRetryAt ?? null,
      },
    };
  }
}

async function persistVerificationFailure(
  deps: ProvisioningDependencies,
  sourceId: string,
  outcome: VerificationOutcome,
): Promise<SourceActivationResult> {
  if (outcome.kind === "rate_limited") {
    const recorded = await deps.recordRateLimit(sourceId, `Rate limited during verification: ${outcome.reason}`);
    return rateLimitedResult(sourceId, recorded?.provisioningAttempts ?? undefined, recorded?.nextProvisioningRetryAt ?? null, outcome.reason);
  }
  return persistFailure(deps, sourceId, `Verification failed (${outcome.kind}): ${outcome.reason}`);
}

async function persistFailure(
  deps: ProvisioningDependencies,
  sourceId: string,
  reason: string,
): Promise<SourceActivationResult> {
  const recorded = await deps.recordFailure(sourceId, reason);
  return {
    sourceId,
    status: "failed_retryable",
    reason,
    attempts: recorded?.provisioningAttempts ?? undefined,
    nextRetryAt: recorded?.nextProvisioningRetryAt ?? null,
  };
}

function rateLimitedResult(sourceId: string, attempts: number | undefined, nextRetryAt: Date | null, reason: string): SourceActivationResult {
  return {
    sourceId,
    status: "rate_limited",
    reason,
    attempts,
    nextRetryAt,
  };
}

function failRetryable(deps: ProvisioningDependencies, sourceId: string, reason: string): Promise<SourceActivationResult> {
  return persistFailure(deps, sourceId, reason);
}

function isRateLimited(error: unknown): boolean {
  return classifyBrightDataFailure(error) === "rate_limited";
}

function isRateLimitedMessage(message: string): boolean {
  return /429|rate limit|too many requests/i.test(message);
}



