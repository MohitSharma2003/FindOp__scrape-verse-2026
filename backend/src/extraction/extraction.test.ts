import assert from "node:assert/strict";
import test from "node:test";
import { env } from "../config/env.js";
import { describeExtractionRejection, parseExtractionResult, toNormalizedOpportunity } from "./extraction.parser.js";
import { extractOpportunities, ExtractionValidationError } from "./extraction.service.js";
import { assessExtractionQuality } from "./extraction-quality.js";
import {
  devpostProviderFixture,
  genericCompanyProviderFixture,
  malformedProviderFixture,
  openHackathonsProviderFixture,
  sparseOpportunityFixture,
} from "./extraction.fixtures.js";

const candidate = { url: "https://example.com/opportunity" };
const validRaw = {
  title: "AI Hackathon 2026",
  organization: "Example Org",
  description: "Build useful AI projects.",
  category: "hackathon",
  opportunityUrl: candidate.url,
  applicationUrl: "https://example.com/apply",
  startDate: "September 10, 2026",
  deadline: "August 30, 2026",
  mode: "online",
  location: "Remote",
  skills: ["AI", "Python"],
  prize: "$10,000",
};

test("valid candidate extraction maps canonical fields", () => {
  const extracted = parseExtractionResult(validRaw, candidate);
  assert.ok(extracted);
  assert.equal(extracted.title, "AI Hackathon 2026");
  assert.equal(extracted.mode, "remote");
  assert.equal(extracted.type, "hackathon");
  assert.equal(extracted.startDate?.getUTCFullYear(), 2026);
  assert.equal(extracted.deadline?.getUTCMonth(), 7);
  assert.deepEqual(extracted.skills, ["AI", "Python"]);
});
test("configured Scraper Studio schema is accepted when returned as a one-record array", () => {
  const providerRecord = { ...devpostProviderFixture, application_url: "https://example.com/apply", source_url: candidate.url, input: { url: candidate.url } };
  const extracted = parseExtractionResult([providerRecord], candidate);
  assert.ok(extracted);
  assert.equal(extracted.title, providerRecord.title);
  assert.equal(extracted.applicationUrl, providerRecord.application_url);
  assert.equal(extracted.deadline?.getUTCMonth(), 7);
  assert.deepEqual(extracted.skills, providerRecord.required_skills_or_technologies);
  assert.equal(extracted.prize, providerRecord.prize_or_rewards);
  assert.equal(extracted.eligibility, "All countries");
});

test("heterogeneous complete fixtures preserve provider fields through canonical mapping", () => {
  const fixtures = [
    [devpostProviderFixture, devpostProviderFixture.source_url],
    [openHackathonsProviderFixture, openHackathonsProviderFixture.source_url],
    [genericCompanyProviderFixture, genericCompanyProviderFixture.url],
  ] as const;
  for (const [fixture, url] of fixtures) {
    const extracted = parseExtractionResult(fixture, { url });
    assert.ok(extracted);
    const normalized = toNormalizedOpportunity(extracted);
    assert.ok(normalized.organization);
    assert.ok(normalized.description);
    assert.ok(normalized.location);
    assert.ok(normalized.mode);
    assert.ok(normalized.startDate);
    assert.ok(normalized.endDate);
    assert.ok(normalized.deadline);
    assert.ok(normalized.skills.length > 0);
    assert.ok(normalized.eligibility);
  }
});

test("sparse legitimate records remain available and are marked incomplete", () => {
  const extracted = parseExtractionResult(sparseOpportunityFixture, { url: sparseOpportunityFixture.url });
  assert.ok(extracted);
  const quality = assessExtractionQuality(toNormalizedOpportunity(extracted));
  assert.equal(quality.status, "incomplete");
  assert.ok(quality.missingFields.includes("organization"));
  assert.ok(quality.missingFields.includes("mode"));
  assert.ok(quality.score < 100);
});

