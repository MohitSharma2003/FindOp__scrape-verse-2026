import type { Request, Response } from "express";
import mongoose from "mongoose";

import {
  getHealingHistory,
  healSource,
  HealingNotEligibleError,
  HealingAlreadyInProgressError,
  HealingAlreadyRecoveredError,
  HealingOwnershipError,
  HealingScrapeRunNotFoundError,
  HealingSourceNotFoundError,
  startHealing,
} from "./healing.service.js";
import { startHealingSchema } from "./healing.schema.js";

export async function startHealingController(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = req.params;

  if (!id || Array.isArray(id) || !mongoose.isValidObjectId(id)) {
    res.status(400).json({ success: false, error: { code: "INVALID_SOURCE_ID", message: "Invalid source ID" } });
    return;
  }

  const input = startHealingSchema.safeParse(req.body ?? {});

  if (!input.success) {
    res.status(400).json({
      success: false,
      error: { code: "INVALID_HEALING_DATA", message: "Invalid healing data" },
    });
    return;
  }

  try {
    const result = input.data.scrapeRunId
      ? await startHealing(id, input.data.scrapeRunId)
      : await healSource(id);
    res.status(200).json({ success: true, data: result });
  } catch (error: unknown) {
    if (error instanceof HealingSourceNotFoundError ||
        error instanceof HealingScrapeRunNotFoundError) {
      res.status(404).json({ success: false, error: error.message });
      return;
    }

    if (error instanceof HealingOwnershipError ||
        error instanceof HealingNotEligibleError ||
        error instanceof HealingAlreadyInProgressError ||
        error instanceof HealingAlreadyRecoveredError) {
      res.status(409).json({ success: false, error: error.message });
      return;
    }

    res.status(500).json({ success: false, error: "Healing failed" });
  }
}

export async function getHealingHistoryController(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = req.params;

  if (!id || Array.isArray(id) || !mongoose.isValidObjectId(id)) {
    res.status(400).json({ success: false, error: { code: "INVALID_SOURCE_ID", message: "Invalid source ID" } });
    return;
  }

  try {
    const history = await getHealingHistory(id);
    res.status(200).json({ success: true, data: history });
  } catch (error: unknown) {
    if (error instanceof HealingSourceNotFoundError) {
      res.status(404).json({ success: false, error: { code: "SOURCE_NOT_FOUND", message: error.message } });
      return;
    }
    res.status(500).json({ success: false, error: { code: "HEALING_HISTORY_FAILED", message: "Could not load healing history" } });
  }
}
