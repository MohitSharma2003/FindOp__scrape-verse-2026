import assert from "node:assert/strict";
import test from "node:test";
import { parseCandidateRequest } from "./source-ingestion.controller.js";

test("candidate ingestion accepts the documented object envelope", () => {
  const parsed = parseCandidateRequest({ candidates: [{ url: "https://openhackathons.dev/", title: "OpenHackathons", description: "Hackathon opportunities", source: "web_search", searchQuery: "hackathons", rank: 1, discoveryMetadata: { domain: "openhackathons.dev" } }] });
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data[0]?.discoveryMetadata.domain, "openhackathons.dev");
});

test("candidate ingestion retains backward-compatible array input", () => {
  const parsed = parseCandidateRequest([{ url: "https://openhackathons.dev/", title: "OpenHackathons", description: "Hackathon opportunities" }]);
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data[0]?.source, "web_search");
});

test("malformed JSON is not treated as a valid candidate request", () => {
  const parsed = parseCandidateRequest("{'candidates': []}");
  assert.equal(parsed.success, false);
});
