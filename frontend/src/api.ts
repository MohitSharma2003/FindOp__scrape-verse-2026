export type Opportunity = {
  _id: string;
  title: string;
  organization?: string;
  description?: string;
  eligibility?: string;
  category: string;
  url: string;
  opportunityUrl?: string;
  applicationUrl?: string;
  source?: string;
  mode?: "remote" | "in_person" | "hybrid" | "any";
  location?: string;
  skills?: string[];
  deadline?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  scrapedAt?: string;
  prize?: string;
};
export type Source = {
  _id: string;
  name: string;
  url: string;
  domain?: string;
  category: string;
  collectorId?: string;
  enabled?: boolean;
  provisioningStatus?: string;
  healthStatus?: string;
  lastRunAt?: string;
  lastSuccessfulRunAt?: string;
  consecutiveFailures?: number;
  healingCount?: number;
  lastHealingError?: string;
  healingStatus?: string;
  qualityScore?: number;
  lastFailureReason?: string;
  repairStrategy?: string;
  recoveryReason?: string;
};
export type ScrapeRun = {
  _id: string;
  sourceId: string | { _id: string; name?: string };
  startedAt: string;
  completedAt?: string;
  status: string;
  recordsFound?: number;
  recordsValid?: number;
  recordsRejected?: number;
  recordsPersisted?: number;
  validationErrors?: string[];
  error?: string;
  healthStatus?: string;
  healthReasons?: string[];
  healingStatus?: string;
  healingAttempts?: number;
  lastHealingStartedAt?: string;
  lastHealingCompletedAt?: string;
  lastHealingError?: string;
  repairStrategy?: string;
  recoveryReason?: string;
  healingHistory?: {
    attempt: number;
    startedAt: string;
    completedAt?: string;
    status: string;
    error?: string;
  }[];
};
export type HealingEntry = ScrapeRun;

export type DiscoverySearchRequest = {
  query?: string;
  category?: string;
  location?: string;
  deadlineWithinDays?: number;
  mode?: "remote" | "in_person" | "hybrid" | "any";
  skills?: string[];
  fresh?: boolean;
  limit?: number;
};
export type DiscoverySearchMeta = {
  query: string;
  requestedFresh: boolean;
  freshness: "fresh" | "stale" | "refreshed" | "empty";
  resultCount: number;
  newRecords: number;
  updatedRecords: number;
  candidatesDiscovered: number;
  extracted: number;
  extractionFailed: number;
  sources: string[];
  webSearched: boolean;
  discoveryError?: string;
};
export type DiscoverySearchResultItem = {
  opportunity: Opportunity;
  score: number;
  reasons: string[];
};
export type DiscoverySearchResponse = {
  results: DiscoverySearchResultItem[];
  meta: DiscoverySearchMeta;
};
export type IndexStats = {
  totalOpportunities: number;
  categories: Record<string, number>;
  sources: number;
  enabledSources: number;
  freshSources: number;
  failedSources: number;
  lastUpdatedAt: string | null;
  lastSuccessfulRunAt: string | null;
  scrapesRunningNow: number;
};

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000/api"
).replace(/\/$/, "");
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 30_000,
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    const body = await response.json().catch(() => null);

    if (!response.ok || body?.success === false) {
      throw new ApiError(
        response.status,
        body?.error?.code,
        body?.error?.message ||
          body?.error ||
          `Request failed (${response.status})`,
      );
    }

    return body.data as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(408, "REQUEST_TIMEOUT", "The request timed out.");
    }

    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "Could not connect to the FindOP backend.",
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

export const api = {
  opportunities: () => request<Opportunity[]>("/opportunities"),
  opportunity: (id: string) => request<Opportunity>(`/opportunities/${id}`),
  sources: () => request<Source[]>("/sources"),
  runs: () => request<ScrapeRun[]>("/scrape-runs"),
  healing: (id: string) => request<HealingEntry[]>(`/sources/${id}/healing`),
  health: (id: string) => request<unknown>(`/sources/${id}/health`),
  discoverySearch: (req: DiscoverySearchRequest) =>
    request<DiscoverySearchResponse>(
      "/discovery/search",
      { method: "POST", body: JSON.stringify(req) },
      480_000,
    ),
  indexStats: () => request<IndexStats>("/index/stats"),
};
