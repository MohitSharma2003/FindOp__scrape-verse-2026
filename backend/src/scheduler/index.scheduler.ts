import { env } from "../config/env.js";
import {
  findDueSources,
  setSourceNextRunAt,
} from "../modules/sources/source.repository.js";
import { scrapeSource } from "../modules/sources/source-scrape.service.js";

export interface SchedulerSourceRef {
  _id: { toString(): string } | string;
  scrapeFrequencyMinutes?: number | null;
}

export interface SchedulerDependencies {
  findDue(now: Date, limit: number): Promise<SchedulerSourceRef[]>;
  runScrape(sourceId: string): Promise<void>;
  onScheduled(sourceId: string, nextRunAt: Date): Promise<void>;
  now(): Date;
}

export function defaultSchedulerDependencies(): SchedulerDependencies {
  return {
    findDue: (now, limit) => findDueSources(now, limit),
    runScrape: async (sourceId) => {
      await scrapeSource(sourceId);
    },
    onScheduled: (sourceId, nextRunAt) => setSourceNextRunAt(sourceId, nextRunAt).then(() => undefined),
    now: () => new Date(),
  };
}

export class IndexScheduler {
  private readonly running = new Set<string>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private active = false;

  public constructor(private readonly dependencies: SchedulerDependencies) {}

  /** Sources currently being scraped; exposed so overlap rules are observable. */
  public get inFlight(): string[] {
    return [...this.running];
  }

  /**
   * One scheduling pass: launch due sources while free concurrency slots and
   * the per-source overlap guard allow. Returns the source ids launched.
   */
  public async tick(maxConcurrency = env.SCHEDULER_MAX_CONCURRENCY): Promise<string[]> {
    if (this.active) return [];
    this.active = true;
    try {
      const now = this.dependencies.now();
      const due = await this.dependencies.findDue(now, maxConcurrency * 3);
      const launched: string[] = [];

      for (const source of due) {
        // Every launched scrape stays in `running` until it completes, so this
        // single check enforces both the concurrency cap and slot reuse.
        if (this.running.size >= maxConcurrency) break;
        const id = typeof source._id === "string" ? source._id : source._id.toString();
        // Overlap guard: never start an identical scrape while one is active.
        if (this.running.has(id)) continue;

        const frequencyMinutes = Math.max(15, Number(source.scrapeFrequencyMinutes ?? 1440));
        this.running.add(id);
        launched.push(id);
        void this.execute(id, frequencyMinutes);
      }

      return launched;
    } finally {
      this.active = false;
    }
  }

  private async execute(sourceId: string, frequencyMinutes: number): Promise<void> {
    try {
      await this.dependencies.runScrape(sourceId);
    } catch (error) {
      // Failures are already recorded by the scrape pipeline (ScrapeRun +
      // health + healing); the scheduler only guarantees the next attempt.
      console.log("Scheduled scrape failed", {
        sourceId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      const completedAt = this.dependencies.now();
      const nextRunAt = new Date(completedAt.getTime() + frequencyMinutes * 60000);
      try {
        await this.dependencies.onScheduled(sourceId, nextRunAt);
      } catch (error) {
        console.log("Failed to persist next run time", {
          sourceId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      this.running.delete(sourceId);
    }
  }

  public start(): void {
    if (this.timer) return;
    void this.markInterruptedRuns();
    this.timer = setInterval(() => {
      void this.tick().catch(() => undefined);
    }, env.SCHEDULER_TICK_SECONDS * 1000);
    this.timer.unref?.();
    console.log("Opportunity index scheduler started");
  }

  /**
   * Runs left "running" by a crashed or restarted server would otherwise
   * block their sources forever via the DB overlap guard.
   */
  private async markInterruptedRuns(): Promise<void> {
    try {
      const { ScrapeRun } = await import("../modules/scrape-runs/scrape-run.model.js");
      const result = await ScrapeRun.updateMany(
        { status: "running" },
        { $set: { status: "failed", error: "Interrupted by server restart" } },
      );
      if (result.modifiedCount > 0) {
        console.log(`Scheduler startup sweep: marked ${result.modifiedCount} interrupted scrape run(s) as failed`);
      }
    } catch (error) {
      console.error("Scheduler startup sweep failed:", error instanceof Error ? error.message : error);
    }
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
