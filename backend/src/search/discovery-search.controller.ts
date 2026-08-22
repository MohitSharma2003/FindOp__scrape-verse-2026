import type { Request, Response } from "express";

import {
  DiscoverySearchValidationError,
  executeDiscoverySearch,
} from "./discovery-search.service.js";
import { SearchIntentValidationError } from "./search-intent.service.js";

export async function discoverySearch(req: Request, res: Response): Promise<void> {
  try {
    const response = await executeDiscoverySearch(req.body);
    res.status(200).json(response);
  } catch (error: unknown) {
    if (
      error instanceof DiscoverySearchValidationError
      || error instanceof SearchIntentValidationError
    ) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_DISCOVERY_REQUEST",
          message: "Invalid discovery search request",
          details: error.issues,
        },
      });
      return;
    }

    throw error;
  }
}
