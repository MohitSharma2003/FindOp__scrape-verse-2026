import { BrightDataError } from "./brightdata.client.js";

const BRIGHT_DATA_API_URL = "https://api.brightdata.com";

export interface BrightDataHealingClientOptions {
  apiToken?: string;
  timeoutMs: number;
  pollIntervalMs: number;
}

export interface BrightDataHealingResult {
  success: boolean;
  pendingApproval: boolean;
  status: string;
  startedFrom?: "triggered" | "already_in_progress" | "template_created";
  productionState?: "not_verified" | "verified";
  repairedScraper?: {
    collectorId: string;
    version: "dev";
    template: Record<string, unknown>;
  };
  error?: string;
}

interface HealingProgress {
  [key: string]: unknown;
  status?: string;
  message?: string;
  error?: string;
}

const MAX_RESPONSE_BODY_LENGTH = 500;

export class BrightDataHealingClient {
  public constructor(private readonly options: BrightDataHealingClientOptions) {}

  public async heal(
    collectorId: string,
    repairInstruction: string,
    customInput: unknown[] = [],
  ): Promise<BrightDataHealingResult> {
    if (!this.options.apiToken) {
      throw new BrightDataError("BRIGHT_DATA_API_TOKEN is not configured");
    }

    const deadline = Date.now() + this.options.timeoutMs;
    const triggerUrl = new URL(
      `/dca/collectors/${encodeURIComponent(collectorId)}/refactor_template`,
      BRIGHT_DATA_API_URL,
    );

    let startedFrom: "triggered" | "already_in_progress" | "template_created" = "triggered";
    try {
      await this.requestJson(triggerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: repairInstruction, custom_input: customInput }),
      }, deadline);
    } catch (error: unknown) {
      if (this.isMissingTemplateError(error)) {
        console.log("refactor_template failed: no template exists, trying automate_template");
        await this.createTemplate(collectorId, repairInstruction, customInput, deadline);
        startedFrom = "template_created";
        try {
          await this.requestJson(triggerUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: repairInstruction, custom_input: customInput }),
          }, deadline);
        } catch (retryError: unknown) {
          if (!this.isActiveRefactorConflict(retryError)) throw retryError;
          startedFrom = "already_in_progress";
        }
      } else if (!this.isActiveRefactorConflict(error)) {
        throw error;
      } else {
        startedFrom = "already_in_progress";
      }
    }

    while (Date.now() < deadline) {
      const progressUrl = new URL(
        `/dca/collectors/${encodeURIComponent(collectorId)}/refactor_template/progress`,
        BRIGHT_DATA_API_URL,
      );
      const progress = await this.requestJson<HealingProgress>(progressUrl, {
        method: "GET",
      }, deadline);
      const status = progress.status?.toLowerCase() ?? "unknown";

      if (status === "pending_answer") {
        try {
          const approveUrl = new URL(
            `/dca/collectors/${encodeURIComponent(collectorId)}/resume_automation_job`,
            BRIGHT_DATA_API_URL,
          );
          await this.requestJson(approveUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: true, auto_save: true }),
          }, deadline);
          await this.delay(Math.min(this.options.pollIntervalMs, deadline - Date.now()));
          continue;
        } catch {
          return {
            success: false,
            pendingApproval: true,
            status,
            startedFrom,
            error: "Bright Data requires approval before continuing self-healing",
          };
        }
      }

      if (["done", "completed", "success", "ready"].includes(status)) {
        const template = typeof progress.template === "object" && progress.template !== null && !Array.isArray(progress.template)
          ? progress.template as Record<string, unknown>
          : { ...progress };
        return {
          success: true,
          pendingApproval: false,
          status,
          startedFrom,
          productionState: "not_verified",
          repairedScraper: {
            collectorId,
            version: "dev",
            template,
          },
        };
      }

      if (["failed", "error", "rejected"].includes(status)) {
        return {
          success: false,
          pendingApproval: false,
          status,
          startedFrom,
          error: progress.error ?? progress.message ?? "Bright Data healing failed",
        };
      }

      await this.delay(Math.min(this.options.pollIntervalMs, deadline - Date.now()));
    }

    throw new BrightDataError(
      `Bright Data healing timed out after ${this.options.timeoutMs}ms`,
    );
  }

  private isActiveRefactorConflict(error: unknown): boolean {
    if (!(error instanceof BrightDataError) || error.statusCode !== 409) return false;
    const detail = `${error.message} ${error.providerMessage ?? ""}`.toLowerCase();
    return /refactor|healing/.test(detail) && /(already|still|in.?progress|running|active)/.test(detail);
  }

  private isMissingTemplateError(error: unknown): boolean {
    if (!(error instanceof BrightDataError)) return false;
    const body = `${error.message} ${error.providerMessage ?? ""}`.toLowerCase();
    return (error.statusCode === 500 || error.statusCode === 404) && /missing.*template|no.*template|template.*not/.test(body);
  }

  private async createTemplate(
    collectorId: string,
    description: string,
    customInput: unknown[],
    deadline: number,
  ): Promise<void> {
    const urls = customInput
      .filter((item): item is { url: string } => typeof item === "object" && item !== null && "url" in item)
      .map((item) => item.url)
      .filter(Boolean);

    const automateUrl = new URL(
      `/dca/collectors/${encodeURIComponent(collectorId)}/automate_template`,
      BRIGHT_DATA_API_URL,
    );

    await this.requestJson(automateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, urls: urls.length > 0 ? urls : undefined }),
    }, deadline);

    while (Date.now() < deadline) {
      const progressUrl = new URL(
        `/dca/collectors/${encodeURIComponent(collectorId)}/automate_template/progress`,
        BRIGHT_DATA_API_URL,
      );
      const progress = await this.requestJson<HealingProgress>(progressUrl, { method: "GET" }, deadline);
      const status = progress.status?.toLowerCase() ?? "unknown";
      if (["done", "completed", "success"].includes(status)) return;
      if (["failed", "error", "rejected"].includes(status)) {
        throw new BrightDataError(`automate_template failed: ${progress.error ?? progress.message ?? status}`);
      }
      await this.delay(Math.min(this.options.pollIntervalMs, deadline - Date.now()));
    }
    throw new BrightDataError("automate_template timed out");
  }

  private async requestJson<T = unknown>(url: URL, init: RequestInit, deadline: number): Promise<T> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new BrightDataError("Bright Data healing timed out");
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
      const contentType = response.headers?.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() || "unknown";
      const boundedBody = this.boundResponseBody(text);
      const expectsJson = contentType === "application/json" || contentType.endsWith("+json") || this.looksLikeJson(text);
      let payload: unknown = {};

      if (text.length > 0 && expectsJson) {
        try {
          payload = JSON.parse(text) as unknown;
        } catch {
          throw this.responseError(response.status, contentType, boundedBody, "invalid JSON");
        }
      } else if (text.length > 0) {
        throw this.responseError(response.status, contentType, boundedBody, "non-JSON response");
      } else {
        throw this.responseError(response.status, contentType, "<empty>", "empty response");
      }

      if (!response.ok) {
        throw new BrightDataError(
          this.responseDiagnostic(response.status, contentType, boundedBody),
          response.status,
          boundedBody,
          undefined,
          contentType,
        );
      }

      return payload as T;
    } catch (error: unknown) {
      if (error instanceof BrightDataError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new BrightDataError("Bright Data healing request timed out");
      }

      const message = error instanceof Error ? error.message : "Unknown error";
      throw new BrightDataError(`Bright Data healing request failed: ${message}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  private responseError(status: number, contentType: string, body: string, kind: string): BrightDataError {
    return new BrightDataError(
      `Bright Data healing response error (${kind}): ${this.responseDiagnostic(status, contentType, body)}`,
      status,
      body,
      undefined,
      contentType,
    );
  }

  private responseDiagnostic(status: number, contentType: string, body: string): string {
    return `HTTP ${status}; content-type ${contentType}; body ${body}`;
  }

  private boundResponseBody(body: string): string {
    const normalized = body.replace(/\s+/g, " ").trim();
    return normalized.length > MAX_RESPONSE_BODY_LENGTH
      ? `${normalized.slice(0, MAX_RESPONSE_BODY_LENGTH)}...`
      : normalized;
  }

  private looksLikeJson(body: string): boolean {
    const first = body.trimStart()[0];
    return first === "{" || first === "[";
  }

  private async delay(milliseconds: number): Promise<void> {
    await new Promise<void>((resolve) =>
      setTimeout(resolve, Math.max(0, milliseconds)),
    );
  }
}
