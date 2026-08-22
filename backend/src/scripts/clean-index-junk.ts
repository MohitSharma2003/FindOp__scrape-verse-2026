import "dotenv/config";

import mongoose from "mongoose";

import { env } from "../config/env.js";
import { Source } from "../modules/sources/source.model.js";
import { Opportunity } from "../modules/opportunities/opportunity.model.js";

/**
 * One-time index hygiene pass:
 *  - removes opportunities hosted on encyclopedias/dictionaries/social media
 *    (they are never opportunity pages) and on clearly non-English pages,
 *  - removes the dead OpenHackathons DCA source (unhealthy + disabled).
 * The ingestion URL-quality gate now blocks these hosts permanently.
 */

/** Host patterns that can never host a real opportunity page. */
const JUNK_HOST_PATTERN =
  /(^|\.)(wikipedia\.org|wikimedia\.org|wiktionary\.org|wikiwand\.com|merriam-webster\.com|dictionary\.cambridge\.org|collinsdictionary\.com|linguee\.[a-z.]{2,}|lawinsider\.com|reddit\.com|facebook\.com|instagram\.com|x\.com|twitter\.com|threads\.net|youtube\.com|pinterest\.[a-z.]{2,}|quora\.com|play\.google\.com|medium\.com|linkedin\.com|brightidea\.com)$/i;

/** Clearly non-English regional hosts observed in the index. */
const NON_ENGLISH_HOSTS = new Set([
  "ja.tum.de",
  "mx.indeed.com",
  "swinburne-vn.edu.vn",
  "u-tokyo.ac.jp",
  "universite-paris-saclay.fr",
  "sciencespo.fr",
]);

function isJunkHost(host?: string): boolean {
  if (!host) return false;
  return JUNK_HOST_PATTERN.test(host) || NON_ENGLISH_HOSTS.has(host);
}

function hostOf(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);

  const docs = await Opportunity.find(
    {},
    { url: 1, applicationUrl: 1 },
  ).lean<{ _id: unknown; url?: string; applicationUrl?: string }[]>();

  const doomed: unknown[] = [];
  const seenHosts = new Map<string, number>();
  for (const doc of docs) {
    const host = hostOf(doc.url) ?? hostOf(doc.applicationUrl);
    if (isJunkHost(host)) {
      doomed.push(doc._id);
      seenHosts.set(host!, (seenHosts.get(host!) ?? 0) + 1);
    }
  }

  if (doomed.length > 0) {
    await Opportunity.deleteMany({ _id: { $in: doomed } });
  }
  console.log(`Removed ${doomed.length} junk opportunities:`);
  for (const [host, n] of [...seenHosts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${host}`);
  }

  const dead = await Source.findOne({ name: "OpenHackathons", kind: "collector", enabled: false });
  if (dead) {
    await dead.deleteOne();
    console.log("Removed dead source: OpenHackathons (collector, disabled, unhealthy)");
  }

  const total = await Opportunity.countDocuments({});
  console.log(`Index now holds ${total} opportunities`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
