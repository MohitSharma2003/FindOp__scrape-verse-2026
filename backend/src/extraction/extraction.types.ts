import type { NormalizedOpportunity } from "../ingestion/types.js";

export interface ExtractionCandidate {
  url: string;
  title?: string;
  /** SERP snippet carried over from discovery; honest fallback when a collector record lacks prose. */
  description?: string;
  searchQuery?: string;
  rank?: number;
}

export interface ExtractedOpportunity {
  title: string;
  organization?: string;
  description?: string;
  opportunityUrl: string;
  applicationUrl?: string;
  type?: string;
  startDate?: Date;
  endDate?: Date;
  deadline?: Date;
  location?: string;
  mode?: "remote" | "in_person" | "hybrid" | "any";
  eligibility?: string;
  skills?: string[];
  prize?: string;
  source: { url: string; domain: string };
}

export interface ExtractionResultItem {
  url: string;
  status: "extracted" | "rejected";
  opportunity?: NormalizedOpportunity;
  extractionQuality?: ExtractionQuality;
  healing?: ExtractionHealingMetadata;
  error?: string;
}

export interface ExtractionQuality {
  status: "healthy" | "incomplete";
  score: number;
  missingFields: string[];
  criticalFieldsPresent: string[];
  importantFieldsPresent: string[];
}

export interface ExtractionHealingMetadata {
  attempted: boolean;
  status: "not_needed" | "recovered" | "repair_available" | "failed" | "pending_approval" | "timeout" | "no_improvement";
  reason?: string;
  missingFields: string[];
  originalQualityScore: number;
  healedQualityScore?: number;
  error?: string;
  healingImproved: boolean;
  productionState: "not_attempted" | "not_verified" | "verified";
}

export interface ExtractionBatchResult {
  candidatesReceived: number;
  candidatesProcessed: number;
  extracted: number;
  rejected: number;
  persisted: number;
  newRecords?: number;
  updatedRecords?: number;
  duplicates: number;
  results: ExtractionResultItem[];
}

export interface ExtractionClient {
  extract(url: string): Promise<unknown>;
}
