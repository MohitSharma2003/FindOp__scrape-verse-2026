import { env } from "../../config/env.js";
import { BrightDataError } from "./brightdata.client.js";
import type { DiscoveryClient } from "../../discovery/discovery.types.js";

const BRIGHT_DATA_REQUEST_URL = "https://api.brightdata.com/request";

function safeProviderMessage(body: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const message = record.message ?? record.error ?? record.error_message ?? record.code;
      if (typeof message === "string") return message.slice(0, 500);
    }
  } catch {
    // Fall back to a bounded plain-text provider response.
  }

  const trimmed = body.trim().replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  return trimmed ? trimmed.slice(0, 500) : undefined;
}

export class BrightDataDiscoveryClient implements DiscoveryClient {
  public constructor(
    private readonly options: {
      apiToken?: string;
      serpZone: string;
      timeoutMs: number;
    } = {
      apiToken: env.BRIGHT_DATA_API_TOKEN,
      serpZone: env.BRIGHT_DATA_SERP_ZONE,
      timeoutMs: env.BRIGHT_DATA_TIMEOUT_MS,
    },
  ) {}

  public async search(query: string): Promise<unknown> {
    if (!this.options.apiToken) {
      throw new BrightDataError("BRIGHT_DATA_API_TOKEN is not configured");
    }

    const response = await fetch(BRIGHT_DATA_REQUEST_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        zone: this.options.serpZone,
        url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        format: "json",
        method: "GET",
      }),
      signal: AbortSignal.timeout(this.options.timeoutMs),
    }).catch((error: unknown) => {
      throw new BrightDataError(
        "Bright Data discovery request failed",
        undefined,
        error instanceof Error ? error.name : undefined,
      );
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new BrightDataError(
        `Bright Data discovery request failed (${response.status})`,
        response.status,
        safeProviderMessage(body),
      );
    }

    const body = await response.text();
    try {
      return JSON.parse(body) as unknown;
    } catch {
      // Some SERP zones return HTML even when the request asks for JSON.
      // Keep the bounded response in memory for the discovery parser only.
      return body;
    }
  }
}