test("malformed provider fixtures do not become opportunities", () => {
  assert.equal(parseExtractionResult(malformedProviderFixture, candidate), undefined);
});
test("provider date values, string skills, onsite mode, and input URL are normalized", () => {
  const extracted = parseExtractionResult([{
    title: "Workshop",
    opportunity_type: "Workshop",
    input: { url: "https://example.com/workshop" },
    start_date: new Date("2026-09-01T00:00:00.000Z"),
    application_deadline: 1788739200000,
    participation_mode: "On-site",
    required_skills_or_technologies: "AI, Python; TypeScript",
    eligibility: ["Students", "Professionals"],
  }], candidate);
  assert.ok(extracted);
  assert.equal(extracted.opportunityUrl, "https://example.com/workshop");
  assert.equal(extracted.mode, "in_person");
  assert.deepEqual(extracted.skills, ["AI", "Python", "TypeScript"]);
  assert.equal(extracted.eligibility, "Students; Professionals");
  assert.ok(extracted.startDate instanceof Date);
  assert.ok(extracted.deadline instanceof Date);
});
test("sparse opportunity records require a meaningful opportunity signal", () => {
  assert.ok(parseExtractionResult([{ title: "Opportunity", application_url: "https://example.com/apply" }], candidate));
  assert.equal(parseExtractionResult([{ title: "Homepage", url: candidate.url }], candidate), undefined);
  const diagnostic = describeExtractionRejection([{ title: "Homepage", url: candidate.url }], candidate);
  assert.equal(diagnostic.reason, "insufficient_opportunity_fields");
  assert.deepEqual(diagnostic.firstRecordKeys, ["title", "url"]);
});
test("missing optional fields remain undefined", () => {
  const extracted = parseExtractionResult({ title: "Fellowship", description: "A program", url: candidate.url }, candidate);
  assert.ok(extracted);
  assert.equal(extracted.organization, undefined);
  assert.equal(extracted.applicationUrl, undefined);
  assert.equal(extracted.mode, undefined);
});
test("invalid extraction is rejected", () => {
  assert.equal(parseExtractionResult({ title: "", url: candidate.url }, candidate), undefined);
  assert.equal(parseExtractionResult({ title: "Homepage", url: "https://example.com" }, { url: "https://example.com" }), undefined);
});
test("login and 404 pages are rejected", () => {
  assert.equal(parseExtractionResult({ title: "Sign in", description: "login", url: candidate.url }, candidate), undefined);
  assert.equal(parseExtractionResult({ title: "404 Not Found", description: "missing", url: candidate.url }, candidate), undefined);
});
test("date normalization is conservative", () => {
  const extracted = parseExtractionResult({ title: "Program", description: "Details", url: candidate.url, deadline: "Applications close Aug 30" }, candidate);
  assert.ok(extracted);
  assert.equal(extracted.deadline, undefined);
});
test("mode normalization supports remote, in-person, and hybrid", () => {
  for (const [input, expected] of [["virtual", "remote"], ["offline", "in_person"], ["hybrid", "hybrid"]] as const) {
    const extracted = parseExtractionResult({ title: "Program", description: "Details", url: candidate.url, mode: input }, candidate);
    assert.equal(extracted?.mode, expected);
  }
});
test("opportunity type normalization supports hackathon, internship, and fellowship", () => {
  assert.equal(parseExtractionResult({ title: "AI Hackathon", description: "Details", url: candidate.url }, candidate)?.type, "hackathon");
  assert.equal(parseExtractionResult({ title: "Summer Internship", description: "Details", url: candidate.url }, candidate)?.type, "internship");
  assert.equal(parseExtractionResult({ title: "Research Fellowship", description: "Details", url: candidate.url }, candidate)?.type, "fellowship");
});
test("unknown type maps to other", () => {
  assert.equal(parseExtractionResult({ title: "Community Opportunity", description: "Details", url: candidate.url }, candidate)?.type, "other");
});
test("candidate URL validation is enforced", async () => {
  await assert.rejects(() => extractOpportunities({ candidates: [{ url: "javascript:alert(1)" }] }, { client: { extract: async () => validRaw }, ingest: async () => ({ newRecords: 0, updatedRecords: 0, recordsPersisted: 0, duplicatesFound: 0, recordsValid: 0 }) }), ExtractionValidationError);
});
test("candidate limit is enforced", async () => {
  const candidates = Array.from({ length: 20 }, (_, index) => ({ url: `https://example.com/${index}` }));
  const result = await extractOpportunities({ candidates }, { client: { extract: async (url) => ({ ...validRaw, opportunityUrl: url }) }, ingest: async (records) => ({ newRecords: records.length, updatedRecords: 0, recordsPersisted: records.length, duplicatesFound: 0, recordsValid: records.length }) });
  assert.equal(result.candidatesReceived, 20);
  assert.equal(result.candidatesProcessed, Math.min(20, env.MAX_EXTRACTION_CANDIDATES));
});
test("multiple candidates are processed with bounded concurrency", async () => {
  let active = 0;
  let maximum = 0;
  const result = await extractOpportunities({ candidates: [candidate, { url: "https://example.com/two" }, { url: "https://example.com/three" }] }, {
    client: { extract: async (url) => { active += 1; maximum = Math.max(maximum, active); await new Promise((resolve) => setTimeout(resolve, 2)); active -= 1; return { ...validRaw, opportunityUrl: url }; } },
    ingest: async (records) => ({ newRecords: records.length, updatedRecords: 0, recordsPersisted: records.length, duplicatesFound: 0, recordsValid: records.length }),
  });
  assert.equal(result.extracted, 3);
  assert.ok(maximum <= 2);
});
test("one candidate failure does not fail the batch", async () => {
  const result = await extractOpportunities({ candidates: [candidate, { url: "https://example.com/fail" }] }, {
    client: { extract: async (url) => { if (url.endsWith("fail")) throw new Error("provider failure"); return validRaw; } },
    ingest: async (records) => ({ newRecords: records.length, updatedRecords: 0, recordsPersisted: records.length, duplicatesFound: 0, recordsValid: records.length }),
  });
  assert.equal(result.extracted, 1);
  assert.equal(result.rejected, 1);
});

