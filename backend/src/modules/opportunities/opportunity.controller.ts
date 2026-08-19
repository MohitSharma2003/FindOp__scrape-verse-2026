import type { Request, Response } from "express";
import mongoose from "mongoose";

import { createOpportunitySchema } from "./opportunity.schema.js";
import {
  createOpportunityService,
  getAllOpportunities,
  getOpportunityById,
} from "./opportunity.service.js";

export async function getOpportunities(
  _req: Request,
  res: Response,
): Promise<void> {
  const opportunities = await getAllOpportunities();

  res.status(200).json({
    success: true,
    data: opportunities,
  });
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
