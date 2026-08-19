import assert from "node:assert/strict";
import test from "node:test";
import { buildDiscoveryQueries, MAX_DISCOVERY_QUERIES } from "./query-builder.js";
import {
  discoverCandidates,
  extractCandidates,
  MAX_CANDIDATES,
  normalizeCandidateUrl,
} from "./discovery.service.js";
import { BrightDataError } from "../integrations/brightdata/brightdata.client.js";

const now = new Date("2026-08-19T12:00:00.000Z");

test("hackathon query generation", () => {
  const queries = buildDiscoveryQueries({ type: "hackathon", keywords: ["AI"], mode: "any", skills: [] }, now);
  assert.match(queries[0] ?? "", /AI hackathon/);
});
test("fellowship query generation", () => assert.match(buildDiscoveryQueries({ type: "fellowship", keywords: [], mode: "any", skills: [] }, now)[0] ?? "", /fellowship/));
test("internship query generation", () => assert.match(buildDiscoveryQueries({ type: "internship", keywords: [], mode: "any", skills: [] }, now)[0] ?? "", /internship/));
test("location query generation", () => assert.match(buildDiscoveryQueries({ type: "grant", keywords: [], location: { country: "India" }, mode: "any", skills: [] }, now)[0] ?? "", /India/));
test("mode query generation", () => assert.match(buildDiscoveryQueries({ type: "job", keywords: [], mode: "remote", skills: [] }, now)[0] ?? "", /online/));
test("date query generation", () => assert.match(buildDiscoveryQueries({ type: "hackathon", keywords: [], mode: "any", date: { kind: "next_month" }, skills: [] }, now)[0] ?? "", /September 2026/));
test("query count is bounded", () => assert.ok(buildDiscoveryQueries({ type: "hackathon", keywords: ["a", "b", "c"], mode: "remote", skills: [] }).length <= MAX_DISCOVERY_QUERIES));
test("URL normalization removes tracking and trailing slash", () => {
  assert.equal(normalizeCandidateUrl("HTTPS://Example.COM/path/?utm_source=x&gclid=y"), "https://example.com/path");
});
test("malformed and unsafe URLs are rejected", () => {
  assert.equal(normalizeCandidateUrl("not-a-url"), undefined);
  assert.equal(normalizeCandidateUrl("javascript:alert(1)"), undefined);
});
test("Google ServiceLogin URL is rejected", () => {
  const candidates = extractCandidates({ organic: [{ link: "https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fexample.com%2Fhackathon&service=mail", title: "AI Hackathon", description: "hackathon" }] }, "AI hackathon", { type: "hackathon", keywords: ["AI"], mode: "any", skills: [] });
  assert.equal(candidates.length, 0);
});
test("ServiceLogin variants and encoded authentication URLs are rejected", () => {
  const payload = { organic: [
    { link: "https://accounts.google.com/ServiceLogin?continue=x", title: "AI Hackathon", description: "hackathon" },
    { link: "https://accounts.google.com/ServiceLogin/?continue=x", title: "AI Hackathon", description: "hackathon" },
    { link: "https%3A%2F%2Faccounts.google.com%2FServiceLogin%3Fcontinue%3Dx", title: "AI Hackathon", description: "hackathon" },
    { link: "https://accounts.google.com./ServiceLogin?continue=x", title: "AI Hackathon", description: "hackathon" },
  ] };
  assert.equal(extractCandidates(payload, "AI hackathon", { type: "hackathon", keywords: ["AI"], mode: "any", skills: [] }).length, 0);
});
test("login URL and search URL are rejected", () => {
  const payload = { organic: [
    { link: "https://example.com/login", title: "AI Hackathon", description: "hackathon" },
    { link: "https://www.google.com/search?q=AI+hackathon", title: "AI Hackathon", description: "hackathon" },
  ] };
  assert.equal(extractCandidates(payload, "AI hackathon", { type: "hackathon", keywords: ["AI"], mode: "any", skills: [] }).length, 0);
});
test("junk titles are rejected", () => {
  const titles = ["Sign in", "Page not found", "404 Not Found"];
  for (const title of titles) {
    assert.equal(extractCandidates({ organic: [{ link: "https://example.com/page", title, description: "AI hackathon" }] }, "AI hackathon", { type: "hackathon", keywords: ["AI"], mode: "any", skills: [] }).length, 0);
  }
});
test("duplicate URL removal within a result set", () => {
  const candidates = extractCandidates({ organic: [
    { link: "https://example.com/a?utm_source=x", title: "AI Hackathon", description: "hackathon" },
    { link: "https://example.com/a", title: "AI Hackathon", description: "hackathon" },
  ] }, "AI hackathon", { type: "hackathon", keywords: ["AI"], mode: "any", skills: [] });
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0]?.url, candidates[1]?.url);
});
test("duplicate URLs across queries are removed", async () => {
  const result = await discoverCandidates({ type: "hackathon", keywords: ["AI"], mode: "any", skills: [] }, { search: async () => ({ organic: [{ link: "https://example.com/a", title: "AI Hackathon", description: "hackathon" }] }) });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.metadata.duplicatesRemoved, 2);
});
test("authentication URLs are removed before cross-query deduplication", async () => {
  const result = await discoverCandidates({ type: "hackathon", keywords: ["AI"], mode: "any", skills: [] }, {
    search: async () => ({ organic: [{ link: "https://accounts.google.com/ServiceLogin?continue=x", title: "AI Hackathon", description: "hackathon" }] }),
  });
  assert.equal(result.candidates.length, 0);
});
test("obviously irrelevant results are rejected", () => {
  const candidates = extractCandidates({ organic: [{ link: "https://example.com/blog", title: "AI tools for developers", description: "news" }] }, "AI hackathon", { type: "hackathon", keywords: ["AI"], mode: "any", skills: [] });
  assert.equal(candidates.length, 0);
});
test("legitimate hackathon page is retained", () => {
  assert.equal(extractCandidates({ organic: [{ link: "https://unknown.example/events/ai-challenge-2026", title: "AI Challenge 2026", description: "Join the competition." }] }, "AI hackathon", { type: "hackathon", keywords: ["AI"], mode: "any", skills: [] }).length, 1);
});
test("legitimate fellowship page is retained", () => {
  assert.equal(extractCandidates({ organic: [{ link: "https://lablab.ai/programs/fellowship", title: "AI Fellowship", description: "Applications open." }] }, "AI fellowship", { type: "fellowship", keywords: ["AI"], mode: "any", skills: [] }).length, 1);
});
test("legitimate internship page is retained", () => {
  assert.equal(extractCandidates({ organic: [{ link: "https://unstop.com/internships/ai", title: "AI Internship", description: "Apply now." }] }, "AI internship", { type: "internship", keywords: ["AI"], mode: "any", skills: [] }).length, 1);
});
test("unknown domain with relevant title is retained", () => {
  assert.equal(extractCandidates({ organic: [{ link: "https://new-domain.example/opportunity", title: "Global Hackathon 2026", description: "" }] }, "hackathon", { type: "hackathon", keywords: [], mode: "any", skills: [] }).length, 1);
});
test("empty description does not reject a useful candidate", () => {
  assert.equal(extractCandidates({ organic: [{ link: "https://openhackathons.org/events/ai", title: "AI Hackathon", description: "" }] }, "AI hackathon", { type: "hackathon", keywords: ["AI"], mode: "any", skills: [] }).length, 1);
});
test("register in an opportunity title is retained", () => {
  assert.equal(extractCandidates({ organic: [{ link: "https://hackindia.org/events/ai", title: "Register for AI Hackathon 2026", description: "Applications open." }] }, "AI hackathon", { type: "hackathon", keywords: ["AI"], mode: "any", skills: [] }).length, 1);
});
test("relevant Facebook opportunity post can remain", () => {
  assert.equal(extractCandidates({ organic: [{ link: "https://facebook.com/events/123", title: "AI Hackathon 2026", description: "Join this hackathon." }] }, "AI hackathon", { type: "hackathon", keywords: ["AI"], mode: "any", skills: [] }).length, 1);
});
test("generic YouTube hackathon video is rejected", () => {
  assert.equal(extractCandidates({ organic: [{ link: "https://www.youtube.com/watch?v=123", title: "Top 40 AI Hackathons", description: "Video roundup." }] }, "AI hackathon", { type: "hackathon", keywords: ["AI"], mode: "any", skills: [] }).length, 0);
});
test("candidate limit is enforced", async () => {
  const result = await discoverCandidates({ type: "hackathon", keywords: ["AI"], mode: "any", skills: [] }, { search: async (query) => ({ organic: Array.from({ length: 20 }, (_, index) => ({ link: `https://example.com/${query.length}-${index}`, title: "AI Hackathon", description: "hackathon" })) }) });
  assert.equal(result.candidates.length, MAX_CANDIDATES);
});
test("empty search results are handled", async () => {
  const result = await discoverCandidates({ type: "hackathon", keywords: [], mode: "any", skills: [] }, { search: async () => ({ organic: [] }) });
  assert.equal(result.candidates.length, 0);
  assert.equal(result.metadata.resultsDiscovered, 0);
});
test("malformed Bright Data result shape is handled", async () => {
  const result = await discoverCandidates({ type: "hackathon", keywords: [], mode: "any", skills: [] }, { search: async () => "unexpected" });
  assert.equal(result.candidates.length, 0);
});
test("nested JSON SERP payload is parsed", () => {
  const candidates = extractCandidates(JSON.stringify({ data: { organic: [
    { link: "https://example.com/hackathon", title: "AI Hackathon", description: "hackathon" },
  ] } }), "AI hackathon", { type: "hackathon", keywords: ["AI"], mode: "any", skills: [] });
  assert.equal(candidates.length, 1);
});
test("raw SERP HTML is parsed into candidates", () => {
  const html = '<a href="/url?q=https%3A%2F%2Fexample.com%2Fhackathon"><h3>AI Hackathon 2026</h3></a>';
  const candidates = extractCandidates(html, "AI hackathon", { type: "hackathon", keywords: ["AI"], mode: "any", skills: [] });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.url, "https://example.com/hackathon");
});
test("Bright Data failure is propagated", async () => {
  await assert.rejects(
    () => discoverCandidates({ type: "hackathon", keywords: [], mode: "any", skills: [] }, { search: async () => { throw new BrightDataError("failed"); } }),
    BrightDataError,
  );
});
test("invalid intent is rejected before discovery", async () => {
  await assert.rejects(() => discoverCandidates({ type: "unknown" }, { search: async () => ({}) }), /Invalid search intent/);
});
