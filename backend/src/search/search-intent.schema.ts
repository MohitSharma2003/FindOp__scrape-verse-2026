import { z } from "zod";
import { OPPORTUNITY_TYPES } from "./search-intent.types.js";

const boundedText = z.string().trim().min(1).max(200);
const textList = z.array(boundedText).max(50);
const range = z.object({
  min: z.number().int().nonnegative().optional(),
  max: z.number().int().nonnegative().optional(),
}).refine((value) => value.min === undefined || value.max === undefined || value.min <= value.max, {
  message: "min must be less than or equal to max",
});

const customDateRange = z.object({
  kind: z.literal("custom"),
  from: z.coerce.date(),
  to: z.coerce.date(),
}).refine((value) => value.from <= value.to, {
  message: "from must be less than or equal to to",
  path: ["to"],
});

export const dateFilterSchema = z.union([
  z.object({ kind: z.enum([
    "upcoming", "ongoing", "this_week", "this_month", "next_month",
    "next_7_days", "next_30_days", "next_90_days",
  ]) }),
  customDateRange,
]);

export const deadlineFilterSchema = z.union([
  z.object({ kind: z.enum(["any", "open", "closing_this_week", "closing_this_month"]) }),
  z.object({ kind: z.literal("within_days"), days: z.number().int().positive().max(3650) }),
  z.object({
    kind: z.literal("custom"),
    from: z.coerce.date(),
    to: z.coerce.date(),
  }).refine((value) => value.from <= value.to, {
    message: "from must be less than or equal to to",
    path: ["to"],
  }),
]);

export const searchIntentSchema = z.object({
  type: z.enum(OPPORTUNITY_TYPES),
  keywords: textList.default([]),
  location: z.object({
    country: boundedText.optional(),
    city: boundedText.nullable().optional(),
    region: boundedText.nullable().optional(),
  }).optional(),
  mode: z.enum(["remote", "in_person", "hybrid", "any"]).default("any"),
  eligibility: z.object({
    student: z.boolean().optional(),
    professional: z.boolean().optional(),
    beginner: z.boolean().optional(),
    experienceLevel: boundedText.optional(),
    ageRange: range.optional(),
  }).optional(),
  date: dateFilterSchema.optional(),
  deadline: deadlineFilterSchema.optional(),
  skills: textList.default([]),
  typeFilters: z.object({
    technologies: textList.optional(),
    teamSize: range.optional(),
    duration: boundedText.optional(),
    paid: z.boolean().optional(),
    field: boundedText.optional(),
    funded: z.boolean().optional(),
    prize: boundedText.optional(),
  }).optional(),
});

export type SearchIntent = z.infer<typeof searchIntentSchema>;
