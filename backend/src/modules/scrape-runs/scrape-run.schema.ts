import { z } from "zod";

export const createScrapeRunSchema = z.object({
  sourceId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid source ID"),
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date().optional(),
  status: z.enum(["running", "success", "partial", "failed"]),
  recordsFound: z.number().int().nonnegative().default(0),
  recordsValid: z.number().int().nonnegative().default(0),
  recordsRejected: z.number().int().nonnegative().default(0),
  duplicatesFound: z.number().int().nonnegative().default(0),
  recordsPersisted: z.number().int().nonnegative().default(0),
  validationErrors: z.array(z.string()).default([]),
  error: z.string().trim().min(1).optional(),
  healthStatus: z.enum(["healthy", "degraded", "failed"]).optional(),
  healthSeverity: z.enum(["info", "warning", "critical"]).optional(),
  healthReasons: z.array(z.string()).default([]),
  healthMetrics: z.object({
    baselineRecords: z.number().optional(),
    currentRecords: z.number(),
    validationFailureRate: z.number(),
    recordCountRatio: z.number().optional(),
  }).optional(),
  healingStatus: z.enum(["pending", "diagnosing", "repairing", "verifying", "recovered", "repair_available", "escalated"]).optional(),
  healingAttempts: z.number().int().nonnegative().default(0),
  lastHealingStartedAt: z.coerce.date().optional(),
  lastHealingCompletedAt: z.coerce.date().optional(),
  lastHealingError: z.string().trim().min(1).optional(),
  repairStrategy: z.string().trim().min(1).optional(),
  recoveryReason: z.string().trim().min(1).optional(),
  healingHistory: z.array(z.object({
    attempt: z.number().int().positive(),
    startedAt: z.coerce.date(),
    completedAt: z.coerce.date().optional(),
    status: z.string().min(1),
    error: z.string().optional(),
  })).default([]),
});

export type CreateScrapeRunInput = z.infer<typeof createScrapeRunSchema>;
