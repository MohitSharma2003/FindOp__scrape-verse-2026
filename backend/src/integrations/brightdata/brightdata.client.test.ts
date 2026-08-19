import assert from "node:assert/strict";
import test from "node:test";
import { BrightDataClient, BrightDataError } from "./brightdata.client.js";

const config = { collectorId: "collector-test", url: "https://example.com/opportunity" };

function response(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  } as Response;
}

function mockFetch(responses: Array<Response>): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    const next = responses.shift();
    if (!next) throw new Error("Unexpected fetch call");
    return next;
  };
  return () => { globalThis.fetch = original; };
}

test("repaired collection explicitly targets the development scraper version", async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  const responses = [response(200, { collection_id: "j_dev" }), response(200, [{ title: "Repaired" }])];
  globalThis.fetch = async (input) => {
    urls.push(String(input));
    const next = responses.shift();
    if (!next) throw new Error("Unexpected fetch call");
    return next;
  };
  try {
    await client().scrape({ ...config, version: "dev" });
    assert.match(urls[0] ?? "", /version=dev/);
  } finally {
    globalThis.fetch = original;
  }
});

function client(): BrightDataClient {
  return new BrightDataClient({ apiToken: "test-token", timeoutMs: 1000, pollIntervalMs: 1 });
}

test("HTTP 200 single-record object is normalized to an array", async () => {
  const restore = mockFetch([
    response(200, { collection_id: "j_single" }),
    response(200, { title: "AI Hackathon", application_url: config.url }),
  ]);

  try {
    const result = await client().scrape(config);
    assert.deepEqual(result.rawResult, [{ title: "AI Hackathon", application_url: config.url }]);
    assert.equal(result.recordsFound, 1);
  } finally {
    restore();
  }
});

test("HTTP 200 array is returned as the completed dataset", async () => {
  const records = [{ title: "One" }, { title: "Two" }];
  const restore = mockFetch([response(200, { collection_id: "j_array" }), response(200, records)]);

  try {
    const result = await client().scrape(config);
    assert.deepEqual(result.rawResult, records);
    assert.equal(result.recordsFound, 2);
  } finally {
    restore();
  }
});

test("HTTP 202 building response continues polling", async () => {
  const restore = mockFetch([
    response(200, { collection_id: "j_building" }),
    response(202, { status: "building", message: "Dataset is not ready yet" }),
    response(200, [{ title: "Ready" }]),
  ]);

  try {
    const result = await client().scrape(config);
    assert.deepEqual(result.rawResult, [{ title: "Ready" }]);
  } finally {
    restore();
  }
});

test("HTTP 202 collecting response continues polling", async () => {
  const restore = mockFetch([
    response(200, { collection_id: "j_collecting" }),
    response(202, { status: "collecting", message: "Collection is in progress" }),
    response(200, [{ title: "Ready" }]),
  ]);

  try {
    const result = await client().scrape(config);
    assert.deepEqual(result.rawResult, [{ title: "Ready" }]);
  } finally {
    restore();
  }
});

test("provider failure response fails immediately", async () => {
  const restore = mockFetch([
    response(200, { collection_id: "j_failed" }),
    response(202, { status: "failed", message: "Collector execution failed" }),
  ]);

  try {
    await assert.rejects(
      () => client().scrape(config),
      (error: unknown) => error instanceof BrightDataError
        && error.stage === "poll"
        && error.message === "Collector execution failed",
    );
  } finally {
    restore();
  }
});

test("malformed response is rejected instead of treated as a record", async () => {
  const restore = mockFetch([
    response(200, { collection_id: "j_malformed" }),
    response(200, { unexpected: "shape" }),
  ]);

  try {
    await assert.rejects(
      () => client().scrape(config),
      (error: unknown) => error instanceof BrightDataError
        && error.stage === "poll"
        && error.message === "Bright Data returned an unexpected dataset status",
    );
  } finally {
    restore();
  }
});

test("hanging dataset polling is aborted by the single scrape deadline", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls += 1;
    if (calls === 1) return response(200, { collection_id: "j_hanging" });
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    });
  };
  try {
    await assert.rejects(
      () => new BrightDataClient({ apiToken: "test-token", timeoutMs: 20, pollIntervalMs: 1 }).scrape(config),
      (error: unknown) => error instanceof BrightDataError && error.stage === "poll" && /timed out/i.test(error.message),
    );
  } finally {
    globalThis.fetch = original;
  }
});
