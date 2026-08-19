import type { Request, Response } from "express";
import mongoose from "mongoose";

import { createScrapeRunSchema } from "./scrape-run.schema.js";
import {
  createScrapeRunService,
  getAllScrapeRuns,
  getScrapeRunById,
} from "./scrape-run.service.js";

export async function getScrapeRuns(
  _req: Request,
  res: Response,
): Promise<void> {
  const scrapeRuns = await getAllScrapeRuns();

  res.status(200).json({ success: true, data: scrapeRuns });
}

export async function getScrapeRun(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = req.params;

  if (!id || Array.isArray(id) || !mongoose.isValidObjectId(id)) {
    res.status(400).json({ success: false, error: { code: "INVALID_SCRAPE_RUN_ID", message: "Invalid scrape run ID" } });
    return;
  }

  const scrapeRun = await getScrapeRunById(id);

  if (!scrapeRun) {
    res.status(404).json({ success: false, error: { code: "SCRAPE_RUN_NOT_FOUND", message: "Scrape run not found" } });
    return;
  }

  res.status(200).json({ success: true, data: scrapeRun });
}

export async function createScrapeRunController(
  req: Request,
  res: Response,
): Promise<void> {
  const result = createScrapeRunSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      success: false,
      error: { code: "INVALID_SCRAPE_RUN", message: "Invalid scrape run data" },
    });
    return;
  }

  const scrapeRun = await createScrapeRunService(result.data);

  if (!scrapeRun) {
    res.status(404).json({ success: false, error: { code: "SOURCE_NOT_FOUND", message: "Source not found" } });
    return;
  }

  res.status(201).json({ success: true, data: scrapeRun });
}
