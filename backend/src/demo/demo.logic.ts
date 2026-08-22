import {
  classifyOpportunityCategory,
  hasMeaningfulOpportunitySignal,
} from "../ingestion/category-classifier.js";
import type { NormalizedOpportunity } from "../ingestion/types.js";

export type DemoCategory =
  | "hackathon"
  | "internship"
  | "job"
  | "fellowship"
  | "scholarship"
  | "grant"
  | "competition"
  | "program"
  | "other";

export interface DemoConfig {
  url: string;
  category: DemoCategory;
}

export const DEMO_DEFAULT_CONFIG: DemoConfig = {
  url: "https://developerweek-2026-hackathon.devpost.com/",
  category: "hackathon",
};

export const DEMO_MAX_HEALING_ATTEMPTS = 2;

/** How many discovered pages one sandbox run extracts in parallel. */
export const DEMO_CANDIDATE_LIMIT = 8;

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

export const DEMO_IN_FLIGHT_STATUSES: DemoRunStatus[] = [
  "queued",
  "discovering",
  "extracting",
  "healing",
];

export function isDemoRunInFlight(status: string): boolean {
  return (DEMO_IN_FLIGHT_STATUSES as string[]).includes(status);
}

export interface DemoTarget {
  inputUrl: string;
  domain: string;
}

/**
 * Accepts anything close to a URL a visitor would paste ("wemakedevs.org")
 * and returns the canonical input URL plus the registrable domain used for
 * site-scoped discovery.
 */
export function parseDemoTarget(rawUrl: string): { ok: true; target: DemoTarget } | { ok: false; error: string } {
  const trimmed = rawUrl.trim();
  if (!trimmed) return { ok: false, error: "url must be a website address" };
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, error: `"${trimmed}" is not a valid website address` };
  }
  if (!/^https?:$/.test(parsed.protocol)) return { ok: false, error: "url must use http or https" };
  const host = parsed.hostname.toLowerCase();
  if (!host || !host.includes(".") || /\s/.test(host)) {
    return { ok: false, error: `"${trimmed}" does not look like a website address` };
  }
  if (/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) {
    return { ok: false, error: "internal addresses are not allowed" };
  }
  const domain = host.replace(/^www\./i, "");
  const inputUrl = `${parsed.protocol}//${host}${parsed.pathname === "/" ? "/" : parsed.pathname}${parsed.search}`;
  return { ok: true, target: { inputUrl, domain } };
}

/** Site-scoped keywords fed to the same query builder production uses. */
export function buildDemoDiscoveryKeywords(domain: string): string[] {
  return [`site:${domain}`];
}

/**
 * One-click break: pick a category that visibly contradicts the content so
 * judges never have to hand-edit configuration.
 */
export function pickBreakCategory(current: string): DemoCategory {
  const choices: DemoCategory[] = ["internship", "scholarship", "grant", "fellowship"];
  return choices.find((choice) => choice !== current) ?? "other";
}

export interface DemoRecordView {
  title: string;
  url: string;
  category: DemoCategory;
  signalCategory: DemoCategory | null;
  conflictsWithConfig: boolean;
  organization: string;
  location: string;
  mode?: string | null;
  deadline: Date | null;
  description: string;
}

export interface RunVerdict {
  status: "healthy" | "broken";
  classifiedCount: number;
  conflictCount: number;
  signalMajorityCategory: DemoCategory | null;
  evidence: string[];
}

export function isValidDemoCategory(value: string): value is DemoCategory {
  return (
    value === "hackathon" ||
    value === "internship" ||
    value === "job" ||
    value === "fellowship" ||
    value === "scholarship" ||
    value === "grant" ||
    value === "competition" ||
    value === "program" ||
    value === "other"
  );
}

