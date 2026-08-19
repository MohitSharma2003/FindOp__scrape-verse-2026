import assert from "node:assert/strict";
import test from "node:test";
import { BrightDataHealingClient } from "./brightdata.healing.client.js";

function response(status: number, payload: unknown, contentType = "application/json"): Response {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": contentType }),
    text: async () => body,
  } as Response;
}

test("self-healing uses the documented trigger body and polls progress", async () => {
  const original = globalThis.fetch;
  const requests: Array<{ method?: string; body?: string }> = [];
  const responses = [response(200, { status: "started" }), response(200, { status: "completed", template: { code: "repaired" } })];
  globalThis.fetch = async (_input, init) => {
    requests.push({ method: init?.method, body: typeof init?.body === "string" ? init.body : undefined });
    const next = responses.shift();
    if (!next) throw new Error("Unexpected fetch call");
    return next;
  };

  try {
    const result = await new BrightDataHealingClient({ apiToken: "test-token", timeoutMs: 1000, pollIntervalMs: 1 }).heal(
      "collector-test",
      "repair missing fields",
      [{ url: "https://example.com/opportunity" }],
    );
    assert.equal(result.success, true);
    assert.equal(requests[0]?.method, "POST");
    assert.deepEqual(JSON.parse(requests[0]?.body ?? "{}"), {
      prompt: "repair missing fields",
      custom_input: [{ url: "https://example.com/opportunity" }],
    });
    assert.equal(requests[1]?.method, "GET");
    assert.equal(result.repairedScraper?.version, "dev");
    assert.equal(result.repairedScraper?.template.code, "repaired");
  } finally {
    globalThis.fetch = original;
  }
});

test("hanging self-healing progress is aborted by the operation deadline", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls += 1;
    if (calls === 1) return response(200, { status: "started" });
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
      () => new BrightDataHealingClient({ apiToken: "test-token", timeoutMs: 20, pollIntervalMs: 1 }).heal("collector-test", "repair"),
      /timed out/i,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("409 active refactor reuses collector-level progress without a second trigger", async () => {
  const original = globalThis.fetch;
  const methods: string[] = [];
  const responses = [
    response(409, "Another refactor job is still in progress", "text/html"),
    response(200, { status: "collecting" }),
    response(200, { status: "completed", template: { code: "existing-repair" } }),
  ];
  globalThis.fetch = async (_input, init) => {
    methods.push(init?.method ?? "GET");
    const next = responses.shift();
    if (!next) throw new Error("Unexpected fetch call");
    return next;
  };
  try {
    const result = await new BrightDataHealingClient({ apiToken: "test-token", timeoutMs: 1000, pollIntervalMs: 1 }).heal("collector-test", "repair");
    assert.equal(result.success, true);
    assert.equal(result.startedFrom, "already_in_progress");
    assert.deepEqual(methods, ["POST", "GET", "GET"]);
    assert.equal(result.repairedScraper?.template.code, "existing-repair");
  } finally {
    globalThis.fetch = original;
  }
});

test("JSON error response exposes bounded provider diagnostics", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => response(400, { error: "invalid request" });
  try {
    await assert.rejects(
      () => new BrightDataHealingClient({ apiToken: "test-token", timeoutMs: 1000, pollIntervalMs: 1 }).heal("collector-test", "repair"),
      (error: unknown) => error instanceof Error && /HTTP 400.*application\/json.*invalid request/i.test(error.message),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("text/plain error response is controlled", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => response(400, "Another request is already running", "text/plain");
  try {
    await assert.rejects(
      () => new BrightDataHealingClient({ apiToken: "test-token", timeoutMs: 1000, pollIntervalMs: 1 }).heal("collector-test", "repair"),
      (error: unknown) => error instanceof Error && /HTTP 400.*text\/plain.*Another request/i.test(error.message) && !/JSON\.parse|Unexpected token/i.test(error.message),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("HTML response is controlled without JSON parsing", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => response(200, "<html>temporary failure</html>", "text/html");
  try {
    await assert.rejects(
      () => new BrightDataHealingClient({ apiToken: "test-token", timeoutMs: 1000, pollIntervalMs: 1 }).heal("collector-test", "repair"),
      /non-JSON response.*text\/html.*temporary failure/i,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("empty response is controlled", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => response(200, "", "application/json");
  try {
    await assert.rejects(
      () => new BrightDataHealingClient({ apiToken: "test-token", timeoutMs: 1000, pollIntervalMs: 1 }).heal("collector-test", "repair"),
      /empty response.*<empty>/i,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("invalid JSON with HTTP 200 is controlled", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => response(200, "not-json", "application/json");
  try {
    await assert.rejects(
      () => new BrightDataHealingClient({ apiToken: "test-token", timeoutMs: 1000, pollIntervalMs: 1 }).heal("collector-test", "repair"),
      (error: unknown) => error instanceof Error && /invalid JSON.*HTTP 200/i.test(error.message) && !/Unexpected token/i.test(error.message),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("4xx and 5xx text responses retain status and content type", async () => {
  const original = globalThis.fetch;
  for (const status of [422, 503]) {
    globalThis.fetch = async () => response(status, `provider failure ${status}`, "text/plain");
    try {
      await assert.rejects(
        () => new BrightDataHealingClient({ apiToken: "test-token", timeoutMs: 1000, pollIntervalMs: 1 }).heal("collector-test", "repair"),
        new RegExp(`HTTP ${status}.*text/plain.*provider failure ${status}`),
      );
    } finally {
      globalThis.fetch = original;
    }
  }
});

test("provider response bodies are truncated", async () => {
  const original = globalThis.fetch;
  const body = "x".repeat(1000);
  globalThis.fetch = async () => response(500, body, "text/plain");
  try {
    await assert.rejects(
      () => new BrightDataHealingClient({ apiToken: "test-token", timeoutMs: 1000, pollIntervalMs: 1 }).heal("collector-test", "repair"),
      (error: unknown) => error instanceof Error && error.message.length < 700 && error.message.includes("..."),
    );
  } finally {
    globalThis.fetch = original;
  }
});