test("extraction batch exposes deterministic quality metadata", async () => {
  const result = await extractOpportunities({ candidates: [candidate] }, {
    client: { extract: async () => devpostProviderFixture },
    ingest: async (records) => ({ newRecords: records.length, updatedRecords: 0, recordsPersisted: records.length, duplicatesFound: 0, recordsValid: records.length }),
  });
  assert.equal(result.results[0]?.extractionQuality?.status, "healthy");
  assert.equal(result.results[0]?.extractionQuality?.score, 100);
});

test("healthy extraction does not trigger self-healing", async () => {
  let healingCalls = 0;
  const result = await extractOpportunities({ candidates: [candidate] }, {
    client: { extract: async () => validRaw },
    collectorId: "collector-test",
    createHealingClient: () => ({ heal: async () => { healingCalls += 1; return { success: true, pendingApproval: false, status: "completed" }; } }),
    ingest: async (records) => ({ newRecords: records.length, updatedRecords: 0, recordsPersisted: records.length, duplicatesFound: 0, recordsValid: records.length }),
  });
  assert.equal(healingCalls, 0);
  assert.equal(result.results[0]?.healing?.status, "not_needed");
});

test("incomplete extraction triggers one healing attempt and accepts improved data", async () => {
  let extractionCalls = 0;
  let prompt = "";
  let customInput: unknown[] = [];
  const incomplete = { title: "AI Hackathon", description: "Apply now", url: candidate.url };
  const result = await extractOpportunities({ candidates: [candidate] }, {
    client: { extract: async () => extractionCalls++ === 0 ? incomplete : validRaw },
    collectorId: "collector-test",
    createHealingClient: () => ({ heal: async (_collectorId: string, instruction: string, input: unknown[]) => { prompt = instruction; customInput = input; return { success: true, pendingApproval: false, status: "completed", productionState: "verified" as const, repairedScraper: { collectorId: "collector-test", version: "dev" as const, template: { code: "repaired" } } }; } }),
    extractHealed: async (_url, repair) => { assert.equal(repair.repairedScraper?.version, "dev"); assert.equal(repair.repairedScraper?.template.code, "repaired"); return validRaw; },
    ingest: async (records) => ({ newRecords: records.length, updatedRecords: 0, recordsPersisted: records.length, duplicatesFound: 0, recordsValid: records.length }),
  });
  assert.equal(extractionCalls, 1);
  assert.equal(result.results[0]?.healing?.status, "recovered");
  assert.equal(result.results[0]?.extractionQuality?.score, 91);
  assert.match(prompt, /organization/);
  assert.match(prompt, /application URL|application_url/i);
  assert.deepEqual(customInput, [{ url: candidate.url }]);
  assert.doesNotMatch(prompt, /BRIGHT_DATA_API_TOKEN|Authorization|Bearer/i);
});

