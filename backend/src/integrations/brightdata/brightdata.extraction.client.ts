import { env } from "../../config/env.js";
import { BrightDataClient } from "./brightdata.client.js";
import type { BrightDataHealingResult } from "./brightdata.healing.client.js";

export class BrightDataExtractionClient {
  private readonly client = new BrightDataClient({
    apiToken: env.BRIGHT_DATA_API_TOKEN,
    timeoutMs: env.BRIGHT_DATA_TIMEOUT_MS,
    pollIntervalMs: env.BRIGHT_DATA_POLL_INTERVAL_MS,
  });

  public async extract(candidateUrl: string): Promise<unknown> {
    if (!env.BRIGHT_DATA_EXTRACTION_COLLECTOR_ID) {
      throw new Error("BRIGHT_DATA_EXTRACTION_COLLECTOR_ID is not configured");
    }

    return this.extractWithVersion(candidateUrl);
  }

  public async extractWithVersion(
    candidateUrl: string,
    repair?: Pick<BrightDataHealingResult, "repairedScraper">,
  ): Promise<unknown> {
    if (!env.BRIGHT_DATA_EXTRACTION_COLLECTOR_ID) {
      throw new Error("BRIGHT_DATA_EXTRACTION_COLLECTOR_ID is not configured");
    }
    const repaired = repair?.repairedScraper;
    const result = await this.client.scrape({
      collectorId: env.BRIGHT_DATA_EXTRACTION_COLLECTOR_ID,
      url: candidateUrl,
      ...(repaired ? { version: repaired.version } : {}),
    });
    return result.rawResult;
  }
}
