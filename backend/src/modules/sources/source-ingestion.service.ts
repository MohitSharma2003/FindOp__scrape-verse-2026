import type { CandidateUrl } from "../../discovery/discovery.types.js";
import { scrapeSource, type SourceScrapeResult } from "./source-scrape.service.js";
import { resolveSource, type SourceResolution, type SourceResolverDependencies } from "./source-resolver.service.js";

export interface CandidateIngestionOutcome {
  candidate: CandidateUrl;
  resolution: SourceResolution;
  scrape?: SourceScrapeResult;
  error?: string;
}

export interface SourceIngestionDependencies extends SourceResolverDependencies {
  scrape: (sourceId: string) => Promise<SourceScrapeResult>;
}

export async function ingestDiscoveredCandidates(
  candidates: CandidateUrl[],
  dependencies: SourceIngestionDependencies,
): Promise<CandidateIngestionOutcome[]> {
  return Promise.all(candidates.map(async (candidate) => {
    try {
      const resolution = await resolveSource(candidate, dependencies);
      if (resolution.status === "skipped") return { candidate, resolution };
      if (resolution.status === "onboarded") return { candidate, resolution };
      if (resolution.status === "reused") return { candidate, resolution };
      const scrape = await dependencies.scrape(resolution.source.id);
      return { candidate, resolution, scrape };
    } catch (error: unknown) {
      const resolution: SourceResolution = { status: "skipped", reason: "source_ingestion_failed" };
      return { candidate, resolution, error: error instanceof Error ? error.message : "source ingestion failed" };
    }
  }));
}

export function createSourceIngestionDependencies(
  resolver: SourceResolverDependencies,
): SourceIngestionDependencies {
  return { ...resolver, scrape: (sourceId) => scrapeSource(sourceId) };
}
