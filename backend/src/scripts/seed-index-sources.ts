import "dotenv/config";

import mongoose from "mongoose";

import { env } from "../config/env.js";
import { Source } from "../modules/sources/source.model.js";

/**
 * Registers the FindOP Opportunity Index sources.
 *
 - The Devfolio listing source (existing DCA collector) is kept and upgraded
   with scheduling metadata.
 * SERP-discovery sources run scheduled Bright Data SERP queries per category
   and push individual opportunity URLs through the generic extraction
   collector and the shared ingestion pipeline. Their `url` is a logical
   identifier (never scraped directly) and `kind` marks them honestly.
 */
const SERP_SOURCES = [
  { name: "SERP Discovery — Hackathons", category: "hackathon", keywords: ["hackathon", "students", "2026"], frequencyMinutes: 180 },
  { name: "SERP Discovery — Fellowships", category: "fellowship", keywords: ["research fellowship", "students"], frequencyMinutes: 720 },
  { name: "SERP Discovery — Grants", category: "grant", keywords: ["developer grant", "startup grant"], frequencyMinutes: 720 },
  { name: "SERP Discovery — Internships", category: "internship", keywords: ["software internship", "engineering internship"], frequencyMinutes: 720 },
  { name: "SERP Discovery — Scholarships", category: "scholarship", keywords: ["STEM scholarship", "students"], frequencyMinutes: 1440 },
  // Demo sources scoped to specific listing sites via `site:` filters.
  { name: "Devpost Hackathons", url: "https://devpost.com/hackathons", domain: "devpost.com", category: "hackathon", keywords: ["site:devpost.com", "hackathons 2026"], frequencyMinutes: 180 },
  { name: "MLH Hackathons", url: "https://mlh.io/seasons/2026/events", domain: "mlh.io", category: "hackathon", keywords: ["site:mlh.io", "hackathon events 2026"], frequencyMinutes: 180 },
  { name: "Unstop Competitions", url: "https://unstop.com/hackathons", domain: "unstop.com", category: "hackathon", keywords: ["site:unstop.com", "hackathon competition"], frequencyMinutes: 360 },
  { name: "Opportunity Desk Fellowships", url: "https://opportunitydesk.org/", domain: "opportunitydesk.org", category: "fellowship", keywords: ["site:opportunitydesk.org", "fellowship scholarship 2026"], frequencyMinutes: 720 },
  { name: "Youth Opportunities", url: "https://youthop.com/", domain: "youthop.com", category: "scholarship", keywords: ["site:youthop.com", "scholarship fellowship"], frequencyMinutes: 720 },
  { name: "Internshala Internships", url: "https://internshala.com/internships/", domain: "internshala.com", category: "internship", keywords: ["site:internshala.com", "internship"], frequencyMinutes: 360 },
] as const;

async function main(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);

  const devfolio = await Source.findOne({ $or: [{ domain: "devfolio.co" }, { name: "Devfolio" }, { url: { $regex: /devfolio\.co/i } }] });
  if (devfolio) {
    devfolio.scrapeFrequencyMinutes = 180;
    if (!devfolio.nextRunAt || devfolio.nextRunAt < new Date()) {
      devfolio.nextRunAt = new Date(Date.now() + 60_000);
    }
    await devfolio.save();
    console.log("Updated Devfolio source scheduling");
  } else {
    console.log("Devfolio source not found in registry (unchanged)");
  }

  for (const spec of SERP_SOURCES) {
    const url = "url" in spec ? spec.url : `https://${spec.category}.discovery.findop.local/`;
    const domainFallback = `${spec.category}.discovery.findop.local`;
    const existing = await Source.findOne({ url });
    if (existing) {
      existing.enabled = true;
      existing.scrapeFrequencyMinutes = spec.frequencyMinutes;
      existing.discoveryKeywords = [...spec.keywords];
      if (!existing.nextRunAt || existing.nextRunAt < new Date()) {
        existing.nextRunAt = new Date(Date.now() + 120_000);
      }
      await existing.save();
      console.log(`Updated ${spec.name}`);
      continue;
    }

    await Source.create({
      name: spec.name,
      url,
      domain: "domain" in spec ? spec.domain : domainFallback,
      category: spec.category,
      kind: "serp_discovery",
      discoveryKeywords: [...spec.keywords],
      scrapeFrequencyMinutes: spec.frequencyMinutes,
      enabled: true,
      nextRunAt: new Date(Date.now() + 120_000),
      provisioningStatus: "ready",
    });
    console.log(`Registered ${spec.name}`);
  }

  const total = await Source.countDocuments();
  console.log(`Registry now holds ${total} sources`);
}

main()
  .catch((error) => {
    console.error("Seeding failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
