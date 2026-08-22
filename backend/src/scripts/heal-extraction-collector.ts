import "dotenv/config";
import { BrightDataHealingClient } from "../integrations/brightdata/brightdata.healing.client.js";
import { BrightDataClient } from "../integrations/brightdata/brightdata.client.js";

const COLLECTOR = process.env.BRIGHT_DATA_EXTRACTION_COLLECTOR_ID ?? "c_mszs3rnj1j4xohocjq";
const TARGET = process.argv[2] ?? "https://hackspire26.devfolio.co/";

const INSTRUCTION =
  "Extract the single opportunity described on this page as ONE structured JSON record. " +
  "Return these fields: title, organization, description (2-4 sentence summary of what the opportunity is), " +
  "opportunity_type (hackathon/internship/fellowship/scholarship/grant/competition/job/program), " +
  "application_url (direct registration or apply link), source_url (the page URL), " +
  "start_date, end_date, application_deadline (ISO dates when stated), location (city/country or Online), " +
  "participation_mode (online/on-site/hybrid), eligibility (who can apply), " +
  "required_skills_or_technologies (array of skills/themes), prize_or_rewards (prize money or benefits). " +
  "Use null for any field the page does not state. Never invent values.";

async function main(): Promise<void> {
  console.log(`Healing collector ${COLLECTOR} ...`);
  const healer = new BrightDataHealingClient({
    apiToken: process.env.BRIGHT_DATA_API_TOKEN,
    timeoutMs: 420000,
    pollIntervalMs: 8000,
  });
  const result = await healer.heal(COLLECTOR, INSTRUCTION, [{ url: TARGET }]);
  console.log("HEAL RESULT:", JSON.stringify({ ...result, repairedScraper: result.repairedScraper ? { ...result.repairedScraper, template: "(omitted)" } : undefined }, null, 2));

  if (!result.success) return;
  console.log("\nRe-probing extraction with version=dev ...");
  const client = new BrightDataClient({
    apiToken: process.env.BRIGHT_DATA_API_TOKEN,
    timeoutMs: 240000,
    pollIntervalMs: 5000,
  });
  try {
    const scrape = await client.scrape({ collectorId: COLLECTOR, url: TARGET, version: "dev" });
    const records = Array.isArray(scrape.rawResult) ? scrape.rawResult : [scrape.rawResult];
    console.log("record count:", records.length);
    for (const record of records.slice(0, 2)) {
      console.log("KEYS:", Object.keys(record).join(", "));
      console.log(JSON.stringify(record, null, 2).slice(0, 2200));
    }
  } catch (error) {
    console.log("DEV EXTRACTION FAILED:", error instanceof Error ? error.message : error);
  }
}

main().then(() => process.exit(0)).catch((error: unknown) => {
  console.error("HEAL SCRIPT FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
