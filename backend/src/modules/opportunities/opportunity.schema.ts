import { z } from "zod";

export const createOpportunitySchema = z.object({
    title: z.string().trim().min(1),
    organization: z.string().trim().default(""),
    description: z.string().trim().default(""),

    category: z.enum([
        "hackathon",
        "internship",
        "job",
        "fellowship",
        "scholarship",
        "grant",
        "competition",
        "program",
        "other"
    ]),

    url: z.string().trim().url(),
    opportunityUrl: z.string().trim().url().optional(),
    applicationUrl: z.string().trim().url().optional(),
    sourceId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
    externalId: z.string().trim().min(1).optional(),
    source: z.string().trim().default(""),

    location: z.string().trim().min(1).default("Remote"),

    eligibility: z.string().trim().default(""),

    skills: z.array(z.string().trim()).default([]),

    deadline: z.coerce.date().optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),

    status: z
    .enum(["active", "upcoming", "open", "closed", "unknown"])
    .default("active"),

    scrapedAt: z.coerce.date().optional(),
});

export type createOpportunityInput = z.infer<
    typeof createOpportunitySchema
>;