export function validateDemoConfigInput(
  value: unknown,
): { ok: true; config: Partial<DemoConfig> } | { ok: false; error: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "config must be a JSON object with url and/or category" };
  }
  const raw = value as Record<string, unknown>;
  const patch: Partial<DemoConfig> = {};

  if (raw.url !== undefined) {
    if (typeof raw.url !== "string" || !/^https?:\/\/.+/i.test(raw.url.trim())) {
      return { ok: false, error: "url must be a valid http(s) URL" };
    }
    patch.url = raw.url.trim();
  }

  if (raw.category !== undefined) {
    if (typeof raw.category !== "string" || !isValidDemoCategory(raw.category.trim())) {
      return { ok: false, error: `category must be one of: hackathon, internship, job, fellowship, scholarship, grant, competition, program, other` };
    }
    patch.category = raw.category.trim() as DemoCategory;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "config must include url and/or category" };
  }
  return { ok: true, config: patch };
}

export function classifyRecordAgainstConfig(
  record: NormalizedOpportunity,
  config: DemoConfig,
): DemoRecordView {
  const signal = classifyOpportunityCategory({
    title: record.title,
    url: record.opportunityUrl || record.url,
    description: record.description,
  });
  const strongSignal =
    hasMeaningfulOpportunitySignal(record.title, [
      record.organization,
      record.description,
      record.location,
      ...(record.skills ?? []),
    ]) && signal !== "other";

  return {
    title: record.title,
    url: record.opportunityUrl || record.url,
    category: record.category,
    signalCategory: signal,
    conflictsWithConfig: strongSignal && signal !== config.category,
    organization: record.organization,
    location: record.location,
    mode: record.mode ?? null,
    deadline: record.deadline ? new Date(record.deadline) : null,
    description: record.description,
  };
}

export function computeRunVerdict(
  records: DemoRecordView[],
): RunVerdict {
  const classified = records.filter((r) => r.signalCategory !== null);
  const conflicts = records.filter((r) => r.conflictsWithConfig);
  const counts = new Map<DemoCategory, number>();
  for (const record of classified) {
    counts.set(record.signalCategory!, (counts.get(record.signalCategory!) ?? 0) + 1);
  }
  let majority: DemoCategory | null = null;
  let majorityCount = 0;
  for (const [category, count] of counts) {
    if (count > majorityCount) {
      majority = category;
      majorityCount = count;
    }
  }

  const evidence: string[] = [];
  if (conflicts.length > 0) {
    const sample = conflicts.slice(0, 3).map((r) => `"${r.title}" is ${r.signalCategory}, not ${r.category}`);
    evidence.push(...sample);
  }

  const broken =
    classified.length > 0 &&
    majority !== null &&
    conflicts.length >= Math.max(1, Math.ceil(classified.length * 0.6));

  return {
    status: broken ? "broken" : "healthy",
    classifiedCount: classified.length,
    conflictCount: conflicts.length,
    signalMajorityCategory: majority,
    evidence,
  };
}

export type HealOutcome = "recovered" | "escalated";

export function decideHealOutcome(options: {
  verdictBefore: RunVerdict;
  verdictAfter: RunVerdict;
  attempts: number;
}): { outcome: HealOutcome; correctedCategory: DemoCategory | null; reason: string } {
  const after = options.verdictAfter;
  const repairedCategoryIsCoherent =
    after.signalMajorityCategory !== null &&
    after.conflictCount === 0 &&
    after.classifiedCount > 0;

  if (repairedCategoryIsCoherent) {
    return {
      outcome: "recovered",
      correctedCategory: after.signalMajorityCategory,
      reason: `Content signals consistently indicate "${after.signalMajorityCategory}" across ${after.classifiedCount} records`,
    };
  }

  if (options.attempts >= DEMO_MAX_HEALING_ATTEMPTS) {
    return {
      outcome: "escalated",
      correctedCategory: null,
      reason: "Verification health failed after the maximum healing attempts",
    };
  }

  return {
    outcome: "escalated",
    correctedCategory: null,
    reason: "Verification did not produce coherent content signals",
  };
}