test("healing trigger failure preserves the original extracted opportunity", async () => {
  let healingCalls = 0;
  const incomplete = { title: "AI Hackathon", description: "Apply now", url: candidate.url };
  const result = await extractOpportunities({ candidates: [candidate] }, {
    client: { extract: async () => incomplete },
    collectorId: "collector-test",
    createHealingClient: () => ({ heal: async () => { healingCalls += 1; throw new Error("healing trigger failed"); } }),
    ingest: async (records) => ({ newRecords: records.length, updatedRecords: 0, recordsPersisted: records.length, duplicatesFound: 0, recordsValid: records.length }),
  });
  assert.equal(healingCalls, 1);
  assert.equal(result.extracted, 1);
  assert.equal(result.results[0]?.healing?.status, "failed");
});

test("unverified repair is reported without re-extracting the original collector", async () => {
  let extractionCalls = 0;
  const incomplete = { title: "AI Hackathon", description: "Apply now", url: candidate.url };
  const result = await extractOpportunities({ candidates: [candidate] }, {
    client: { extract: async () => { extractionCalls += 1; return incomplete; } },
    collectorId: "collector-test",
    createHealingClient: () => ({ heal: async () => ({ success: true, pendingApproval: false, status: "completed", productionState: "not_verified" as const }) }),
    ingest: async (records) => ({ newRecords: records.length, updatedRecords: 0, recordsPersisted: records.length, duplicatesFound: 0, recordsValid: records.length }),
  });
  assert.equal(extractionCalls, 1);
  assert.equal(result.results[0]?.healing?.status, "repair_available");
  assert.equal(result.results[0]?.healing?.productionState, "not_verified");
  assert.equal(result.results[0]?.healing?.healingImproved, false);
});

test("verified healed extraction must improve quality without critical regression", async () => {
  const incomplete = { title: "AI Hackathon", description: "Apply now", url: candidate.url };
  const result = await extractOpportunities({ candidates: [candidate] }, {
    client: { extract: async () => incomplete },
    collectorId: "collector-test",
    createHealingClient: () => ({ heal: async () => ({ success: true, pendingApproval: false, status: "completed", productionState: "verified" as const, repairedScraper: { collectorId: "collector-test", version: "dev" as const, template: {} } }) }),
    extractHealed: async () => validRaw,
    ingest: async (records) => ({ newRecords: records.length, updatedRecords: 0, recordsPersisted: records.length, duplicatesFound: 0, recordsValid: records.length }),
  });
  assert.equal(result.results[0]?.healing?.status, "recovered");
  assert.equal(result.results[0]?.healing?.healingImproved, true);
  assert.equal(result.results[0]?.healing?.productionState, "verified");
  assert.equal(result.results[0]?.extractionQuality?.score, 91);
});

