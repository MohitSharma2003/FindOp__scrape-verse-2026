import { Schema, model, type InferSchemaType } from "mongoose";

const scrapeRunSchema = new Schema(
  {
    sourceId: {
      type: Schema.Types.ObjectId,
      ref: "Source",
      required: true,
    },
    startedAt: {
      type: Date,
      required: true,
    },
    completedAt: Date,
    status: {
      type: String,
      enum: ["running", "success", "partial", "failed"],
      required: true,
    },
    recordsFound: { type: Number, default: 0 },
    recordsValid: { type: Number, default: 0 },
    recordsRejected: { type: Number, default: 0 },
    duplicatesFound: { type: Number, default: 0 },
    recordsPersisted: { type: Number, default: 0 },
    validationErrors: { type: [String], default: [] },
    error: String,
    healthStatus: {
      type: String,
      enum: ["healthy", "degraded", "failed"],
    },
    healthSeverity: {
      type: String,
      enum: ["info", "warning", "critical"],
    },
    healthReasons: { type: [String], default: [] },
    healthMetrics: {
      baselineRecords: Number,
      currentRecords: Number,
      validationFailureRate: Number,
      recordCountRatio: Number,
    },
    healingStatus: {
      type: String,
      enum: ["pending", "diagnosing", "repairing", "verifying", "recovered", "repair_available", "escalated"],
    },
    healingAttempts: { type: Number, default: 0 },
    lastHealingStartedAt: Date,
    lastHealingCompletedAt: Date,
    lastHealingError: String,
    repairStrategy: String,
    recoveryReason: String,
    healingHistory: {
      type: [
        {
          attempt: Number,
          startedAt: Date,
          completedAt: Date,
          status: String,
          error: String,
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

scrapeRunSchema.index({ sourceId: 1, startedAt: -1 });
scrapeRunSchema.index({ sourceId: 1, healingAttempts: 1, lastHealingStartedAt: -1 });

export const ScrapeRun = model("ScrapeRun", scrapeRunSchema);

export type ScrapeRunDocument = InferSchemaType<typeof scrapeRunSchema>;
