import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { IndexScheduler, type SchedulerDependencies, type SchedulerSourceRef } from "./index.scheduler.js";

function fakeSource(id: string, frequencyMinutes = 1440): SchedulerSourceRef {
  return { _id: id, scrapeFrequencyMinutes: frequencyMinutes };
}

function harness(dueSources: SchedulerSourceRef[], options: { scrapeDurationMs?: number; failIds?: string[] } = {}) {
  const launched: string[] = [];
  const scheduled: { sourceId: string; nextRunAt: Date }[] = [];
  let clock = new Date("2026-08-22T06:00:00Z");
  let completed = 0;

  const deps: SchedulerDependencies = {
    findDue: async () => dueSources,
    runScrape: async (sourceId) => {
      launched.push(sourceId);
      if (options.failIds?.includes(sourceId)) throw new Error("scrape exploded");
      clock = new Date(clock.getTime() + (options.scrapeDurationMs ?? 1000));
      completed += 1;
    },
    onScheduled: async (sourceId, nextRunAt) => {
      scheduled.push({ sourceId, nextRunAt });
      clock = nextRunAt;
    },
    now: () => new Date(clock),
  };

  return { scheduler: new IndexScheduler(deps), launched, scheduled, getCompleted: () => completed };
}

describe("index scheduler tick", () => {
  test("launches every due source once", async () => {
    const h = harness([fakeSource("a"), fakeSource("b"), fakeSource("c")]);
    const launched = await h.scheduler.tick(5);
    assert.deepEqual(launched.sort(), ["a", "b", "c"]);
    await waitFor(() => h.getCompleted() === 3);
  });

  test("never launches more than maxConcurrency scrapes in one pass", async () => {
    const h = harness([fakeSource("a"), fakeSource("b"), fakeSource("c"), fakeSource("d")]);
    const launched = await h.scheduler.tick(2);
    assert.equal(launched.length, 2);
    await waitFor(() => h.getCompleted() === 2);
  });

  test("overlap guard skips a source that is already running", async () => {
    let releaseScrape: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { releaseScrape = resolve; });
    const deps: SchedulerDependencies = {
      findDue: async () => [fakeSource("slow")],
      runScrape: () => gate,
      onScheduled: async () => undefined,
      now: () => new Date(),
    };
    const scheduler = new IndexScheduler(deps);

    const firstPass = await scheduler.tick(5);
    assert.deepEqual(firstPass, ["slow"]);
    // While the first scrape is still in flight the source must not relaunch.
    const secondPass = await scheduler.tick(5);
    assert.deepEqual(secondPass, []);
    releaseScrape();
    await waitFor(() => scheduler.inFlight.length === 0);
    assert.deepEqual(scheduler.inFlight, []);
  });

  test("schedules the next run from completion time using the source frequency", async () => {
    const h = harness([fakeSource("a", 180)], { scrapeDurationMs: 10 * 60000 });
    await h.scheduler.tick(1);
    await waitFor(() => h.scheduled.length === 1);

    const entry = h.scheduled[0]!;
    assert.equal(entry.sourceId, "a");
    // started 06:00, scrape "took" 10 minutes -> next run 06:10 + 180 min
    assert.equal(entry.nextRunAt.toISOString(), new Date("2026-08-22T09:10:00Z").toISOString());
  });

  test("a failed scrape still reschedules and clears the overlap guard", async () => {
    const h = harness([fakeSource("bad", 60)], { failIds: ["bad"] });
    await h.scheduler.tick(1);
    await waitFor(() => h.scheduled.length === 1);

    assert.equal(h.scheduled[0]!.sourceId, "bad");
    await waitFor(() => h.scheduler.inFlight.length === 0);
    // Guard cleared -> a following pass may try again.
    const again = await h.scheduler.tick(1);
    assert.deepEqual(again, ["bad"]);
  });

  test("frequency below 15 minutes is clamped", async () => {
    const h = harness([{ _id: "tiny", scrapeFrequencyMinutes: 5 }]);
    await h.scheduler.tick(1);
    await waitFor(() => h.scheduled.length === 1);
    const deltaMinutes = (h.scheduled[0]!.nextRunAt.getTime() - new Date("2026-08-22T06:00:01Z").getTime()) / 60000;
    assert.ok(deltaMinutes >= 15 - 1, `expected >= ~15 min gap, got ${deltaMinutes}`);
  });
});

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("condition not met before timeout");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
