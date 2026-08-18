import { Schema, model, type InferSchemaType} from 'mongoose';
import { required } from 'zod/mini';

const opportunitySchema = new Schema(
    {
        title:{
            type: String,
            required: true,
            trim:true,
        },
        
        organization:{
            type: String,
            required: true,
            trim: true,
        },

        description: {
            type: String,
            required: true,
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

        source: {
            type: String,
            required: true,
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
            enum:["active", "closed", "unknown"],
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


export const Opportunity = model("Opportunity", opportunitySchema);

export type OpportunityDocument = InferSchemaType<
    typeof opportunitySchema
>;