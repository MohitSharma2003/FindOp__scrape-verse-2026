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

  const title = readNonEmptyString(value.title ?? value.name);

  if (!title) {
    return { valid: false, reason: "title is missing or empty" };
  }

  const opportunityUrl = firstValidUrl(
    value.hackathon_url,
    value.product_page_url,
    value.url,
    value.source_url,
    value.opportunityUrl,
    value.opportunity_url,
    value.application_url,
    value.applicationUrl,
    value.registration_url,
  );

  if (!opportunityUrl) {
    return {
      valid: false,
      reason: "no valid absolute URL found",
    };
  }

  const applicationUrl = firstValidUrl(
    value.product_page_url,
    value.application_url,
    value.applicationUrl,
    value.registration_url,
    value.applyUrl,
  );

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
