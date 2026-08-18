import { z } from "zod";

export const createOpportunitySchema = z.object({
    title: z.string().trim().min(1),
    organization: z.string().trim().min(1),
    description: z.string().trim().min(1),

    category: z.enum([
        "hackathon",
        "internship",
        "job",
        "fellowship",
        "scholarship",
        "competition",
        "program",
        "other"
    ]),

    url: z.string().trim().url(),
    source: z.string().trim().min(1),

    location: z.string().trim().min(1).default("Remote"),

    eligibility: z.string().trim().default(""),

    skills: z.array(z.string().trim()).default([]),

    deadline: z.coerce.date().optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),

    status: z
    .enum(["active", "closed", "unknown"])
    .default("active"),

    scrapedAt: z.coerce.date().optional(),
});

export type createOpportunityInput = z.infer<
    typeof createOpportunitySchema
>;



