import assert from "node:assert/strict";
import test from "node:test";
import { BrightDataCollectorProvisioner } from "./brightdata.collector.client.js";

test("collector provisioning creates, generates, and polls a dedicated canonical scraper", async () => {
  const requests: Array<{ url: string; body?: string }> = [];
  let progressCalls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, body: typeof init?.body === "string" ? init.body : undefined });
    if (url.endsWith("/dca/collector")) return new Response(JSON.stringify({ id: "c_newsource" }), { status: 200 });
    if (url.endsWith("/automate_template")) return new Response(JSON.stringify({ id: "job_1", queued: true }), { status: 200 });
    progressCalls += 1;
    return new Response(JSON.stringify(progressCalls === 1 ? { status: "building" } : { status: "done" }), { status: 200 });
  };
  const result = await new BrightDataCollectorProvisioner({ apiToken: "test-token", timeoutMs: 1000, pollIntervalMs: 1, deliveryWebhook: "https://example.test/webhook", fetcher }).createCollector({ sourceUrl: "https://example.org/hackathon", sourceDomain: "example.org", name: "Example Hackathon" });
  assert.deepEqual(result, { collectorId: "c_newsource", scraperVersion: "dev", ready: false });
  assert.equal(requests.length, 4);
  const generation = JSON.parse(requests[1]?.body ?? "{}");
  assert.deepEqual(generation.urls, ["https://example.org/hackathon"]);
  assert.match(generation.description, /opportunity_type/);
  assert.match(generation.description, /application_deadline/);
});

test("collector provisioning rejects malformed creation responses", async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({ active: false }), { status: 200 });
  await assert.rejects(
    () => new BrightDataCollectorProvisioner({ apiToken: "test-token", timeoutMs: 1000, pollIntervalMs: 1, deliveryWebhook: "https://example.test/webhook", fetcher }).createCollector({ sourceUrl: "https://example.org/hackathon", sourceDomain: "example.org", name: "Example" }),
    /no collectorId/,
  );
});
