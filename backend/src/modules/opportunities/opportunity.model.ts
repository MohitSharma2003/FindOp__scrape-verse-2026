import { Schema, model, type InferSchemaType } from "mongoose";

const opportunitySchema = new Schema(
    {
        title:{
            type: String,
            required: true,
            trim:true,
        },
        
        organization:{
            type: String,
            default: "",
            trim: true,
        },

        description: {
            type: String,
            default: "",
            trim: true,
        },

        eligibility: {
            type: String,
            default: "",
            trim: true,
        },

        category: {
            type: String,
            required: true,
            enum: [
                "hackathon",
                "internship",
                "job",
                "fellowship",
                "scholarship",
                "grant",
                "competition",
                "program",
                "other"
            ],
        },

        url: {
            type: String,
            required: true,
            trim: true,
        },

        opportunityUrl: {
            type: String,
            trim: true,
        },

        applicationUrl: {
            type: String,
            trim: true,
        },

        sourceId: {
            type: Schema.Types.ObjectId,
            ref: "Source",
        },

        externalId: {
            type: String,
            trim: true,
        },

        source: {
            type: String,
            default: "",
            trim: true,
        },

        mode: {
            type: String,
            enum: ["remote", "in_person", "hybrid", "any"],
        },

        prize: {
            type: String,
            trim: true,
        },

        location:{
            type: String,
            default: "",
            trim: true,
        },

        skills:{
            type:[String],
            default:[],
        },

        deadline: {
            type: Date,
        },

        startDate: {
            type: Date,
        },

        endDate: {
            type: Date,
        },

        status: {
            type: String,
            enum:["active", "upcoming", "open", "closed", "unknown"],
            default: "active",
        },

        scrapedAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps:true,
    },
);

opportunitySchema.index(
    { sourceId: 1, opportunityUrl: 1 },
    {
        unique: true,
        partialFilterExpression: {
            sourceId: { $exists: true },
            opportunityUrl: { $exists: true },
        },
    },
);

opportunitySchema.index(
  { source: 1, opportunityUrl: 1 },
  {
    unique: true,
    partialFilterExpression: {
      source: { $exists: true },
      opportunityUrl: { $exists: true },
    },
  },
);

// --- Phase 7A: index query paths (category/location/deadline/status/freshness) ---
opportunitySchema.index({ category: 1, deadline: 1 });
opportunitySchema.index({ category: 1, status: 1 });
opportunitySchema.index({ status: 1, scrapedAt: -1 });
opportunitySchema.index({ skills: 1 });
opportunitySchema.index({ updatedAt: -1 });


export const Opportunity = model("Opportunity", opportunitySchema);

export type OpportunityDocument = InferSchemaType<
    typeof opportunitySchema
>;
