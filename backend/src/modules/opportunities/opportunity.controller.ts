import type { Request, Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";

import { createOpportunitySchema } from "./opportunity.schema.js";
import {
  OPPORTUNITY_PAGE_SIZE,
  createOpportunityService,
  getAllOpportunities,
  getOpportunityById,
  getOpportunityPage,
} from "./opportunity.service.js";

const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(100000).optional(),
});

export async function getOpportunities(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = paginationQuerySchema.safeParse(req.query);

  // Legacy behaviour: no pagination params -> full array (Saved/Deadlines rely on it).
  if (
    !parsed.success ||
    (!("limit" in parsed.data) && !("offset" in parsed.data))
  ) {
    const opportunities = await getAllOpportunities();
    res.status(200).json({ success: true, data: opportunities });
    return;
  }

  const limit = parsed.data.limit ?? OPPORTUNITY_PAGE_SIZE;
  const offset = parsed.data.offset ?? 0;
  const page = await getOpportunityPage(limit, offset);

  res.status(200).json({ success: true, data: page });
}

export async function createOpportunity(
  req: Request,
  res: Response,
): Promise<void> {
  const result = createOpportunitySchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      success: false,
      error: { code: "INVALID_OPPORTUNITY", message: "Invalid opportunity data" },
    });

    return;
  }

  const opportunity = await createOpportunityService(result.data);

  res.status(201).json({
    success: true,
    data: opportunity,
  });
}

export async function getOpportunity(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = req.params;

  if (!id || Array.isArray(id) || !mongoose.isValidObjectId(id)) {
    res.status(400).json({
      success: false,
      error: { code: "INVALID_OPPORTUNITY_ID", message: "Invalid opportunity ID" },
    });

    return;
  }

  const opportunity = await getOpportunityById(id);

  if (!opportunity) {
    res.status(404).json({
      success: false,
      error: { code: "OPPORTUNITY_NOT_FOUND", message: "Opportunity not found" },
    });

    return;
  }

  res.status(200).json({
    success: true,
    data: opportunity,
  });
}
