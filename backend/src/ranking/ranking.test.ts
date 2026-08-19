import assert from "node:assert/strict";
import test from "node:test";
import { parseSearchIntent } from "../search/search-intent.service.js";
import type { NormalizedOpportunity } from "../ingestion/types.js";
import { rankOpportunities, scoreOpportunity } from "./ranking.service.js";
import { filterOpportunity } from "../filtering/filtering.service.js";
import { RANKING_WEIGHTS } from "./ranking.constants.js";
import type { RankableFilteredOpportunity } from "./ranking.types.js";

const NOW = new Date("2026-08-15T00:00:00.000Z");

function intent(input: Record<string, unknown> = {}) {
  return parseSearchIntent({ type: "hackathon", ...input });
}

function opportunity(overrides: Partial<NormalizedOpportunity> = {}): NormalizedOpportunity {
  return {
    title: "AI Hackathon",
    organization: "Example Org",
    description: "Build useful developer tools.",
    eligibility: "Students welcome",
    category: "hackathon",
    url: "https://example.com/opportunity",
    opportunityUrl: "https://example.com/opportunity",
    source: "example.com",
    location: "India",
    skills: ["Python", "AI"],
    status: "upcoming",
    startDate: new Date("2026-09-05T00:00:00.000Z"),
    endDate: new Date("2026-09-10T00:00:00.000Z"),
    deadline: new Date("2026-08-30T00:00:00.000Z"),
    mode: "remote",
    prize: "$10,000",
    applicationUrl: "https://example.com/apply",
    scrapedAt: NOW,
    ...overrides,
  };
}

function item(opportunityValue: NormalizedOpportunity, decision: "match" | "unknown" = "match", unknownFilters: string[] = []): RankableFilteredOpportunity {
  return { opportunity: opportunityValue, decision, matchedFilters: [], unknownFilters, failedFilters: [] };
}

test("exact type receives the full type weight", () => {
  const result = scoreOpportunity(intent(), item(opportunity()));
  assert.equal(result.breakdown.type, RANKING_WEIGHTS.type);
  assert.ok(result.score >= 90);
});

test("title keyword match scores higher than description-only match", () => {
  const requested = intent({ keywords: ["AI"] });
  const title = scoreOpportunity(requested, item(opportunity({ title: "AI Hackathon", description: "Build tools" })));
  const description = scoreOpportunity(requested, item(opportunity({ title: "Developer Event", description: "Use AI" })));
  assert.ok(title.breakdown.keywords > description.breakdown.keywords);
});

test("multiple and partial keyword matches are scored proportionally", () => {
  const requested = intent({ keywords: ["AI", "Python"] });
  const full = scoreOpportunity(requested, item(opportunity({ title: "AI Python Hackathon" })));
  const partial = scoreOpportunity(requested, item(opportunity({ title: "AI Hackathon", skills: [] })));
  assert.ok(full.breakdown.keywords > partial.breakdown.keywords);
});

test("exact country and city plus country receive strong location scores", () => {
  const requested = intent({ location: { country: "India", city: "Bengaluru" } });
  const exact = scoreOpportunity(requested, item(opportunity({ location: "Bengaluru, India" })));
  const country = scoreOpportunity(requested, item(opportunity({ location: "India" })));
  assert.equal(exact.breakdown.location, RANKING_WEIGHTS.location);
  assert.ok(exact.breakdown.location > country.breakdown.location);
});

test("unknown location receives reduced but nonzero confidence", () => {
  const result = scoreOpportunity(intent({ location: { country: "India" } }), item(opportunity({ location: "" }), "unknown", ["location"]));
  assert.equal(result.breakdown.location, 5);
  assert.ok(result.uncertainties.includes("Unknown location data"));
});

test("mode scoring supports exact, hybrid partial, any, and unknown", () => {
  const exact = scoreOpportunity(intent({ mode: "remote" }), item(opportunity({ mode: "remote" })));
  const hybrid = scoreOpportunity(intent({ mode: "remote" }), item(opportunity({ mode: "hybrid" })));
  const any = scoreOpportunity(intent({ mode: "any" }), item(opportunity({ mode: "in_person" })));
  const unknown = scoreOpportunity(intent({ mode: "remote" }), item(opportunity({ mode: null }), "unknown", ["mode"]));
  assert.equal(exact.breakdown.mode, 10);
  assert.equal(hybrid.breakdown.mode, 6);
  assert.equal(any.breakdown.mode, 10);
  assert.equal(unknown.breakdown.mode, 4);
});

