import assert from "node:assert/strict";
import test from "node:test";
import { resolveSource, type ResolvedSource, type SourceResolverDependencies } from "./source-resolver.service.js";
import type { CandidateUrl } from "../../discovery/discovery.types.js";

function candidate(url: string, title = "AI Hackathon") : CandidateUrl {
  return { url, title, description: "Apply to this hackathon challenge", source: "web_search", searchQuery: "AI hackathon", rank: 1, discoveryMetadata: { domain: new URL(url).hostname } };
}

function dependencies(existing: ResolvedSource | null = null) {
  let created = 0;
  let provisioned = 0;
  let stored: ResolvedSource | null = existing;
  const deps: SourceResolverDependencies = {
    findByDomain: async () => existing,
    findByUrl: async () => null,
    createSource: async (input) => {
      created += 1;
      stored = { id: "new-source", name: input.name, url: input.url, collectorId: input.collectorId, scraperVersion: input.scraperVersion };
      return { _id: { toString: () => "new-source" }, ...input } as never;
    },
    updateSource: async (_id, input) => {
      stored = { id: "new-source", name: stored?.name ?? "AI Hackathon", url: stored?.url ?? "https://example.org/hackathon", collectorId: input.collectorId ?? stored?.collectorId, scraperVersion: input.scraperVersion ?? stored?.scraperVersion };
      return { _id: { toString: () => "new-source" }, ...stored } as never;
    },
    markProvisioningFailed: async () => null,
    provisioner: {
      createCollector: async () => {
        provisioned += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { collectorId: `collector-${provisioned}`, ready: true };
      },
    },
  };
  return { deps, counts: () => ({ created, provisioned }) };
}

test("reuses an existing source and collector for the same domain", async () => {
  const source = { id: "existing", name: "Devpost", url: "https://devpost.com", collectorId: "c1" };
  const fixture = dependencies(source);
  const result = await resolveSource(candidate("https://devpost.com/hackathons"), fixture.deps);
  assert.equal(result.status, "reused");
  assert.equal(result.source.collectorId, "c1");
  assert.deepEqual(fixture.counts(), { created: 0, provisioned: 0 });
});

test("onboards a useful unknown domain once and persists its collector", async () => {
  const fixture = dependencies();
  const [first, second] = await Promise.all([
    resolveSource(candidate("https://example.org/hackathon"), fixture.deps),
    resolveSource(candidate("https://www.example.org/hackathon/details"), fixture.deps),
  ]);
  assert.equal(first.status, "onboarded");
  assert.equal(second.status, "onboarded");
  assert.equal(first.source.collectorId, "collector-1");
  assert.deepEqual(fixture.counts(), { created: 1, provisioned: 1 });
});

test("skips unsupported candidates without provisioning", async () => {
  const fixture = dependencies();
  const result = await resolveSource(candidate("https://accounts.google.com/ServiceLogin", "Login"), fixture.deps);
  assert.deepEqual(result, { status: "skipped", reason: "unsupported_or_not_useful" });
  assert.deepEqual(fixture.counts(), { created: 0, provisioned: 0 });
});
