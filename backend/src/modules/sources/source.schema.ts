import { z } from "zod";

export const createSourceSchema = z.object({
  name: z.string().trim().min(1),
  url: z.string().trim().url(),
  category: z.enum(["hackathon", "internship", "job", "fellowship", "scholarship", "competition", "program", "other"]).default("hackathon"),
  collectorId: z.string().trim().min(1).optional(),
  enabled: z.boolean().default(true),
  healthStatus: z.enum(["healthy", "unhealthy", "unknown"]).default("unknown"),
  scraperVersion: z.string().trim().min(1).optional(),
}).superRefine((value, context) => {
  if (value.enabled && !value.collectorId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["collectorId"], message: "Enabled sources require collectorId" });
  }
});

export const updateSourceSchema = z.object({
  name: z.string().trim().min(1).optional(),
  url: z.string().trim().url().optional(),
  category: z.enum(["hackathon", "internship", "job", "fellowship", "scholarship", "competition", "program", "other"]).optional(),
  collectorId: z.string().trim().min(1).nullable().optional(),
  enabled: z.boolean().optional(),
  scraperVersion: z.string().trim().min(1).nullable().optional(),
});

export const sourceEnabledSchema = z.object({ enabled: z.boolean() });

export type CreateSourceInput = z.infer<typeof createSourceSchema>;
export type UpdateSourceInput = z.infer<typeof updateSourceSchema>;
