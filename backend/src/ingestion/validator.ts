import type {
  RawDevfolioRecord,
  ValidatedRawRecord,
} from "./types.js";

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  candidate?: ValidatedRawRecord;
}

export function validateRawRecord(value: unknown): ValidationResult {
  if (!isRecord(value)) {
    return { valid: false, reason: "record is not an object" };
  }

  const title = readNonEmptyString(value.title);

  if (!title) {
    return { valid: false, reason: "title is missing or empty" };
  }

  const opportunityUrl = firstValidUrl(value.hackathon_url, value.product_page_url);

  if (!opportunityUrl) {
    return {
      valid: false,
      reason: "no valid absolute hackathon or product URL",
    };
  }

  const applicationUrl = toAbsoluteUrl(value.product_page_url);

  return {
    valid: true,
    candidate: {
      record: value as RawDevfolioRecord,
      opportunityUrl,
      applicationUrl: applicationUrl ?? undefined,
    },
  };
}

function firstValidUrl(...values: unknown[]): string | undefined {
  for (const value of values) {
    const url = toAbsoluteUrl(value);

    if (url) {
      return url;
    }
  }

  return undefined;
}

function toAbsoluteUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  try {
    const url = new URL(value.trim());

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }

    return url.toString();
  } catch {
    return undefined;
  }
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
