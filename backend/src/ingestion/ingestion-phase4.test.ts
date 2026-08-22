import assert from "node:assert/strict";
import test from "node:test";
import { validateRawRecord } from "./validator.js";
import { normalizeRecord } from "./normalizer.js";
import type { NormalizedOpportunity } from "./types.js";

const context = { sourceId: "600000000000000000000001", sourceUrl: "https://test.com" };

function makeRecord(fields: Record<string, unknown>) {
  return { title: "Test", ...fields };
}

test("Phase 4 Ingestion: Devfolio hackathon record is normalized correctly", () => {
  const raw = makeRecord({
    title: "AI Hackathon 2026",
    hackathon_url: "https://devfolio.co/hackathons/ai-2026",
    product_page_url: "https://devfolio.co/hackathons/ai-2026/apply",
    location: "India",
    status: "open now",
    start_date: "2026-09-01",
    themes: ["AI", "ML"],
    participation_mode: "online",
  });
  const validation = validateRawRecord(raw);
  assert.equal(validation.valid, true);
  const normalized = normalizeRecord(validation.candidate!, context);
  assert.equal(normalized.category, "hackathon");
  assert.equal(normalized.location, "India");
  assert.deepEqual(normalized.skills, ["AI", "ML"]);
  assert.equal(normalized.mode, "remote");
  assert.equal(normalized.status, "open");
});

test("Phase 4 Ingestion: Generic internship record with url field is validated", () => {
  const raw = makeRecord({
    title: "Software Engineering Intern",
    url: "https://careers.example.com/intern",
    description: "Summer internship for CS students",
  });
  const validation = validateRawRecord(raw);
  assert.equal(validation.valid, true);
  assert.equal(validation.candidate?.opportunityUrl, "https://careers.example.com/intern");
});

test("Phase 4 Ingestion: Generic internship record normalizes to correct category", () => {
  const raw = makeRecord({
    title: "Software Engineering Internship",
    url: "https://careers.example.com/intern",
    description: "Summer internship for CS students",
    type: "internship",
  });
  const validation = validateRawRecord(raw);
  assert.equal(validation.valid, true);
  const normalized = normalizeRecord(validation.candidate!, context);
  assert.equal(normalized.category, "internship");
});

test("Phase 4 Ingestion: Fellowship record normalizes correctly", () => {
  const raw = makeRecord({
    title: "ML Fellowship Program",
    url: "https://fellowship.example.com/apply",
    organization: "AI Institute",
    description: "One-year ML fellowship for researchers",
    type: "fellowship",
    location: "Remote",
    participation_mode: "remote",
  });
  const validation = validateRawRecord(raw);
  assert.equal(validation.valid, true);
  const normalized = normalizeRecord(validation.candidate!, context);
  assert.equal(normalized.category, "fellowship");
  assert.equal(normalized.mode, "remote");
  assert.equal(normalized.organization, "AI Institute");
});

test("Phase 4 Ingestion: Job record normalizes correctly", () => {
  const raw = makeRecord({
    title: "React Developer",
    url: "https://jobs.example.com/react",
    company: "TechCorp",
    description: "Full-time React developer position",
    type: "job",
    location: "San Francisco",
  });
  const validation = validateRawRecord(raw);
  assert.equal(validation.valid, true);
  const normalized = normalizeRecord(validation.candidate!, context);
  assert.equal(normalized.category, "job");
  assert.equal(normalized.organization, "TechCorp");
});

test("Phase 4 Ingestion: Competition record normalizes correctly", () => {
  const raw = makeRecord({
    title: "Data Science Contest",
    url: "https://contest.example.com/data",
    description: "Annual data science competition",
    type: "competition",
  });
  const validation = validateRawRecord(raw);
  assert.equal(validation.valid, true);
  const normalized = normalizeRecord(validation.candidate!, context);
  assert.equal(normalized.category, "competition");
});

test("Phase 4 Ingestion: Record with opportunity_url field is validated", () => {
  const raw = makeRecord({
    title: "Test Opportunity",
    opportunity_url: "https://example.com/opp",
    description: "A specific opportunity.",
  });
  const validation = validateRawRecord(raw);
  assert.equal(validation.valid, true);
});