test("explanations distinguish confirmed and unknown constraints", () => {
  const requested = intent({ mode: "remote", deadline: { kind: "open" } });
  const known = scoreOpportunity(requested, item(opportunity({ mode: "remote" })), { referenceDate: NOW });
  const unknown = scoreOpportunity(requested, item(opportunity({ mode: null, deadline: null }), "unknown", ["mode", "deadline"]), { referenceDate: NOW });
  assert.ok(known.reasons.includes("Remote participation confirmed"));
  assert.ok(!known.uncertainties.includes("Participation mode is unknown"));
  assert.ok(unknown.uncertainties.includes("Participation mode is unknown"));
  assert.ok(unknown.uncertainties.includes("Application deadline is unknown"));
});

test("exact date range scores above partial overlap and unknown date", () => {
  const requested = intent({ date: { kind: "custom", from: "2026-09-01", to: "2026-09-30" } });
  const exact = scoreOpportunity(requested, item(opportunity()), { referenceDate: NOW });
  const partial = scoreOpportunity(requested, item(opportunity({ startDate: new Date("2026-08-30"), endDate: new Date("2026-09-02") })), { referenceDate: NOW });
  const unknown = scoreOpportunity(requested, item(opportunity({ startDate: null, endDate: null, deadline: null }), "unknown", ["date"]), { referenceDate: NOW });
  assert.ok(exact.breakdown.date > partial.breakdown.date);
  assert.ok(partial.breakdown.date > unknown.breakdown.date);
});

test("known deadline scores above unknown deadline", () => {
  const requested = intent({ deadline: { kind: "within_days", days: 30 } });
  const known = scoreOpportunity(requested, item(opportunity()), { referenceDate: NOW });
  const unknown = scoreOpportunity(requested, item(opportunity({ deadline: null }), "unknown", ["deadline"]), { referenceDate: NOW });
  assert.ok(known.breakdown.deadline > unknown.breakdown.deadline);
});

test("unknown requested fields never receive full component credit", () => {
  const requested = intent({
    keywords: ["AI"],
    location: { country: "India" },
    mode: "remote",
    date: { kind: "next_month" },
    deadline: { kind: "open" },
    skills: ["AI"],
    eligibility: { student: true },
  });
  const unknown = scoreOpportunity(requested, item(opportunity({
    location: "",
    mode: null,
    startDate: null,
    endDate: null,
    deadline: null,
    skills: [],
    eligibility: "",
  }), "unknown", ["location", "mode", "date", "deadline", "skills", "eligibility"]), { referenceDate: NOW });
  assert.ok(unknown.breakdown.location < RANKING_WEIGHTS.location);
  assert.ok(unknown.breakdown.mode < RANKING_WEIGHTS.mode);
  assert.ok(unknown.breakdown.date < RANKING_WEIGHTS.date);
  assert.ok(unknown.breakdown.deadline < RANKING_WEIGHTS.deadline);
  assert.ok(unknown.breakdown.skills < RANKING_WEIGHTS.skills);
  assert.ok(unknown.breakdown.eligibility < RANKING_WEIGHTS.eligibility);
  assert.ok(unknown.uncertainties.includes("Required skills could not be verified"));
  assert.ok(unknown.uncertainties.includes("Eligibility information is unavailable"));
});

test("reproduces the real sparse opportunity ranking path", () => {
  const requested = intent({
    keywords: ["AI"],
    location: { country: "India" },
    mode: "remote",
    date: { kind: "next_month" },
    skills: [],
  });
  const sparse = opportunity({
    organization: "",
    description: "",
    location: "",
    skills: [],
    eligibility: "",
    status: "unknown",
    startDate: null,
    endDate: null,
    deadline: null,
    mode: null,
  });
  const filtered = filterOpportunity(requested, sparse, { now: NOW });
  assert.equal(filtered.decision, "unknown");
  assert.deepEqual(filtered.unknownFilters, ["location", "mode", "date", "deadline"]);
  const ranked = scoreOpportunity(requested, filtered as RankableFilteredOpportunity, { referenceDate: NOW });
  assert.equal(ranked.breakdown.type, 15);
  assert.equal(ranked.breakdown.keywords, 20);
  assert.ok(ranked.breakdown.location < 15);
  assert.ok(ranked.breakdown.mode < 10);
  assert.ok(ranked.breakdown.date < 10);
  assert.ok(ranked.breakdown.deadline < 10);
  assert.ok(ranked.breakdown.skills < 10);
  assert.ok(ranked.breakdown.eligibility < 5);
  assert.ok(ranked.uncertainties.includes("Required skills could not be verified"));
  assert.ok(ranked.uncertainties.includes("Eligibility information is unavailable"));
  assert.ok(ranked.uncertainties.includes("Participation mode is unknown"));
});

