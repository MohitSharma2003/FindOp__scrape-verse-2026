import type { Request, Response } from "express";
import { parseSearchIntent, SearchIntentValidationError } from "./search-intent.service.js";

export function validateSearchIntent(req: Request, res: Response): void {
  try {
    const intent = parseSearchIntent(req.body);
    res.status(200).json({ success: true, data: { intent } });
  } catch (error: unknown) {
    if (error instanceof SearchIntentValidationError) {
      res.status(400).json({ success: false, error: { code: "INVALID_SEARCH_INTENT", message: error.message } });
      return;
    }
    throw error;
  }
}
