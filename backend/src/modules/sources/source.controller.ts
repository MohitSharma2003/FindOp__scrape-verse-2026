import type { Request, Response } from "express";
import mongoose from "mongoose";

import { createSourceSchema, sourceEnabledSchema, updateSourceSchema } from "./source.schema.js";
import {
  createSourceService,
  getAllSources,
  getSourceById,
  setSourceEnabledService,
  updateSourceService,
  DuplicateCollectorError,
  SourceRegistryValidationError,
} from "./source.service.js";
import {
  scrapeSource,
  SourceDisabledError,
  SourceNotFoundError,
  SourceScrapeFailedError,
  SourceScrapeInProgressError,
} from "./source-scrape.service.js";
import { getSourceHealth } from "./source-health.service.js";

export async function getSources(_req: Request, res: Response): Promise<void> {
  const sources = await getAllSources();

  res.status(200).json({ success: true, data: sources });
}

export async function getSource(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  if (!id || Array.isArray(id) || !mongoose.isValidObjectId(id)) {
    res.status(400).json({ success: false, error: { code: "INVALID_SOURCE_ID", message: "Invalid source ID" } });
    return;
  }

  const source = await getSourceById(id);

  if (!source) {
    res.status(404).json({ success: false, error: { code: "SOURCE_NOT_FOUND", message: "Source not found" } });
    return;
  }

  res.status(200).json({ success: true, data: source });
}

export async function getSourceHealthController(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = req.params;

  if (!id || Array.isArray(id) || !mongoose.isValidObjectId(id)) {
    res.status(400).json({ success: false, error: { code: "INVALID_SOURCE_ID", message: "Invalid source ID" } });
    return;
  }

  const health = await getSourceHealth(id);

  if (!health) {
    res.status(404).json({ success: false, error: { code: "SOURCE_NOT_FOUND", message: "Source not found" } });
    return;
  }

  res.status(200).json({ success: true, data: health });
}

export async function createSourceController(
  req: Request,
  res: Response,
): Promise<void> {
  const result = createSourceSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      success: false,
      error: { code: "INVALID_SOURCE", message: "Invalid source data" },
    });
    return;
  }

  try {
    const source = await createSourceService(result.data);
    res.status(201).json({ success: true, data: source });
  } catch (error: unknown) {
    if (error instanceof DuplicateCollectorError) {
      res.status(409).json({ success: false, error: { code: "DUPLICATE_COLLECTOR", message: error.message } });
      return;
    }
    throw error;
  }
}

export async function updateSourceController(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!id || Array.isArray(id) || !mongoose.isValidObjectId(id)) {
    res.status(400).json({ success: false, error: { code: "INVALID_SOURCE_ID", message: "Invalid source ID" } });
    return;
  }
  const result = updateSourceSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ success: false, error: { code: "INVALID_SOURCE", message: "Invalid source data" } });
    return;
  }
  try {
    const source = await updateSourceService(id, result.data);
    if (!source) {
      res.status(404).json({ success: false, error: { code: "SOURCE_NOT_FOUND", message: "Source not found" } });
      return;
    }
    res.status(200).json({ success: true, data: source });
  } catch (error: unknown) {
    if (error instanceof DuplicateCollectorError) {
      res.status(409).json({ success: false, error: { code: "DUPLICATE_COLLECTOR", message: error.message } });
      return;
    }
    if (error instanceof SourceRegistryValidationError) {
      res.status(400).json({ success: false, error: { code: "INVALID_SOURCE", message: error.message } });
      return;
    }
    throw error;
  }
}

export async function setSourceEnabledController(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!id || Array.isArray(id) || !mongoose.isValidObjectId(id)) {
    res.status(400).json({ success: false, error: { code: "INVALID_SOURCE_ID", message: "Invalid source ID" } });
    return;
  }
  const result = sourceEnabledSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ success: false, error: { code: "INVALID_ENABLED_STATE", message: "enabled must be a boolean" } });
    return;
  }
  try {
    const source = await setSourceEnabledService(id, result.data.enabled);
    if (!source) {
      res.status(404).json({ success: false, error: { code: "SOURCE_NOT_FOUND", message: "Source not found" } });
      return;
    }
    res.status(200).json({ success: true, data: source });
  } catch (error: unknown) {
    if (error instanceof SourceRegistryValidationError) {
      res.status(400).json({ success: false, error: { code: "INVALID_SOURCE", message: error.message } });
      return;
    }
    throw error;
  }
}

export async function scrapeSourceController(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = req.params;

  if (!id || Array.isArray(id) || !mongoose.isValidObjectId(id)) {
    res.status(400).json({ success: false, error: { code: "INVALID_SOURCE_ID", message: "Invalid source ID" } });
    return;
  }

  try {
    const result = await scrapeSource(id);
    res.status(200).json({ success: true, data: result });
  } catch (error: unknown) {
    if (error instanceof SourceNotFoundError) {
      res.status(404).json({ success: false, error: { code: "SOURCE_NOT_FOUND", message: error.message } });
      return;
    }

    if (error instanceof SourceDisabledError) {
      res.status(409).json({ success: false, error: { code: "SOURCE_NOT_SCRAPABLE", message: error.message } });
      return;
    }

    if (error instanceof SourceScrapeInProgressError) {
      res.status(409).json({ success: false, error: { code: "SCRAPE_IN_PROGRESS", message: error.message } });
      return;
    }

    if (error instanceof SourceScrapeFailedError) {
      res.status(502).json({
        success: false,
        error: { code: "SCRAPE_FAILED", message: error.message },
        data: { scrapeRun: error.scrapeRun, health: error.health },
      });
      return;
    }

    res.status(500).json({ success: false, error: { code: "SCRAPE_FAILED", message: "Scrape failed" } });
  }
}
