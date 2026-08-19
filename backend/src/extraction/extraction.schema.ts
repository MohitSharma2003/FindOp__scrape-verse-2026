import { z } from "zod";

export const extractionRequestSchema = z.object({
  candidates: z.array(z.object({
    url: z.string().trim().url().refine((value) => /^https?:\/\//i.test(value), "Candidate URL must use HTTP or HTTPS"),
    title: z.string().trim().optional(),
    searchQuery: z.string().trim().optional(),
    rank: z.number().int().positive().optional(),
  })).max(30),
});

export type ExtractionRequest = z.infer<typeof extractionRequestSchema>;
