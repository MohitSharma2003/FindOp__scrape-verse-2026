export interface RawDevfolioRecord {
  title?: unknown;
  status?: unknown;
  application_status?: unknown;
  location?: unknown;
  hackathon_url?: unknown;
  product_page_url?: unknown;
  start_date?: unknown;
  themes?: unknown;
  participation_mode?: unknown;
  input?: unknown;
  [key: string]: unknown;
}

export interface ValidatedRawRecord {
  record: RawDevfolioRecord;
  opportunityUrl: string;
  applicationUrl?: string;
}

export interface NormalizedOpportunity {
  title: string;
  organization: string;
  description: string;
  eligibility: string;
  category: "hackathon" | "internship" | "job" | "fellowship" | "scholarship" | "grant" | "competition" | "program" | "other";
  url: string;
  opportunityUrl: string;
  applicationUrl?: string;
  source: string;
  sourceId?: string;
  location: string;
  skills: string[];
  status: "upcoming" | "open" | "closed" | "unknown";
  startDate: Date | null;
  endDate?: Date | null;
  deadline?: Date | null;
  mode?: "remote" | "in_person" | "hybrid" | "any" | null;
  prize?: string;
  scrapedAt: Date;
}

export interface ValidationError {
  index: number;
  reason: string;
}

export interface PersistenceSummary {
  /** Documents inserted by the upsert (brand-new opportunities). */
  newRecords: number;
  /** Existing documents matched and overwritten by the upsert. */
  updatedRecords: number;
}

export interface IngestionResult extends PersistenceSummary {
  recordsFound: number;
  recordsValid: number;
  recordsRejected: number;
  duplicatesFound: number;
  recordsPersisted: number;
  staleArtifactsRemoved?: number;
  validationErrors: ValidationError[];
}
