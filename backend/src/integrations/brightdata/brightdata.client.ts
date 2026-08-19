import type {
  BrightDataClientOptions,
  BrightDataCollectorConfig,
  BrightDataProgressResponse,
  BrightDataScrapeResult,
  BrightDataTriggerResponse,
} from "./brightdata.types.js";

const BRIGHT_DATA_API_URL = "https://api.brightdata.com";
const IN_PROGRESS_STATUSES = new Set([
  "building",
  "collecting",
  "pending",
  "queued",
  "processing",
  "running",
  "in_progress",
]);

export class BrightDataError extends Error {
  public readonly statusCode?: number;
  public readonly providerMessage?: string;
  public readonly responseContentType?: string;
  public readonly stage?: "trigger" | "poll" | "response";

  public constructor(message: string, statusCode?: number, providerMessage?: string, stage?: "trigger" | "poll" | "response", responseContentType?: string) {
    super(message);
    this.name = "BrightDataError";
    this.statusCode = statusCode;
    this.providerMessage = providerMessage;
    this.responseContentType = responseContentType;
    this.stage = stage;
  }
}

export class BrightDataClient {
  public constructor(private readonly options: BrightDataClientOptions) {}

  public async scrape(
    config: BrightDataCollectorConfig,
  ): Promise<BrightDataScrapeResult> {
    if (!this.options.apiToken) {
      throw new BrightDataError("BRIGHT_DATA_API_TOKEN is not configured");
    }

    const deadline = Date.now() + this.options.timeoutMs;
    const triggerUrl = new URL("/dca/trigger", BRIGHT_DATA_API_URL);
    triggerUrl.searchParams.set("collector", config.collectorId);
    triggerUrl.searchParams.set("queue_next", "1");
    if (config.version) triggerUrl.searchParams.set("version", config.version);

    let trigger: BrightDataTriggerResponse;
    try {
      trigger = await this.requestJson<BrightDataTriggerResponse>(
        triggerUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([{ url: config.url }]),
        },
        deadline,
      );
    } catch (error: unknown) {
      throw this.withStage(error, "trigger");
    }

    const snapshotId = trigger && typeof trigger === "object"
      ? trigger.collection_id ?? trigger.snapshot_id
      : undefined;

    if (!snapshotId) {
      throw new BrightDataError("Bright Data did not return a collection ID", undefined, undefined, "response");
    }

    while (Date.now() < deadline) {
      const datasetUrl = new URL("/dca/dataset", BRIGHT_DATA_API_URL);
      datasetUrl.searchParams.set("id", snapshotId);

      let dataset: unknown;
      try {
        dataset = await this.requestJson<unknown>(datasetUrl, {
          method: "GET",
        }, deadline);
      } catch (error: unknown) {
        throw this.withStage(error, "poll");
      }

      const records = this.readCompletedDataset(dataset);
      if (records) {
        return {
          snapshotId,
          rawResult: records,
          recordsFound: records.length,
        };
      }

      const progress = this.readProgress(dataset);

      if (progress.status === "failed" || progress.status === "error") {
        throw new BrightDataError(
          progress.error ?? progress.message ?? "Bright Data scrape failed",
          undefined,
          undefined,
          "poll",
        );
      }

      if (!progress.status || !IN_PROGRESS_STATUSES.has(progress.status)) {
        throw new BrightDataError(
          "Bright Data returned an unexpected dataset status",
          undefined,
          progress.status,
          "poll",
        );
      }

      await this.delay(Math.min(this.options.pollIntervalMs, deadline - Date.now()));
    }

    throw new BrightDataError(
      `Bright Data scrape timed out after ${this.options.timeoutMs}ms`,
      undefined,
      undefined,
      "poll",
    );
  }

  private withStage(
    error: unknown,
    stage: "trigger" | "poll",
  ): BrightDataError {
    if (error instanceof BrightDataError) {
      return new BrightDataError(error.message, error.statusCode, error.providerMessage, stage);
    }
    return new BrightDataError(
      "Bright Data request failed",
      undefined,
      error instanceof Error ? error.name : undefined,
      stage,
    );
  }

  private async requestJson<T>(url: URL, init: RequestInit, deadline: number): Promise<T> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new BrightDataError(`Bright Data request timed out after ${this.options.timeoutMs}ms`);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), remaining);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.options.apiToken ?? ""}`,
          ...init.headers,
        },
      });

      const text = await response.text();
      let payload: unknown = undefined;

      if (text) {
        try {
          payload = JSON.parse(text) as unknown;
        } catch {
          payload = text;
        }
      }

      if (!response.ok) {
        throw new BrightDataError(
          this.errorMessage(payload, response.status),
          response.status,
        );
      }

      return payload as T;
    } catch (error: unknown) {
      if (error instanceof BrightDataError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new BrightDataError(
          `Bright Data request timed out after ${this.options.timeoutMs}ms`,
        );
      }

      const message = error instanceof Error ? error.message : "Unknown error";
      throw new BrightDataError(`Bright Data request failed: ${message}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  private readProgress(value: unknown): BrightDataProgressResponse {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new BrightDataError("Bright Data returned an unexpected response");
    }

    return value as BrightDataProgressResponse;
  }

  private readCompletedDataset(value: unknown): Array<Record<string, unknown>> | undefined {
    if (Array.isArray(value)) {
      if (!value.every((record) => this.isOpportunityRecord(record))) {
        throw new BrightDataError("Bright Data returned a malformed dataset", undefined, undefined, "poll");
      }
      return value as Array<Record<string, unknown>>;
    }

    if (this.isOpportunityRecord(value)) {
      return [value as Record<string, unknown>];
    }

    return undefined;
  }

  private isOpportunityRecord(value: unknown): value is Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return false;
    }

    const record = value as Record<string, unknown>;
    return ["title", "organization", "description", "opportunity_type", "application_url", "source_url"]
      .some((key) => key in record);
  }

  private errorMessage(value: unknown, statusCode: number): string {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const payload = value as { error?: unknown; message?: unknown };
      const detail = payload.error ?? payload.message;

      if (typeof detail === "string" && detail.length > 0) {
        return `Bright Data request failed (${statusCode}): ${detail}`;
      }
    }

    return `Bright Data request failed with HTTP ${statusCode}`;
  }

  private async delay(milliseconds: number): Promise<void> {
    await new Promise<void>((resolve) =>
      setTimeout(resolve, Math.max(0, milliseconds)),
    );
  }
}
