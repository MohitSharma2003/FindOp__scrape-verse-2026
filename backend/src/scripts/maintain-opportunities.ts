import "dotenv/config";
import mongoose from "mongoose";

import { applyCategoryFallback, assessOpportunityUrlQuality, classifyOpportunityCategory } from "../ingestion/category-classifier.js";
import { connectDatabase } from "../config/database.js";
import { Opportunity } from "../modules/opportunities/opportunity.model.js";
import { Source } from "../modules/sources/source.model.js";

interface MaintenanceDoc {
  _id: unknown;
  title?: string;
  url?: string;
  opportunityUrl?: string;
  applicationUrl?: string;
  category?: string;
  description?: string;
  sourceId?: unknown;
}

/**
 * One-shot data-quality repair pass over stored opportunities:
 *  1. deletes records whose URL/title can no longer be produced by current
 *     validation rules (generic listings, homepages, search pages, junk titles)
 *  2. recomputes every surviving record's category with the deterministic
 *     classifier and persists corrections
 */
async function maintainOpportunities(): Promise<void> {
  await connectDatabase();

  const sources = await Source.find().select("_id category").lean();
  const sourceCategoryById = new Map(
    sources.map((source) => [String(source._id), typeof source.category === "string" ? source.category : undefined]),
  );

  const docs = (await Opportunity.find()
    .select("_id title url opportunityUrl applicationUrl category description sourceId")
    .lean()) as unknown as MaintenanceDoc[];

  let deletedCount = 0;
  let reclassifiedCount = 0;
  const deletedSamples: string[] = [];
  const reclassifiedSamples: string[] = [];

  for (const doc of docs) {
    const opportunityUrl = doc.opportunityUrl ?? doc.url ?? "";
    const title = doc.title ?? "";
    const quality = assessOpportunityUrlQuality(opportunityUrl, title);

    if (!quality.accepted) {
      await Opportunity.deleteOne({ _id: doc._id as never });
      deletedCount += 1;
      if (deletedSamples.length < 10) {
        deletedSamples.push(`[${quality.reason}] "${title}" ${opportunityUrl}`);
      }
      continue;
    }

    const correctedCategory = applyCategoryFallback(
      classifyOpportunityCategory({
        title,
        url: opportunityUrl,
        description: doc.description,
      }),
      doc.sourceId ? sourceCategoryById.get(String(doc.sourceId)) : undefined,
    );

    if (doc.category && doc.category !== correctedCategory) {
      await Opportunity.updateOne({ _id: doc._id as never }, { $set: { category: correctedCategory } });
      reclassifiedCount += 1;
      if (reclassifiedSamples.length < 10) {
        reclassifiedSamples.push(`"${title}": ${doc.category} -> ${correctedCategory}`);
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        totalExamined: docs.length,
        deleted: deletedCount,
        reclassified: reclassifiedCount,
        remaining: docs.length - deletedCount,
        deletedSamples,
        reclassifiedSamples,
      },
      null,
      2,
    ),
  );
}

maintainOpportunities()
  .then(async () => {
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error("maintenance failed:", error);
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
    process.exit(1);
  });
