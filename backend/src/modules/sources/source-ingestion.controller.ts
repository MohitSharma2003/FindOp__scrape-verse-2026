import type { Request, Response } from "express";
import { z } from "zod";
import { createSourceIngestionDependencies, ingestDiscoveredCandidates } from "./source-ingestion.service.js";
import { defaultSourceResolverDependencies } from "./source-resolver.service.js";
import { scheduleSourceActivation } from "./source-provisioning.service.js";

const candidateSchema = z.object({
  url: z.string().url(),
  title: z.string().default(""),
  description: z.string().default(""),
  source: z.literal("web_search").default("web_search"),
  searchQuery: z.string().default("manual"),
  rank: z.number().int().positive().default(1),
  discoveryMetadata: z.object({ domain: z.string().min(1), category: z.string().optional() }).optional(),
});

export const candidatesRequestSchema = z.union([
  z.array(candidateSchema).min(1).max(30),
  z.object({ candidates: z.array(candidateSchema).min(1).max(30) }),
]);

export function parseCandidateRequest(body: unknown) {
  const parsed = candidatesRequestSchema.safeParse(body);
  if (!parsed.success) return parsed;
  const candidates = Array.isArray(parsed.data) ? parsed.data : parsed.data.candidates;
  return { success: true as const, data: candidates.map((candidate) => ({
    ...candidate,
    discoveryMetadata: candidate.discoveryMetadata ?? { domain: new URL(candidate.url).hostname },
  })) };
}

export async function ingestCandidatesController(req: Request, res: Response): Promise<void> {
  const parsed = parseCandidateRequest(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: "INVALID_CANDIDATES", message: "Invalid candidate list" } });
    return;
  }
  const data = await ingestDiscoveredCandidates(parsed.data, createSourceIngestionDependencies(defaultSourceResolverDependencies()));
  for (const outcome of data) {
    if (outcome.resolution.status === "onboarded" || outcome.resolution.status === "reused") {
      scheduleSourceActivation(outcome.resolution.source.id);
    }
  }
  res.status(200).json({ success: true, data });
}
