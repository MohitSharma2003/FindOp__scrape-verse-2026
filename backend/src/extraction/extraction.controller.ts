import type { Request, Response } from "express";
import { ExtractionValidationError, extractOpportunities } from "./extraction.service.js";

export async function extract(req: Request, res: Response): Promise<void> {
  try {
    const result = await extractOpportunities(req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error: unknown) {
    if (error instanceof ExtractionValidationError) {
      res.status(400).json({ success: false, error: { code: "INVALID_EXTRACTION_REQUEST", message: error.message } });
      return;
    }
    res.status(500).json({ success: false, error: { code: "EXTRACTION_FAILED", message: "Extraction failed" } });
  }
}
