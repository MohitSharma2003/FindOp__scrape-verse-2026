import "dotenv/config";
import mongoose from "mongoose";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI missing");
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db!;


  const collections = await db.listCollections().toArray();
  console.log("Collections:", collections.map((c) => c.name).join(", "));

  if (collections.some((c) => c.name === "opportunities")) {
    const count = await db.collection("opportunities").countDocuments();
    console.log("Opportunity count:", count);
    const byCategory = await db.collection("opportunities").aggregate([{ $group: { _id: "$category", n: { $sum: 1 } } }]).toArray();
    console.log("By category:", JSON.stringify(byCategory));
    const bySource = await db.collection("opportunities").aggregate([{ $group: { _id: "$source", n: { $sum: 1 } } }]).toArray();
    console.log("By source:", JSON.stringify(bySource));
    const freshest = await db.collection("opportunities").find().sort({ scrapedAt: -1 }).limit(1).toArray();
    console.log("Freshest scrapedAt:", freshest[0]?.scrapedAt);
    const sample = await db.collection("opportunities").find().limit(2).toArray();
    for (const doc of sample) {
      console.log("Sample:", JSON.stringify({ title: doc.title, category: doc.category, location: doc.location, mode: doc.mode, source: doc.source, deadline: doc.deadline }));
    }
  }

  if (collections.some((c) => c.name === "sources")) {
    const sources = await db.collection("sources").find().toArray();
    console.log("Sources:", JSON.stringify(sources.map((s) => ({ name: s.name, domain: s.domain, url: s.url, collectorId: s.collectorId, enabled: s.enabled, category: s.category })), null, 1));
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

