export interface BrightDataCollectorConfig {
  collectorId: string;
  url: string;
  version?: "dev";
}

export interface BrightDataClientOptions {
  apiToken?: string;
  timeoutMs: number;
  pollIntervalMs: number;
}

export interface BrightDataScrapeResult {
  snapshotId: string;
  rawResult: unknown;
  recordsFound?: number;
}

export interface BrightDataTriggerResponse {
  collection_id?: string;
  snapshot_id?: string;
}

export interface BrightDataProgressResponse {
  status?: string;
  snapshot_id?: string;
  collection_id?: string;
  error?: string;
  message?: string;
}
