import "dotenv/config";

import mongoose from "mongoose";

import { env } from "../config/env.js";
import { BrightDataExtractionClient } from "../integrations/brightdata/brightdata.extraction.client.js";
import { enrichSparseOpportunities } from "../enrichment/enrichment.service.js";

async function main(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);
  const client = new BrightDataExtractionClient();
  const summary = await enrichSparseOpportunities(client, { batchSize: env.ENRICHMENT_BATCH_SIZE });
  console.log("Enrichment run complete:", summary);

  const remaining = await mongoose.connection
    .collection("opportunities")
    .countDocuments({ $or: [{ description: { $in: [null, ""] } }, { skills: { $size: 0 } }] });
  console.log("Opportunities still sparse:", remaining);
}

main()
  .catch((error) => {
    console.error("Enrichment run failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
