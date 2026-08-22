import { z } from "zod";

export const createSourceSchema = z.object({
  name: z.string().trim().min(1),
  url: z.string().trim().url(),
  category: z.enum(["hackathon", "internship", "job", "fellowship", "scholarship", "grant", "competition", "program", "other"]).default("hackathon"),
  kind: z.enum(["collector", "serp_discovery"]).default("collector"),
  discoveryKeywords: z.array(z.string().trim().min(1)).max(8).optional(),
  scrapeFrequencyMinutes: z.number().int().min(15).max(20160).default(1440),
  collectorId: z.string().trim().min(1).optional(),
  enabled: z.boolean().default(true),
  healthStatus: z.enum(["healthy", "unhealthy", "unknown"]).default("unknown"),
  scraperVersion: z.string().trim().min(1).optional(),
}).superRefine((value, context) => {
  if (value.kind === "serp_discovery") {
    if (!value.discoveryKeywords || value.discoveryKeywords.length === 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["discoveryKeywords"], message: "SERP discovery sources require discoveryKeywords" });
    }
    return;
  }
  if (value.enabled && !value.collectorId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["collectorId"], message: "Enabled sources require collectorId" });
  }
});

export const updateSourceSchema = z.object({
  name: z.string().trim().min(1).optional(),
  url: z.string().trim().url().optional(),
  category: z.enum(["hackathon", "internship", "job", "fellowship", "scholarship", "grant", "competition", "program", "other"]).optional(),
  kind: z.enum(["collector", "serp_discovery"]).optional(),
  discoveryKeywords: z.array(z.string().trim().min(1)).max(8).nullable().optional(),
  scrapeFrequencyMinutes: z.number().int().min(15).max(20160).optional(),
  nextRunAt: z.coerce.date().nullable().optional(),
  collectorId: z.string().trim().min(1).nullable().optional(),
  enabled: z.boolean().optional(),
  scraperVersion: z.string().trim().min(1).nullable().optional(),
});

export const sourceEnabledSchema = z.object({ enabled: z.boolean() });

export type CreateSourceInput = z.infer<typeof createSourceSchema>;
export type UpdateSourceInput = z.infer<typeof updateSourceSchema>;