test("same, worse, and critical-regression healed results are preserved", async () => {
  const initial = { title: "AI Hackathon", organization: "Org", description: "Apply now", location: "Remote", url: candidate.url };
  const repair = { success: true, pendingApproval: false, status: "completed", productionState: "verified" as const, repairedScraper: { collectorId: "collector-test", version: "dev" as const, template: {} } };
  const run = async (healedRaw: unknown) => extractOpportunities({ candidates: [candidate] }, {
    client: { extract: async () => initial },
    collectorId: "collector-test",
    createHealingClient: () => ({ heal: async () => repair }),
    extractHealed: async () => healedRaw,
    ingest: async (records) => ({ newRecords: records.length, updatedRecords: 0, recordsPersisted: records.length, duplicatesFound: 0, recordsValid: records.length }),
  });
  const same = await run(initial);
  const worse = await run({ title: "AI Hackathon", description: "Apply now", url: candidate.url });
  const criticalRegression = await run({ title: "AI Hackathon", description: "Apply now", url: candidate.url, location: "Remote", mode: "online" });
  assert.equal(same.results[0]?.healing?.status, "no_improvement");
  assert.equal(worse.results[0]?.healing?.status, "no_improvement");
  assert.equal(criticalRegression.results[0]?.healing?.status, "no_improvement");
  assert.equal(criticalRegression.results[0]?.opportunity?.organization, "Org");
});

test("repaired collection failure is controlled and preserves original data", async () => {
  const incomplete = { title: "AI Hackathon", description: "Apply now", url: candidate.url };
  const result = await extractOpportunities({ candidates: [candidate] }, {
    client: { extract: async () => incomplete },
    collectorId: "collector-test",
    createHealingClient: () => ({ heal: async () => ({ success: true, pendingApproval: false, status: "completed", productionState: "verified" as const, repairedScraper: { collectorId: "collector-test", version: "dev" as const, template: {} } }) }),
    extractHealed: async () => { throw new Error("repaired collection failed"); },
    ingest: async (records) => ({ newRecords: records.length, updatedRecords: 0, recordsPersisted: records.length, duplicatesFound: 0, recordsValid: records.length }),
  });
  assert.equal(result.extracted, 1);
  assert.equal(result.results[0]?.healing?.status, "failed");
  assert.equal(result.results[0]?.opportunity?.title, "AI Hackathon");
});

test("concurrent incomplete candidates share one collector healing operation", async () => {
  let healingCalls = 0;
  const incomplete = { title: "AI Hackathon", description: "Apply now", url: candidate.url };
  const repair = { success: true, pendingApproval: false, status: "completed", productionState: "verified" as const, repairedScraper: { collectorId: "collector-shared", version: "dev" as const, template: {} } };
  const result = await extractOpportunities({ candidates: [candidate, { url: "https://example.com/two" }] }, {
    client: { extract: async () => incomplete },
    collectorId: "collector-shared",
    createHealingClient: () => ({ heal: async () => { healingCalls += 1; await new Promise((resolve) => setTimeout(resolve, 5)); return repair; } }),
    extractHealed: async () => validRaw,
    ingest: async (records) => ({ newRecords: records.length, updatedRecords: 0, recordsPersisted: records.length, duplicatesFound: 0, recordsValid: records.length }),
  });
  assert.equal(healingCalls, 1);
  assert.equal(result.extracted, 2);
  assert.equal(result.results[0]?.healing?.status, "recovered");
  assert.equal(result.results[1]?.healing?.status, "recovered");
});