test("completeness rewards canonical presence and deterministic ordering remains stable", () => {
  const requested = intent({ mode: "remote" });
  const complete = scoreOpportunity(requested, item(opportunity()), { referenceDate: NOW });
  const sparse = scoreOpportunity(requested, item(opportunity({ organization: "", description: "", location: "", mode: null, skills: [], eligibility: "", prize: undefined, applicationUrl: undefined }), "unknown", ["mode"]), { referenceDate: NOW });
  assert.ok(complete.breakdown.completeness > sparse.breakdown.completeness);
  const first = rankOpportunities(requested, [item(opportunity({ opportunityUrl: "https://example.com/b" })), item(opportunity({ opportunityUrl: "https://example.com/a" }))], { referenceDate: NOW });
  const second = rankOpportunities(requested, [item(opportunity({ opportunityUrl: "https://example.com/b" })), item(opportunity({ opportunityUrl: "https://example.com/a" }))], { referenceDate: NOW });
  assert.deepEqual(first, second);
});

test("skills and eligibility contribute deterministically", () => {
  const requested = intent({ skills: ["Python", "AI"], eligibility: { student: true } });
  const full = scoreOpportunity(requested, item(opportunity()));
  const partial = scoreOpportunity(requested, item(opportunity({ title: "Hackathon", skills: ["Python"], eligibility: "" }), "unknown", ["eligibility"]));
  assert.ok(full.breakdown.skills > partial.breakdown.skills);
  assert.ok(full.breakdown.eligibility > partial.breakdown.eligibility);
});

test("completeness contributes without overpowering relevance", () => {
  const requested = intent({ keywords: ["AI"] });
  const complete = scoreOpportunity(requested, item(opportunity()));
  const incomplete = scoreOpportunity(requested, item(opportunity({ title: "AI Hackathon", organization: "", description: "", location: "", skills: [], mode: null, deadline: null, startDate: null, endDate: null, eligibility: "", prize: undefined, applicationUrl: undefined })));
  assert.ok(complete.breakdown.completeness > incomplete.breakdown.completeness);
  assert.ok(incomplete.breakdown.keywords > 0);
  assert.ok(incomplete.score >= 0);
  assert.ok(complete.score > incomplete.score);
});

test("hard mismatches are excluded and MATCH ranks above UNKNOWN", () => {
  const requested = intent({ mode: "remote" });
  const result = rankOpportunities(requested, [
    item(opportunity({ opportunityUrl: "https://example.com/unknown", mode: null }), "unknown", ["mode"]),
    item(opportunity({ opportunityUrl: "https://example.com/match" })),
    { ...item(opportunity({ opportunityUrl: "https://example.com/mismatch", mode: "in_person" })), decision: "mismatch" as const },
  ], { referenceDate: NOW });
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0]?.decision, "match");
});

test("scores are stable, bounded, and breakdown totals equal score", () => {
  const requested = intent({ keywords: ["AI"], date: { kind: "custom", from: "2026-09-01", to: "2026-09-30" } });
  const first = scoreOpportunity(requested, item(opportunity()), { referenceDate: NOW });
  const second = scoreOpportunity(requested, item(opportunity()), { referenceDate: NOW });
  assert.deepEqual(first, second);
  assert.ok(first.score >= 0 && first.score <= 100);
  assert.equal(first.score, Object.values(first.breakdown).reduce((sum, value) => sum + value, 0));
});

test("sorting uses deterministic URL tie-breaking and does not mutate input", () => {
  const requested = intent();
  const input = [item(opportunity({ opportunityUrl: "https://example.com/z" })), item(opportunity({ opportunityUrl: "https://example.com/a" }))];
  const before = structuredClone(input);
  const result = rankOpportunities(requested, input, { referenceDate: NOW });
  assert.equal(result.results[0]?.opportunity.opportunityUrl, "https://example.com/a");
  assert.deepEqual(input, before);
});

test("empty and single inputs are supported", () => {
  assert.deepEqual(rankOpportunities(intent(), []).results, []);
  assert.equal(rankOpportunities(intent(), [item(opportunity())]).results.length, 1);
});

test("large local batches remain processable", () => {
  const input = Array.from({ length: 1000 }, (_, index) => item(opportunity({ opportunityUrl: `https://example.com/${index}` })));
  const started = Date.now();
  const result = rankOpportunities(intent({ keywords: ["AI"] }), input, { referenceDate: NOW });
  assert.equal(result.results.length, 1000);
  assert.ok(Date.now() - started < 1000);
});
