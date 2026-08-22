import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  buildEnrichmentPatch,
  isSparse,
} from "./enrichment.service.js";
import type { ExtractedOpportunity } from "../extraction/extraction.types.js";

function fresh(overrides: Partial<ExtractedOpportunity> = {}): ExtractedOpportunity {
  return {
    title: "HackSpire",
    organization: "ACM",
    description: "A 36 hour national hackathon.",
    opportunityUrl: "https://example.org/hackspire",
    eligibility: "Open to all students",
    skills: ["react", "node"],
    deadline: new Date("2026-09-30T00:00:00Z"),
    source: { url: "https://example.org/hackspire", domain: "example.org" },
    ...overrides,
  };
}

describe("isSparse", () => {
  test("title-only records are sparse", () => {
    assert.equal(isSparse({ description: "", eligibility: "", skills: [] }), true);
    assert.equal(isSparse({}), true);
  });

  test("short descriptions alone still count as sparse", () => {
    assert.equal(isSparse({ description: "Register now!", eligibility: "", skills: [] }), true);
  });

  test("records with real detail are not sparse", () => {
    assert.equal(isSparse({
      description: "A comprehensive two day event with workshops, mentors, and prizes for participating teams.",
      eligibility: "",
      skills: [],
    }), false);
    assert.equal(isSparse({ description: "", eligibility: "Open to undergrads", skills: ["python"] }), false);
  });
});

describe("buildEnrichmentPatch", () => {
  test("fills empty fields from the fresh extraction", () => {
    const patch = buildEnrichmentPatch(
      { description: "", organization: "", skills: [], location: "Remote" },
      fresh(),
    );
    assert.equal(patch.description, "A 36 hour national hackathon.");
    assert.equal(patch.organization, "ACM");
    assert.equal(patch.eligibility, "Open to all students");
    assert.deepEqual(patch.skills, ["react", "node"]);
    assert.equal(patch.deadline?.toISOString(), "2026-09-30T00:00:00.000Z");
    assert.equal(patch.location, undefined);
  });

  test("never overwrites data we already hold", () => {
    const patch = buildEnrichmentPatch(
      {
        description: "Existing long description that must be preserved.",
        organization: "Existing Org",
        eligibility: "Existing rules",
        skills: ["rust"],
        deadline: new Date("2026-10-01T00:00:00Z"),
        prize: "$5000",
        mode: "hybrid",
        applicationUrl: "https://apply.example.org",
      },
      fresh({ deadline: new Date("2026-12-01T00:00:00Z") }),
    );

    assert.equal(patch.description, undefined);
    assert.equal(patch.organization, undefined);
    assert.equal(patch.eligibility, undefined);
    assert.equal(patch.skills, undefined);
    assert.equal(patch.deadline, undefined);
    assert.equal(patch.prize, undefined);
    assert.equal(patch.mode, undefined);
    assert.equal(patch.applicationUrl, undefined);
  });

  test("returns an empty patch when nothing new can be added", () => {
    const complete = {
      description: "Complete description already present in storage.",
      organization: "Org",
      eligibility: "Rules",
      skills: ["go"],
      deadline: new Date("2026-11-01T00:00:00Z"),
      prize: "$100",
      mode: "in_person" as const,
    };
    const patch = buildEnrichmentPatch(complete, fresh());
    assert.deepEqual(Object.keys(patch), []);
  });
});
