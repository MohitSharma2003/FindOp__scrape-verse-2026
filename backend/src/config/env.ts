import "dotenv/config";

import { z } from "zod";

const optionalEnv = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    schema.optional(),
  );

const collectorVersionEnv = z.preprocess((value) => {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "") return undefined;
  if (normalized === "dev" || normalized === "production") return normalized;
  console.warn(
    `[env] Ignoring invalid BRIGHT_DATA_EXTRACTION_COLLECTOR_VERSION=${JSON.stringify(value)} (expected "dev" or "production"); extraction stays disabled`,
  );
  return undefined;
}, z.enum(["dev", "production"]).optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1),
  CORS_ORIGIN: optionalEnv(z.string().trim().min(1)),
  BRIGHT_DATA_API_TOKEN: optionalEnv(z.string().min(1)),
  BRIGHT_DATA_SERP_ZONE: z.string().trim().min(1).default("serp_api1"),
  BRIGHT_DATA_EXTRACTION_COLLECTOR_ID: optionalEnv(z.string().trim().min(1)),
  BRIGHT_DATA_EXTRACTION_COLLECTOR_VERSION: collectorVersionEnv,
  ENRICHMENT_BATCH_SIZE: z.coerce.number().int().min(0).max(30).default(6),
  DISCOVERY_SEARCH_EXTRACTION_LIMIT: z.coerce.number().int().min(1).max(10).default(3),
  SCHEDULER_ENABLED: z.coerce.boolean().default(true),
  SCHEDULER_TICK_SECONDS: z.coerce.number().int().min(15).max(3600).default(60),
  SCHEDULER_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(5).default(2),
  SERP_DISCOVERY_CANDIDATE_LIMIT: z.coerce.number().int().min(1).max(20).default(5),
  BRIGHT_DATA_COLLECTOR_DELIVERY_WEBHOOK: optionalEnv(z.string().url()),
  BRIGHT_DATA_TIMEOUT_MS: z.coerce.number().int().min(1000).max(900000).default(180000),
  BRIGHT_DATA_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60000).default(5000),
  BRIGHT_DATA_HEALING_TIMEOUT_MS: z.coerce.number().int().min(1000).max(900000).default(180000),
  SEARCH_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(900000).default(60000),
  SELF_HEALING_ENABLED: z.coerce.boolean().default(false),
  MAX_EXTRACTION_CANDIDATES: z.coerce.number().int().min(1).max(30).default(5),
  EXTRACTION_CONCURRENCY: z.coerce.number().int().min(1).max(2).default(2),
});

export const env = envSchema.parse(process.env);
