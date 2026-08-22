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
  // Every discovery source is scoped to curated quality domains via `site:`
  // filters — combined with the same-domain candidate filter this makes
  // off-site junk (encyclopedias, dictionaries, social posts) impossible.
  { name: "SERP Discovery — Hackathons", category: "hackathon", keywords: ["site:devpost.com", "site:mlh.com", "site:hackerearth.com", "site:dorahacks.io"], frequencyMinutes: 180 },
  { name: "SERP Discovery — Fellowships", category: "fellowship", keywords: ["site:opportunitydesk.org", "site:youthop.com"], frequencyMinutes: 720 },
  { name: "SERP Discovery — Grants", category: "grant", keywords: ["site:nlnet.nl", "site:opportunitydesk.org"], frequencyMinutes: 720 },
  { name: "SERP Discovery — Internships", category: "internship", keywords: ["site:internshala.com", "site:internships.com", "site:outreachy.org"], frequencyMinutes: 720 },
  { name: "SERP Discovery — Scholarships", category: "scholarship", keywords: ["site:youthop.com", "site:opportunitydesk.org", "site:scholarships360.org"], frequencyMinutes: 1440 },
  // Demo sources scoped to specific listing sites via `site:` filters.
  { name: "Devpost Hackathons", url: "https://devpost.com/hackathons", domain: "devpost.com", category: "hackathon", keywords: ["site:devpost.com", "hackathons 2026"], frequencyMinutes: 180 },
  { name: "MLH Hackathons", url: "https://mlh.io/seasons/2026/events", domain: "mlh.io", category: "hackathon", keywords: ["site:mlh.io", "hackathon events 2026"], frequencyMinutes: 180 },
  { name: "Unstop Competitions", url: "https://unstop.com/hackathons", domain: "unstop.com", category: "hackathon", keywords: ["site:unstop.com", "hackathon competition"], frequencyMinutes: 360 },
  { name: "Opportunity Desk Fellowships", url: "https://opportunitydesk.org/", domain: "opportunitydesk.org", category: "fellowship", keywords: ["site:opportunitydesk.org", "fellowship scholarship 2026"], frequencyMinutes: 720 },
  { name: "Youth Opportunities", url: "https://youthop.com/", domain: "youthop.com", category: "scholarship", keywords: ["site:youthop.com", "scholarship fellowship"], frequencyMinutes: 720 },
  { name: "Internshala Internships", url: "https://internshala.com/internships/", domain: "internshala.com", category: "internship", keywords: ["site:internshala.com", "internship"], frequencyMinutes: 360 },
  // Quality-scoped sources for thin categories (jobs, programs, grants).
  { name: "Remotive Remote Jobs", url: "https://remotive.com/", domain: "remotive.com", category: "job", keywords: ["site:remotive.com", "software engineer job"], frequencyMinutes: 360 },
  { name: "Google Summer of Code", url: "https://summerofcode.withgoogle.com/", domain: "summerofcode.withgoogle.com", category: "program", keywords: ["site:summerofcode.withgoogle.com", "open source program"], frequencyMinutes: 720 },
  { name: "Outreachy Open-Source Internships", url: "https://www.outreachy.org/", domain: "outreachy.org", category: "internship", keywords: ["site:outreachy.org", "outreachy internship"], frequencyMinutes: 720 },
  { name: "NLnet Foundation Grants", url: "https://nlnet.nl/funding/", domain: "nlnet.nl", category: "grant", keywords: ["site:nlnet.nl", "funding open source"], frequencyMinutes: 1440 },
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
