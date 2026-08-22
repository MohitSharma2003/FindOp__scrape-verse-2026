import assert from "node:assert/strict";
import test from "node:test";
import { applyCategoryFallback, assessOpportunityUrlQuality, classifyOpportunityCategory } from "./category-classifier.js";
import { normalizeRecord } from "./normalizer.js";
import { validateRawRecord } from "./validator.js";

const url = "https://example.com/opportunities/example-2026";

test("strong title signals override a conflicting provider category", () => {
  assert.equal(classifyOpportunityCategory({ title: "Global Student Fellowship", providerType: "hackathon", url }), "fellowship");
  assert.equal(classifyOpportunityCategory({ title: "AI Internship Program", providerType: "hackathon", url }), "internship");
});

test("deterministic classifier recognizes supported opportunity types", () => {
  assert.equal(classifyOpportunityCategory({ title: "AI Hackathon 2026", providerType: "hackathon", url }), "hackathon");
  assert.equal(classifyOpportunityCategory({ title: "Developer Grant 2026", url }), "grant");
  assert.equal(classifyOpportunityCategory({ title: "Student Scholarship", url }), "scholarship");
  assert.equal(classifyOpportunityCategory({ title: "Developer Competition", url }), "competition");
  assert.equal(classifyOpportunityCategory({ title: "Open Source Developer Program", url }), "program");
});

test("normalizer uses title and URL signals instead of provider category precedence", () => {
  const normalized = normalizeRecord({
    record: { title: "University of Tokyo Fellowship", category: "hackathon", description: "A funded fellowship", url },
    opportunityUrl: url,
  }, { sourceId: "507f1f77bcf86cd799439011", sourceUrl: "example.com" });
  assert.equal(normalized.category, "fellowship");
});

test("generic listing and blocked URLs are rejected by URL quality checks", () => {
  assert.equal(assessOpportunityUrlQuality("https://devpost.com/c/artificial-intelligence", "AI Hackathons").accepted, false);
  assert.equal(assessOpportunityUrlQuality("https://unstop.com/hackathons", "Hackathons").accepted, false);
  assert.equal(assessOpportunityUrlQuality("https://example.com", "Read more").accepted, false);
  assert.equal(assessOpportunityUrlQuality("https://devfolio.co/hackathons/individual-event-2026", "AI Hackathon 2026").accepted, true);
});

test("validator rejects weak records but accepts a specific opportunity URL", () => {
  assert.equal(validateRawRecord({ title: "Read more", url: "https://example.com" }).valid, false);
  assert.equal(validateRawRecord({ title: "AI Hackathon 2026", category: "hackathon", description: "Build with AI", url }).valid, true);
});

test("placeholder titles are rejected even when other fields exist", () => {
  for (const title of ["Website", "Read more", "Translate this page", "Apply now", "Untitled"]) {
    assert.equal(assessOpportunityUrlQuality("https://example.com/opportunity/ai-2026", title).reason, "junk_title");
    assert.equal(validateRawRecord({ title, url: "https://example.com/opportunity/ai-2026", description: "Details" }).valid, false);
  }
  assert.equal(assessOpportunityUrlQuality("https://southfellowship.org/students", "Website").accepted, false);
});

test("deep listing pages and SERP artifacts never become opportunity URLs", () => {
  assert.equal(assessOpportunityUrlQuality("https://internshala.com/internships/work-from-home-internships", "Work from home internships").accepted, false);
  assert.equal(assessOpportunityUrlQuality("https://www.scholarshipamerica.org/students/browse-scholarships", "Browse Scholarships").accepted, false);
  assert.equal(assessOpportunityUrlQuality("https://translate.google.com/translate?u=https://example.com/fellowship", "Global Fellowship").accepted, false);
  assert.equal(assessOpportunityUrlQuality("https://www.google.com/url?q=https://example.com/hackathon", "AI Hackathon").accepted, false);
  assert.equal(assessOpportunityUrlQuality("https://scholars4dev.com/category/level-of-study/fellowship", "Fellowships by level").accepted, false);
  assert.equal(assessOpportunityUrlQuality("https://unstop.com/internship", "Internships on Unstop").accepted, false);
});

test("source taxonomy fills the vacuum only when the record itself has no signal", () => {
  assert.equal(applyCategoryFallback("other", "hackathon"), "hackathon");
  assert.equal(applyCategoryFallback("fellowship", "hackathon"), "fellowship");
  assert.equal(applyCategoryFallback("other", "not-a-type"), "other");
  assert.equal(applyCategoryFallback("other", undefined), "other");
});

test("specific deep URLs and provider-detail homepages stay accepted", () => {
  assert.equal(assessOpportunityUrlQuality("https://fusionix-1.devfolio.co/", "FusioniX2026").accepted, true);
  assert.equal(assessOpportunityUrlQuality("https://example.com/hackathon", "AI Hackathon").accepted, true);
  assert.equal(assessOpportunityUrlQuality("https://hack2skill.com/event/india_runs", "India Runs").accepted, true);
});
