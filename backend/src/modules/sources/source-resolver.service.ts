import type { CandidateUrl } from "../../discovery/discovery.types.js";
import type { CollectorProvisioner } from "../../integrations/brightdata/brightdata.collector.client.js";
import { createSourceService, markSourceProvisioningFailedService, normalizeSourceDomain, updateSourceService } from "./source.service.js";
import type { CreateSourceInput } from "./source.schema.js";
import { findSourceByDomain, findSourceByUrl } from "./source.repository.js";
import { defaultBrightDataCollectorProvisioner } from "../../integrations/brightdata/brightdata.collector.client.js";

export interface ResolvedSource {
  id: string;
  name: string;
  url: string;
  collectorId?: string | null;
  scraperVersion?: string | null;
}

export interface SourceResolverDependencies {
  findByDomain: (domain: string) => Promise<ResolvedSource | null>;
  findByUrl: (url: string) => Promise<ResolvedSource | null>;
  createSource: typeof createSourceService;
  updateSource: typeof updateSourceService;
  markProvisioningFailed: typeof markSourceProvisioningFailedService;
  markProvisioningProgress?: (id: string, patch: { provisioningStatus: "provisioning" | "verifying" }) => Promise<unknown>;
  provisioner: CollectorProvisioner;
}

export type SourceResolution =
  | { status: "reused" | "onboarded"; source: ResolvedSource }
  | { status: "skipped"; reason: string };

const onboardingLocks = new WeakMap<object, Map<string, Promise<SourceResolution>>>();

const USEFUL_TERMS = /hackathon|fellowship|internship|scholarship|competition|challenge|opportunity|program|apply|register/i;
const UNSUPPORTED_HOSTS = /(^|\.)accounts\.google\.com$|(^|\.)google\.com$|(^|\.)bing\.com$/i;

export function isUsefulSourceCandidate(candidate: Pick<CandidateUrl, "url" | "title" | "description">): boolean {
  try {
    const parsed = new URL(candidate.url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (UNSUPPORTED_HOSTS.test(parsed.hostname)) return false;
    return USEFUL_TERMS.test(`${candidate.title} ${candidate.description} ${parsed.pathname}`);
  } catch {
    return false;
  }
}

export async function resolveSource(
  candidate: CandidateUrl,
  dependencies: SourceResolverDependencies,
): Promise<SourceResolution> {
  let domain: string;
  try {
    domain = normalizeSourceDomain(candidate.url);
  } catch {
    return { status: "skipped", reason: "invalid_source_url" };
  }

  const locks = onboardingLocks.get(dependencies) ?? new Map<string, Promise<SourceResolution>>();
  onboardingLocks.set(dependencies, locks);
  const active = locks.get(domain);
  if (active) return active;

  const operation = resolveSourceOnce(candidate, domain, dependencies);
  locks.set(domain, operation);
  try {
    return await operation;
  } finally {
    locks.delete(domain);
  }
}

async function resolveSourceOnce(
  candidate: CandidateUrl,
  domain: string,
  dependencies: SourceResolverDependencies,
): Promise<SourceResolution> {
  const existing = await dependencies.findByDomain(domain)
    ?? await dependencies.findByUrl(candidate.url);
  if (existing?.collectorId) return { status: "reused", source: existing };
  if (existing && !isUsefulSourceCandidate(candidate)) return { status: "skipped", reason: "unsupported_or_not_useful" };
  if (!isUsefulSourceCandidate(candidate)) return { status: "skipped", reason: "unsupported_or_not_useful" };
  const created = existing ?? await dependencies.createSource({
    name: candidate.title || domain,
    url: candidate.url,
    category: (candidate.discoveryMetadata?.category as CreateSourceInput["category"]) || "hackathon",
    kind: "collector",
    scrapeFrequencyMinutes: 1440,
    enabled: false,
    healthStatus: "unknown",
  });
  try {
    const collector = await dependencies.provisioner.createCollector({ sourceUrl: candidate.url, sourceDomain: domain, name: candidate.title || domain });
    const id = getSourceId(created);
    const updated = await dependencies.updateSource(id, { collectorId: collector.collectorId, scraperVersion: collector.scraperVersion, enabled: false });
    if (dependencies.markProvisioningProgress) {
      await dependencies.markProvisioningProgress(id, { provisioningStatus: "provisioning" });
    }
    return { status: "onboarded", source: toResolvedSource(updated ?? created) };
  } catch (error: unknown) {
    await dependencies.markProvisioningFailed(getSourceId(created), error instanceof Error ? error.message : "collector provisioning failed");
    throw error;
  }
}

export function defaultSourceResolverDependencies(): SourceResolverDependencies {
  return {
    findByDomain: async (domain) => findSourceByDomain(domain) as Promise<ResolvedSource | null>,
    findByUrl: async (url) => findSourceByUrl(url) as Promise<ResolvedSource | null>,
    createSource: createSourceService,
    updateSource: updateSourceService,
    markProvisioningFailed: markSourceProvisioningFailedService,
    provisioner: defaultBrightDataCollectorProvisioner,
  };
}

function getSourceId(source: ResolvedSource | { _id: { toString(): string } }): string {
  return "id" in source ? source.id : source._id.toString();
}

function toResolvedSource(source: ResolvedSource | { _id: { toString(): string }; name: string; url: string; collectorId?: string | null; scraperVersion?: string | null }): ResolvedSource {
  if ("id" in source) return source;
  return { id: source._id.toString(), name: source.name, url: source.url, collectorId: source.collectorId, scraperVersion: source.scraperVersion };
}
