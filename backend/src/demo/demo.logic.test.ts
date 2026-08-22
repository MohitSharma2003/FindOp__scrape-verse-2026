import assert from "node:assert/strict";
import test from "node:test";

import {
  DEMO_DEFAULT_CONFIG,
  buildDemoDiscoveryKeywords,
  classifyRecordAgainstConfig,
  computeRunVerdict,
  decideHealOutcome,
  isDemoRunInFlight,
  parseDemoTarget,
  pickBreakCategory,
  validateDemoConfigInput,
  type DemoConfig,
} from "./demo.logic.js";
import type { NormalizedOpportunity } from "../ingestion/types.js";
import type { SandboxExtractionClient } from "./demo.service.js";

function makeNormalized(overrides: Partial<NormalizedOpportunity> = {}): NormalizedOpportunity {
  return {
    title: "Sample Hackathon",
    organization: "Org",
    description: "A hackathon event",
    eligibility: "",
    category: "hackathon",
    url: "https://example.com/a",
    opportunityUrl: "https://example.com/a",
    source: "demo",
    location: "",
    skills: [],
    status: "unknown",
    startDate: null,
    deadline: null,
    scrapedAt: new Date(),
    ...overrides,
  };
}

const config: DemoConfig = { ...DEMO_DEFAULT_CONFIG };

test("validateDemoConfigInput accepts url and category patches", () => {
  const ok = validateDemoConfigInput({ category: "grant" });
  assert.deepEqual(ok, { ok: true, config: { category: "grant" } });
});

test("validateDemoConfigInput rejects bad urls and categories", () => {
  assert.equal(validateDemoConfigInput({ url: "not-a-url" }).ok, false);
  assert.equal(validateDemoConfigInput({ category: "spaceship" }).ok, false);
  assert.equal(validateDemoConfigInput({}).ok, false);
});

test("records with strong signals conflicting with config break the run", () => {
  const records = [
    makeNormalized({ title: "Winter Internship at Google", opportunityUrl: "https://x.com/internship" }),
    makeNormalized({ title: "Summer Internship Program", opportunityUrl: "https://x.com/i2" }),
    makeNormalized({ title: "Internship Opening", opportunityUrl: "https://x.com/i3" }),
  ].map((r) => classifyRecordAgainstConfig(r, config));

  const verdict = computeRunVerdict(records);
  assert.equal(verdict.status, "broken");
  assert.equal(verdict.signalMajorityCategory, "internship");
});

test("matching records keep the run healthy", () => {
  const records = [
    makeNormalized({ title: "WeMakeDevs Hackathon 2026", opportunityUrl: "https://x.com/h1" }),
    makeNormalized({ title: "AI Hackathon Sprint", opportunityUrl: "https://x.com/h2" }),
  ].map((r) => classifyRecordAgainstConfig(r, config));

  const verdict = computeRunVerdict(records);
  assert.equal(verdict.status, "healthy");
  assert.equal(verdict.signalMajorityCategory, "hackathon");
});

test("heal outcome recovers when signals are coherent and corrects the category", () => {
  const decision = decideHealOutcome({
    verdictBefore: { status: "broken", classifiedCount: 3, conflictCount: 3, signalMajorityCategory: null, evidence: [] },
    verdictAfter: { status: "healthy", classifiedCount: 3, conflictCount: 0, signalMajorityCategory: "internship", evidence: [] },
    attempts: 1,
  });
  assert.equal(decision.outcome, "recovered");
  assert.equal(decision.correctedCategory, "internship");
});

test("heal outcome escalates after max attempts without coherent signals", () => {
  const decision = decideHealOutcome({
    verdictBefore: { status: "broken", classifiedCount: 2, conflictCount: 2, signalMajorityCategory: null, evidence: [] },
    verdictAfter: { status: "broken", classifiedCount: 0, conflictCount: 0, signalMajorityCategory: null, evidence: [] },
    attempts: 2,
  });
  assert.equal(decision.outcome, "escalated");
  assert.equal(decision.correctedCategory, null);
});

test("sandbox extraction client contract accepts any url per request", async () => {
  const seenUrls: string[] = [];
  const stub: SandboxExtractionClient = {
    extract: async (url) => {
      seenUrls.push(url);
      return [];
    },
  };
  await stub.extract("https://wemakedevs.org");
  await stub.extract("https://wemakedevs.org/events");
  assert.deepEqual(seenUrls, ["https://wemakedevs.org", "https://wemakedevs.org/events"]);
});

test("parseDemoTarget normalizes pasted website addresses", () => {
  const bare = parseDemoTarget("wemakedevs.org");
  assert.equal(bare.ok, true);
  if (bare.ok) {
    assert.equal(bare.target.domain, "wemakedevs.org");
    assert.equal(bare.target.inputUrl, "https://wemakedevs.org/");
  }

  const www = parseDemoTarget("https://www.Devpost.com/hackathons?ref=x");
  assert.equal(www.ok, true);
  if (www.ok) {
    assert.equal(www.target.domain, "devpost.com");
    assert.equal(www.target.inputUrl, "https://www.devpost.com/hackathons?ref=x");
  }

  assert.equal(parseDemoTarget("").ok, false);
  assert.equal(parseDemoTarget("not a url!!").ok, false);
  assert.equal(parseDemoTarget("localhost:5000").ok, false);
  assert.equal(parseDemoTarget("192.168.1.4/admin").ok, false);
});

test("buildDemoDiscoveryKeywords scopes queries to the site", () => {
  assert.deepEqual(buildDemoDiscoveryKeywords("mlh.io"), ["site:mlh.io"]);
});

test("pickBreakCategory always contradicts the current category", () => {
  assert.equal(pickBreakCategory("hackathon"), "internship");
  assert.notEqual(pickBreakCategory("internship"), "internship");
  assert.notEqual(pickBreakCategory("scholarship"), "scholarship");
});

test("in-flight statuses gate concurrent sandbox runs", () => {
  for (const status of ["queued", "discovering", "extracting", "healing"]) {
    assert.equal(isDemoRunInFlight(status), true);
  }
  for (const status of ["healthy", "broken", "recovered", "escalated", "failed"]) {
    assert.equal(isDemoRunInFlight(status), false);
  }
});
