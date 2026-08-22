import { Schema, model, type InferSchemaType } from "mongoose";

const demoScraperRecordSchema = new Schema(
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

/**
 * A scraper created through the public Live Sandbox. Persisted exactly like a
 * production source would be — but isolated here until the user explicitly
 * promotes it into the Sources registry.
 */
const demoScraperSchema = new Schema(
  {
    name: { type: String, required: true },
    inputUrl: { type: String, required: true },
    domain: { type: String, required: true },
    category: {
      type: String,
      required: true,
      enum: ["hackathon", "internship", "job", "fellowship", "scholarship", "grant", "competition", "program", "other"],
    },
    /** Immutable taxonomy the scraper was born with — discovery always uses this. */
    anchorCategory: {
      type: String,
      required: true,
      enum: ["hackathon", "internship", "job", "fellowship", "scholarship", "grant", "competition", "program", "other"],
    },
    discoveryKeywords: { type: [String], default: [] },
    /** Warm cache of recently verified page URLs — repeat runs skip the SERP. */
    lastDiscovery: {
      urls: { type: [String], default: [] },
      at: { type: Date },
    },
    /** Durable copy of the latest verified records — survives ephemeral run wipes. */
    lastRecords: { type: [demoScraperRecordSchema], default: [] },
    lastStats: {
      found: { type: Number, default: 0 },
      valid: { type: Number, default: 0 },
      rejected: { type: Number, default: 0 },
    },
    runCount: { type: Number, default: 0 },
    lastRunAt: { type: Date },
    promotedSourceId: { type: Schema.Types.ObjectId },
    promotedAt: { type: Date },
  },
  { timestamps: true },
);

demoScraperSchema.index({ domain: 1 }, { unique: true });

export const DemoScraper = model("DemoScraper", demoScraperSchema);

export type DemoScraperDocument = InferSchemaType<typeof demoScraperSchema>;
