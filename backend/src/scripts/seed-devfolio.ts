import { connectDatabase } from "../config/database.js";
import { Source } from "../modules/sources/source.model.js";

async function seedDevfolio(): Promise<void> {
  await connectDatabase();

  const source = await Source.findOneAndUpdate(
    { url: "https://devfolio.co/hackathons" },
    {
      $setOnInsert: {
        name: "Devfolio",
        url: "https://devfolio.co/hackathons",
        category: "hackathon",
        collectorId: "c_msyi28n11hxgsjvomz",
        enabled: true,
        healthStatus: "unknown",
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  console.log(`Devfolio source ready: ${source._id.toString()}`);
  process.exit(0);
}

seedDevfolio().catch((error: unknown) => {
  console.error("Failed to seed Devfolio source", error);
  process.exit(1);
});
