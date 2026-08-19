import "dotenv/config";

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1),
  BRIGHT_DATA_API_TOKEN: z.string().min(1).optional(),
  BRIGHT_DATA_SERP_ZONE: z.string().trim().min(1).default("serp_api1"),
  BRIGHT_DATA_EXTRACTION_COLLECTOR_ID: z.string().trim().min(1).optional(),
  BRIGHT_DATA_TIMEOUT_MS: z.coerce.number().int().min(1000).max(900000).default(180000),
  BRIGHT_DATA_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60000).default(5000),
  BRIGHT_DATA_HEALING_TIMEOUT_MS: z.coerce.number().int().min(1000).max(900000).default(180000),
  SEARCH_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(900000).default(600000),
  SELF_HEALING_ENABLED: z.coerce.boolean().default(false),
  MAX_EXTRACTION_CANDIDATES: z.coerce.number().int().min(1).max(30).default(5),
  EXTRACTION_CONCURRENCY: z.coerce.number().int().min(1).max(2).default(2),
});

export const env = envSchema.parse(process.env);
