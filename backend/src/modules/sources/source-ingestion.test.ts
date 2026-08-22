import assert from "node:assert/strict";
import test from "node:test";
import { ingestDiscoveredCandidates } from "./source-ingestion.service.js";
import type { CandidateUrl } from "../../discovery/discovery.types.js";

const candidate = (url: string): CandidateUrl => ({ url, title: "Hackathon", description: "Apply for this challenge", source: "web_search", searchQuery: "hackathon", rank: 1, discoveryMetadata: { domain: new URL(url).hostname } });

test("ingests candidates independently so one source failure does not stop others", async () => {
  const candidates = [candidate("https://one.example/hackathon"), candidate("https://two.example/hackathon")];
  const results = await ingestDiscoveredCandidates(candidates, {
    findByDomain: async (domain) => ({ id: domain, name: domain, url: `https://${domain}`, collectorId: `collector-${domain}` }),
    findByUrl: async () => null,
    createSource: async () => { throw new Error("not used"); },
    updateSource: async () => null,
    markProvisioningFailed: async () => null,
    provisioner: { createCollector: async () => ({ collectorId: "not-used" }) },
    scrape: async (id) => {
      if (id.startsWith("one.")) throw new Error("source unavailable");
      return { scrapeRun: {}, ingestion: { newRecords: 1, updatedRecords: 0, recordsFound: 1, recordsValid: 1, recordsRejected: 0, duplicatesFound: 0, recordsPersisted: 1, validationErrors: [] }, snapshotId: "snapshot", health: { status: "healthy", severity: "info", reasons: [], metrics: { currentRecords: 1, validationFailureRate: 0 } } };
    },
  });
  assert.equal(results.length, 2);
  assert.equal(results[0]?.resolution.status, "reused");
  assert.equal(results[1]?.resolution.status, "reused");
});