test("healing that does not improve quality is not accepted", async () => {
  let extractionCalls = 0;
  const incomplete = { title: "AI Hackathon", description: "Apply now", url: candidate.url };
  const result = await extractOpportunities({ candidates: [candidate] }, {
    client: { extract: async () => { extractionCalls += 1; return incomplete; } },
    collectorId: "collector-test",
    createHealingClient: () => ({ heal: async () => ({ success: true, pendingApproval: false, status: "completed" }) }),
    ingest: async (records) => ({ newRecords: records.length, updatedRecords: 0, recordsPersisted: records.length, duplicatesFound: 0, recordsValid: records.length }),
  });
  assert.equal(extractionCalls, 1);
  assert.equal(result.results[0]?.healing?.status, "repair_available");
  assert.equal(result.results[0]?.extractionQuality?.score, 27);
});

test("pending approval and timeout are controlled healing outcomes", async () => {
  const incomplete = { title: "AI Hackathon", description: "Apply now", url: candidate.url };
  const pending = await extractOpportunities({ candidates: [candidate] }, {
    client: { extract: async () => incomplete },
    collectorId: "collector-test",
    createHealingClient: () => ({ heal: async () => ({ success: false, pendingApproval: true, status: "pending_answer", error: "approval required" }) }),
    ingest: async (records) => ({ newRecords: records.length, updatedRecords: 0, recordsPersisted: records.length, duplicatesFound: 0, recordsValid: records.length }),
  });
  const timeout = await extractOpportunities({ candidates: [candidate] }, {
    client: { extract: async () => incomplete },
    collectorId: "collector-test",
    createHealingClient: () => ({ heal: async () => { throw new Error("Bright Data healing timed out"); } }),
    ingest: async (records) => ({ newRecords: records.length, updatedRecords: 0, recordsPersisted: records.length, duplicatesFound: 0, recordsValid: records.length }),
  });
  assert.equal(pending.results[0]?.healing?.status, "pending_approval");
  assert.equal(timeout.results[0]?.healing?.status, "timeout");
});

test("a hanging healing dependency returns a controlled extraction result", async () => {
  const incomplete = { title: "AI Hackathon", description: "Apply now", url: candidate.url };
  const result = await extractOpportunities({ candidates: [candidate] }, {
    client: { extract: async () => incomplete },
    collectorId: "collector-test",
    healingTimeoutMs: 10,
    createHealingClient: () => ({ heal: async () => new Promise<never>(() => {}) }),
    ingest: async (records) => ({ newRecords: records.length, updatedRecords: 0, recordsPersisted: records.length, duplicatesFound: 0, recordsValid: records.length }),
  });
  assert.equal(result.extracted, 1);
  assert.equal(result.results[0]?.healing?.status, "timeout");
});
test("existing ingestion integration receives normalized records and reports duplicates", async () => {
  let received = 0;
  const result = await extractOpportunities({ candidates: [candidate, candidate] }, {
    client: { extract: async () => validRaw },
    ingest: async (records) => { received = records.length; return { newRecords: 1, updatedRecords: 0, recordsPersisted: 1, duplicatesFound: 1, recordsValid: records.length }; },
  });
  assert.equal(received, 2);
  assert.equal(result.persisted, 1);
  assert.equal(result.duplicates, 1);
});
test("empty and malformed extraction responses are rejected", async () => {
  const result = await extractOpportunities({ candidates: [candidate, { url: "https://example.com/malformed" }] }, {
    client: { extract: async (url) => url.endsWith("malformed") ? "not-json" : [] },
    ingest: async (records) => ({ newRecords: records.length, updatedRecords: 0, recordsPersisted: records.length, duplicatesFound: 0, recordsValid: records.length }),
  });
  assert.equal(result.extracted, 0);
  assert.equal(result.rejected, 2);
});

test("normalized opportunity maps to the existing canonical shape", () => {
  const extracted = parseExtractionResult(validRaw, candidate);
  assert.ok(extracted);
  const normalized = toNormalizedOpportunity(extracted);
  assert.equal(normalized.category, "hackathon");
  assert.equal(normalized.opportunityUrl, candidate.url);
  assert.equal(normalized.source, "example.com");
});
