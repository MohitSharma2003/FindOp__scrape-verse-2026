import { Schema, model, type InferSchemaType } from "mongoose";

export const DEMO_CATEGORIES = [
  "hackathon",
  "internship",
  "job",
  "fellowship",
  "scholarship",
  "grant",
  "competition",
  "program",
  "other",
] as const;

const demoRecordSchema = new Schema(
  {
    title: { type: String, required: true },
    url: { type: String, required: true },
    category: { type: String, required: true },
    organization: { type: String, default: "" },
    location: { type: String, default: "" },
    mode: { type: String },
    deadline: { type: Date },
    description: { type: String, default: "" },
    signalCategory: { type: String },
  },
  { _id: false },
);

const demoTimelineEntrySchema = new Schema(
  {
    step: { type: String, required: true },
    detail: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const demoFailureSchema = new Schema(
  {
    url: { type: String, required: true },
    error: { type: String, default: "" },
  },
  { _id: false },
);

const demoProgressSchema = new Schema(
  {
    step: { type: String, default: "" },
    done: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false },
);

const demoScrapeSchema = new Schema(
  {
    scraperId: { type: Schema.Types.ObjectId },
    config: {
      url: { type: String, required: true },
      category: { type: String, required: true, enum: DEMO_CATEGORIES },
      domain: { type: String, default: "" },
    },
    originalConfig: {
      url: { type: String },
      category: { type: String },
    },
    status: {
      type: String,
      enum: [
        "queued",
        "discovering",
        "extracting",
        "healthy",
        "broken",
        "healing",
        "recovered",
        "escalated",
        "failed",
      ],
      default: "queued",
    },
    progress: { type: demoProgressSchema, default: () => ({}) },
    discoveredUrls: { type: [String], default: [] },
    extractionFailures: { type: [demoFailureSchema], default: [] },
    records: { type: [demoRecordSchema], default: [] },
    stats: {
      found: { type: Number, default: 0 },
      valid: { type: Number, default: 0 },
      rejected: { type: Number, default: 0 },
    },
    validationErrors: { type: [String], default: [] },
    snapshotId: { type: String },
    healingAttempts: { type: Number, default: 0 },
    healingTimeline: { type: [demoTimelineEntrySchema], default: [] },
    scrapedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// Sandbox runs are ephemeral — self-clean shortly after each demo session.
demoScrapeSchema.index({ createdAt: 1 }, { expireAfterSeconds: 45 * 60 });

export const DemoScrape = model("DemoScrape", demoScrapeSchema);

export type DemoScrapeDocument = InferSchemaType<typeof demoScrapeSchema>;
