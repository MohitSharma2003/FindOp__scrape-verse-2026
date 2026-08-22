import { Router } from "express";
import { Opportunity } from "../opportunities/opportunity.model.js";
import { Source } from "../sources/source.model.js";
import { ScrapeRun } from "../scrape-runs/scrape-run.model.js";

export interface IndexStatsDependencies {
  countOpportunities(): Promise<number>;
  countByCategory(): Promise<{ category: string; count: number }[]>;
  lastUpdatedAt(): Promise<Date | null>;
  sourceStats(): Promise<{ total: number; enabled: number; fresh: number; failed: number }>;
  runStats(): Promise<{ lastSuccessfulRunAt: Date | null; runningNow: number }>;
}

function defaultDependencies(): IndexStatsDependencies {
  const FRESH_WINDOW_MS = 24 * 60 * 60 * 1000;
  return {
    countOpportunities: () => Opportunity.countDocuments(),
    countByCategory: async () =>
      Opportunity.aggregate<{ _id: string; count: number }>([
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).then((rows: Array<{ _id: string; count: number }>) =>
        rows.map((row) => ({ category: row._id, count: row.count })),
      ),
    lastUpdatedAt: async () => {
      const latest = await Opportunity.findOne().sort({ updatedAt: -1 }).select("updatedAt").lean();
      return latest?.updatedAt ? new Date(latest.updatedAt) : null;
    },
    sourceStats: async () => {
      const [total, enabled, fresh, failed] = await Promise.all([
        Source.countDocuments(),
        Source.countDocuments({ enabled: true }),
        Source.countDocuments({ lastSuccessfulRunAt: { $gte: new Date(Date.now() - FRESH_WINDOW_MS) } }),
        Source.countDocuments({ healthStatus: "unhealthy" }),
      ]);
      return { total, enabled, fresh, failed };
    },
    runStats: async () => {
      const [latestSuccess, runningNow] = await Promise.all([
        ScrapeRun.findOne({ status: "success" }).sort({ startedAt: -1 }).select("startedAt").lean(),
        ScrapeRun.countDocuments({ status: "running" }),
      ]);
      return {
        lastSuccessfulRunAt: latestSuccess?.startedAt ? new Date(latestSuccess.startedAt) : null,
        runningNow,
      };
    },
  };
}

export async function getIndexStats(dependencies = defaultDependencies()) {
  const [totalOpportunities, categories, updatedAt, sources, runs] = await Promise.all([
    dependencies.countOpportunities(),
    dependencies.countByCategory(),
    dependencies.lastUpdatedAt(),
    dependencies.sourceStats(),
    dependencies.runStats(),
  ]);

  const categoryCounts: Record<string, number> = {};
  for (const row of categories) categoryCounts[row.category] = row.count;

  return {
    totalOpportunities,
    categories: categoryCounts,
    sources: sources.total,
    enabledSources: sources.enabled,
    freshSources: sources.fresh,
    failedSources: sources.failed,
    lastUpdatedAt: updatedAt ? updatedAt.toISOString() : null,
    lastSuccessfulRunAt: runs.lastSuccessfulRunAt ? runs.lastSuccessfulRunAt.toISOString() : null,
    scrapesRunningNow: runs.runningNow,
  };
}

export type IndexStats = Awaited<ReturnType<typeof getIndexStats>>;

export const indexRoutes = Router();

indexRoutes.get("/stats", async (_req, res) => {
  const stats = await getIndexStats();
  res.status(200).json({ success: true, data: stats });
});
