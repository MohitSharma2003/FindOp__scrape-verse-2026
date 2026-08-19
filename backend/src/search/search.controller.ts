import type { NextFunction, Request, Response } from "express";
import { BrightDataError } from "../integrations/brightdata/brightdata.client.js";
import { AppError } from "../middleware/error-handler.js";
import { SearchIntentValidationError } from "./search-intent.service.js";
import { executeSearch, SearchRequestTimeoutError, SearchRequestValidationError } from "./search.service.js";

export async function search(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await executeSearch(req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error: unknown) {
    if (error instanceof SearchRequestValidationError || error instanceof SearchIntentValidationError) {
      next(new AppError(400, "INVALID_SEARCH_INTENT", error.message));
      return;
    }
    if (error instanceof SearchRequestTimeoutError) {
      next(new AppError(504, "SEARCH_TIMEOUT", "Search request timed out"));
      return;
    }
    if (error instanceof BrightDataError) {
      next(new AppError(502, "DISCOVERY_FAILED", "Web discovery failed"));
      return;
    }
    if (error instanceof AppError) {
      next(error);
      return;
    }
    console.error("Search execution failed", error instanceof Error ? error.message : error);
    next(new AppError(500, "SEARCH_EXECUTION_FAILED", "Search execution failed"));
  }
}