test("Phase 4 Ingestion: Record with opportunityUrl field is validated", () => {
  const raw = makeRecord({
    title: "Test Opportunity",
    opportunityUrl: "https://example.com/opp",
    description: "A specific opportunity.",
  });
  const validation = validateRawRecord(raw);
  assert.equal(validation.valid, true);
});

test("Phase 4 Ingestion: Record with application_url field is validated", () => {
  const raw = makeRecord({
    title: "Test Opportunity",
    application_url: "https://example.com/apply",
  });
  const validation = validateRawRecord(raw);
  assert.equal(validation.valid, false);
});

test("Phase 4 Ingestion: Record with source_url field is validated", () => {
  const raw = makeRecord({
    title: "Test Opportunity",
    source_url: "https://example.com/source",
    description: "A specific opportunity.",
  });
  const validation = validateRawRecord(raw);
  assert.equal(validation.valid, true);
});

test("Phase 4 Ingestion: Record with name instead of title is validated", () => {
  const raw = makeRecord({
    name: "Test Opportunity",
    hackathon_url: "https://example.com/opp",
    description: "A specific hackathon opportunity.",
  });
  const validation = validateRawRecord(raw);
  assert.equal(validation.valid, true);
});

test("Phase 4 Ingestion: Record without title is rejected", () => {
  const raw = { hackathon_url: "https://example.com/opp" };
  const validation = validateRawRecord(raw);
  assert.equal(validation.valid, false);
});

test("Phase 4 Ingestion: Record without any URL is rejected", () => {
  const raw = makeRecord({ title: "No URL" });
  const validation = validateRawRecord(raw);
  assert.equal(validation.valid, false);
});

test("Phase 4 Ingestion: Non-object record is rejected", () => {
  const validation = validateRawRecord("not an object");
  assert.equal(validation.valid, false);
});

test("Phase 4 Ingestion: Skills are extracted from various fields", () => {
  const raw = makeRecord({
    title: "AI Dev",
    url: "https://example.com/opportunity",
    technologies: ["Python", "TensorFlow"],
  });
  const validation = validateRawRecord(raw);
  const normalized = normalizeRecord(validation.candidate!, context);
  assert.deepEqual(normalized.skills, ["Python", "TensorFlow"]);
});

test("Phase 4 Ingestion: Skills from string field are split correctly", () => {
  const raw = makeRecord({
    title: "AI Dev",
    url: "https://example.com/opportunity",
    technologies: "Python, TensorFlow, PyTorch",
  });
  const validation = validateRawRecord(raw);
  const normalized = normalizeRecord(validation.candidate!, context);
  assert.deepEqual(normalized.skills, ["Python", "TensorFlow", "PyTorch"]);
});

test("Phase 4 Ingestion: Mode inference from participation_mode", () => {
  const modes = [
    ["online", "remote"],
    ["virtual", "remote"],
    ["remote", "remote"],
    ["in-person", "in_person"],
    ["onsite", "in_person"],
    ["offline", "in_person"],
    ["hybrid", "hybrid"],
  ];
  for (const [input, expected] of modes) {
    const raw = makeRecord({ title: "Test", url: "https://example.com/opportunity", participation_mode: input });
    const validation = validateRawRecord(raw);
    const normalized = normalizeRecord(validation.candidate!, context);
    assert.equal(normalized.mode, expected, `Mode "${input}" should normalize to "${expected}"`);
  }
});

test("Phase 4 Ingestion: Dates are parsed from various field names", () => {
  const raw = makeRecord({
    title: "Test",
    url: "https://example.com/opportunity",
    start_date: "2026-09-01",
    end_date: "2026-09-30",
    deadline: "2026-08-25",
  });
  const validation = validateRawRecord(raw);
  const normalized = normalizeRecord(validation.candidate!, context);
  assert.ok(normalized.startDate instanceof Date);
  assert.ok(normalized.endDate instanceof Date);
  assert.ok(normalized.deadline instanceof Date);
});
