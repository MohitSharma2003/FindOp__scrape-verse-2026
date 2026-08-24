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

export type DemoTimelineEntry = { step: string; detail?: string; at?: string };
export type DemoRecord = {
  title: string;
  url: string;
  category: string;
  organization?: string;
  location?: string;
  mode?: string;
  deadline?: string | null;
  description?: string;
  signalCategory?: string;
};
export type DemoRunStatus =
  | "queued"
  | "discovering"
  | "extracting"
  | "healthy"
  | "broken"
  | "healing"
  | "recovered"
  | "escalated"
  | "failed";
export type DemoState = {
  _id: string;
  config: { url: string; category: string; domain?: string };
  originalConfig?: { url: string; category: string } | null;
  status: DemoRunStatus;
  progress?: { step?: string; done?: number; total?: number };
  discoveredUrls: string[];
  extractionFailures: { url: string; error: string }[];
  records: DemoRecord[];
  stats: { found: number; valid: number; rejected: number };
  validationErrors: string[];
  healingAttempts: number;
  healingTimeline: DemoTimelineEntry[];
  scrapedAt?: string;
  createdAt?: string;
};
export type DemoScraper = {
  _id: string;
  name: string;
  inputUrl: string;
  domain: string;
  category: string;
  discoveryKeywords: string[];
  runCount: number;
  lastRunAt?: string;
  promotedSourceId?: string | null;
  promotedAt?: string | null;
  createdAt?: string;
};

export type AuthUserPayload = { name: string; email: string };
export type AuthSession = { token: string; user: AuthUserPayload };
export type OtpRequestResult = {
  message: string;
  email: string;
  expiresAt: string;
};
export type OpportunityPage = {
  items: Opportunity[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

/* ── Token storage ───────────────────────────────────────────────────────── */

const TOKEN_STORAGE_KEY = "findop-token";

/** localStorage wrapper that never throws (private mode, quota, etc.). */
export const authToken = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  },
  set(token: string): void {
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch {
      /* storage unavailable — session stays in memory only */
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  },
};

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000/api"
).replace(/\/$/, "");

// The OAuth redirect flow is currently not exposed in the UI (buttons were
// removed until provider apps are registered). The backend routes stay live,
// so this helper is kept around for when the buttons come back.
export function oauthUrl(provider: "google" | "github", next: string): string {
  return `${API_URL}/auth/oauth/${provider}?next=${encodeURIComponent(next)}`;
}

/** Error thrown for any non-success response or network failure. */
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

/**
 * Single fetch wrapper for the whole app: JSON in/out, auth header, timeout,
 * and normalised errors. Every endpoint below goes through this.
 */
async function request<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 30_000,
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const token = authToken.get();
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

/* ── Endpoints ───────────────────────────────────────────────────────────── */

export const api = {
  opportunities: () => request<Opportunity[]>("/opportunities"),
  opportunitiesPage: (limit: number, offset: number) =>
    request<OpportunityPage>(
      `/opportunities?limit=${limit}&offset=${offset}`,
    ),
  opportunity: (id: string) => request<Opportunity>(`/opportunities/${id}`),
  sources: () => request<Source[]>("/sources"),
  runs: () => request<ScrapeRun[]>("/scrape-runs"),
  scrapeSource: (id: string) =>
    request<{ message: string }>(`/sources/${id}/scrape`, { method: "POST" }, 600_000),
  healSource: (id: string) =>
    request<{ status?: string }>(`/sources/${id}/heal`, { method: "POST" }, 600_000),
  healing: (id: string) => request<HealingEntry[]>(`/sources/${id}/healing`),
  health: (id: string) => request<unknown>(`/sources/${id}/health`),
  discoverySearch: (req: DiscoverySearchRequest) =>
    request<DiscoverySearchResponse>(
      "/discovery/search",
      { method: "POST", body: JSON.stringify(req) },
      480_000,
    ),
  indexStats: () => request<IndexStats>("/index/stats"),
  demoState: () => request<DemoState>("/demo/state"),
  demoScrape: (body?: { url?: string; category?: string }) =>
    request<DemoState>("/demo/scrape", { method: "POST", body: JSON.stringify(body ?? {}) }),
  demoBreak: () => request<DemoState>("/demo/break", { method: "POST" }),
  demoHeal: () => request<DemoState>("/demo/heal", { method: "POST" }),
  demoReset: () => request<DemoState>("/demo/reset", { method: "POST" }),
  demoScrapers: () => request<DemoScraper[]>("/demo/scrapers"),
  demoPromote: (scraperId?: string) =>
    request<{ alreadyPromoted: boolean; sourceId: string }>("/demo/promote", {
      method: "POST",
      body: JSON.stringify(scraperId ? { scraperId } : {}),
    }),
  signup: (body: { name: string; email: string; password: string }) =>
    request<OtpRequestResult>("/auth/signup", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  verifyOtp: (body: { email: string; code: string }) =>
    request<AuthSession>("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  resendOtp: (email: string) =>
    request<OtpRequestResult>("/auth/resend-otp", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  login: (body: { email: string; password: string }) =>
    request<AuthSession>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  me: () => request<{ user: AuthUserPayload }>("/auth/me"),
};
