import { Schema, model, type InferSchemaType } from "mongoose";

const sourceSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    url: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value: string) => {
          try {
            const parsed = new URL(value);
            return parsed.protocol === "http:" || parsed.protocol === "https:";
          } catch {
            return false;
          }
        },
        message: "Source URL must be a valid HTTP or HTTPS URL",
      },
    },
    category: {
      type: String,
      required: true,
      enum: ["hackathon"],
    },
    collectorId: {
      type: String,
      required: function(this: { enabled?: boolean }) { return this.enabled !== false; },
      trim: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    healthStatus: {
      type: String,
      enum: ["healthy", "unhealthy", "unknown"],
      default: "unknown",
    },
    lastRunAt: Date,
    lastSuccessfulRunAt: Date,
    lastFailureAt: Date,
    consecutiveFailures: {
      type: Number,
      default: 0,
    },
    lastFailureReason: String,
    scraperVersion: String,
    qualityScore: { type: Number, min: 0, max: 100, default: 0 },
    healingCount: { type: Number, min: 0, default: 0 },
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
  },
  { timestamps: true },
);

sourceSchema.index({ url: 1 }, { unique: true });
sourceSchema.index({ collectorId: 1 }, { unique: true, partialFilterExpression: { collectorId: { $type: "string" } } });

export const Source = model("Source", sourceSchema);

export type SourceDocument = InferSchemaType<typeof sourceSchema>;
