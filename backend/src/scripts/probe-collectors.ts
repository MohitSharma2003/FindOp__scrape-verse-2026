import "dotenv/config";
import { BrightDataClient } from "../integrations/brightdata/brightdata.client.js";

async function main(): Promise<void> {
  const client = new BrightDataClient({
    apiToken: process.env.BRIGHT_DATA_API_TOKEN,
    timeoutMs: 240000,
    pollIntervalMs: 5000,
  });

  console.log("=== PROBE 1: Devfolio source collector (listing) ===");
  try {
    const listing = await client.scrape({
      collectorId: process.env.DEVFOLIO_COLLECTOR_ID ?? "c_msyi28n11hxgsjvomz",
      url: "https://devfolio.co/hackathons",
    });
    const raw = listing.rawResult;
    const records = Array.isArray(raw) ? raw : Array.isArray((raw as { data?: unknown[] })?.data) ? (raw as { data: unknown[] }).data : [raw];
    console.log("record count:", records.length);
    for (const record of records.slice(0, 3)) {
      console.log("KEYS:", Object.keys(record as object).join(", "));
      console.log(JSON.stringify(record, null, 2).slice(0, 1500));
      console.log("---");
    }
  } catch (error) {
    console.log("LISTING COLLECTOR FAILED:", error instanceof Error ? error.message : error);
  }

  console.log("\n=== PROBE 2: generic extraction collector (detail page) ===");
  try {
    const detail = await client.scrape({
      collectorId: process.env.BRIGHT_DATA_EXTRACTION_COLLECTOR_ID ?? "c_mszs3rnj1j4xohocjq",
      url: "https://hackspire26.devfolio.co/",
    });
    const raw = detail.rawResult;
    const records = Array.isArray(raw) ? raw : [raw];
    console.log("record count:", records.length);
    for (const record of records.slice(0, 2)) {
      console.log("KEYS:", Object.keys(record as object).join(", "));
      console.log(JSON.stringify(record, null, 2).slice(0, 2000));
      console.log("---");
    }
  } catch (error) {
    console.log("DETAIL COLLECTOR FAILED:", error instanceof Error ? error.message : error);
  }
}

main().then(() => process.exit(0)).catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
