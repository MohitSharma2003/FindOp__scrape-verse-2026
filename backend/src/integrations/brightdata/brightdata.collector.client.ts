import { env } from "../../config/env.js";
import { BrightDataError } from "./brightdata.client.js";

const BRIGHT_DATA_API_URL = "https://api.brightdata.com";
const MAX_BODY = 500;

export interface CollectorProvisionRequest { sourceUrl: string; sourceDomain: string; name: string; }
export interface CollectorProvisioner { createCollector(request: CollectorProvisionRequest): Promise<{ collectorId: string; scraperVersion?: string; ready?: boolean }>; }
export interface BrightDataCollectorProvisionerOptions { apiToken?: string; timeoutMs: number; pollIntervalMs: number; deliveryWebhook?: string; fetcher?: typeof fetch; }
interface ProviderObject { [key: string]: unknown; }

export class CollectorProvisioningUnavailableError extends Error { public constructor(message = "Bright Data collector provisioning is not configured") { super(message); } }

export class BrightDataCollectorProvisioner implements CollectorProvisioner {
  private readonly fetcher: typeof fetch;
  public constructor(private readonly options: BrightDataCollectorProvisionerOptions) { this.fetcher = options.fetcher ?? fetch; }

  public async createCollector(request: CollectorProvisionRequest) {
    if (!this.options.apiToken) throw new BrightDataError("BRIGHT_DATA_API_TOKEN is not configured");
    if (!this.options.deliveryWebhook) throw new CollectorProvisioningUnavailableError("BRIGHT_DATA_COLLECTOR_DELIVERY_WEBHOOK is not configured");
    const deadline = Date.now() + this.options.timeoutMs;
    const created = await this.requestJson<ProviderObject>("/dca/collector", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: request.name, deliver: { type: "webhook", endpoint: this.options.deliveryWebhook } }) }, deadline);
    const collectorId = this.readString(created.id) ?? this.readString(created.collector_id);
    if (!collectorId) throw new BrightDataError("Bright Data collector creation returned no collectorId");
    try {
      await this.requestJson(`/dca/collectors/${encodeURIComponent(collectorId)}/automate_template`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: CANONICAL_INSTRUCTION, urls: [request.sourceUrl] }) }, deadline);
      while (Date.now() < deadline) {
        const progress = await this.requestJson<ProviderObject>(`/dca/collectors/${encodeURIComponent(collectorId)}/automate_template/progress`, { method: "GET" }, deadline);
        const status = this.readString(progress.status)?.toLowerCase();
        if (status === "done" || status === "completed" || status === "success") return { collectorId, scraperVersion: "dev", ready: false };
        if (status && ["failed", "error", "rejected"].includes(status)) { console.warn("automate_template failed, returning collector with ready=false:", this.readString(progress.error) ?? this.readString(progress.message) ?? "template generation failed"); return { collectorId, scraperVersion: "dev", ready: false }; }
        await this.delay(Math.min(this.options.pollIntervalMs, deadline - Date.now()));
      }
      console.warn("automate_template timed out, returning collector with ready=false");
    } catch (error: unknown) {
      console.warn("automate_template error, returning collector with ready=false:", error instanceof Error ? error.message : "unknown error");
    }
    return { collectorId, scraperVersion: "dev", ready: false };
  }

  private async requestJson<T>(path: string, init: RequestInit, deadline: number): Promise<T> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new BrightDataError("Bright Data collector request timed out");
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), remaining);
    const method = init.method ?? "GET";
    const fullUrl = new URL(path, BRIGHT_DATA_API_URL).toString();
    console.log(`[BD-Collector] ${method} ${path}`);
    try {
      const response = await this.fetcher(new URL(path, BRIGHT_DATA_API_URL), { ...init, signal: controller.signal, headers: { Authorization: `Bearer ${this.options.apiToken ?? ""}`, ...init.headers } });
      const text = await response.text(); let payload: unknown;
      try { payload = text ? JSON.parse(text) as unknown : undefined; } catch { payload = undefined; }
      console.log(`[BD-Collector] ${method} ${path} → HTTP ${response.status}`);
      if (!response.ok) throw new BrightDataError(`Bright Data collector request failed with HTTP ${response.status}`, response.status, this.bound(text));
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new BrightDataError("Bright Data collector returned malformed JSON");
      return payload as T;
    } catch (error: unknown) {
      if (error instanceof BrightDataError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new BrightDataError("Bright Data collector request timed out");
      console.error(`[BD-Collector] ${method} ${path} → FAILED: ${error instanceof Error ? error.message : "unknown"}`);
      throw new BrightDataError(`Bright Data collector request failed: ${error instanceof Error ? error.message : "unknown error"}`);
    } finally { clearTimeout(timer); }
  }
  private readString(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
  private bound(value: string): string { const normalized = value.replace(/\s+/g, " ").trim(); return normalized.length > MAX_BODY ? `${normalized.slice(0, MAX_BODY)}...` : normalized; }
  private async delay(milliseconds: number) { await new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, milliseconds))); }
}

export class UnconfiguredCollectorProvisioner implements CollectorProvisioner { async createCollector(_request: CollectorProvisionRequest): Promise<never> { throw new CollectorProvisioningUnavailableError(); } }

export const defaultBrightDataCollectorProvisioner = new BrightDataCollectorProvisioner({ apiToken: env.BRIGHT_DATA_API_TOKEN, timeoutMs: env.BRIGHT_DATA_TIMEOUT_MS, pollIntervalMs: env.BRIGHT_DATA_POLL_INTERVAL_MS, deliveryWebhook: env.BRIGHT_DATA_COLLECTOR_DELIVERY_WEBHOOK });

const CANONICAL_INSTRUCTION = "Extract opportunity listings from the supplied URL as structured JSON. Return one record per opportunity with title, organization, description, opportunity_type, application_url, source_url, start_date, end_date, application_deadline, location, participation_mode, eligibility, required_skills_or_technologies, and prize_or_rewards. Use null when a field is unavailable. Do not return navigation, login, error, or unrelated records.";
