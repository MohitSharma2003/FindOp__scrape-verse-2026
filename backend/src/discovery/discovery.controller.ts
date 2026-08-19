import type { Request, Response } from "express";
import { BrightDataError } from "../integrations/brightdata/brightdata.client.js";
import { SearchIntentValidationError } from "../search/search-intent.service.js";
import { discoverCandidates } from "./discovery.service.js";

export async function discover(req: Request, res: Response): Promise<void> {
  try {
    const result = await discoverCandidates(req.body?.intent);
    res.status(200).json({ success: true, data: result });
  } catch (error: unknown) {
    if (error instanceof SearchIntentValidationError) {
      res.status(400).json({ success: false, error: { code: "INVALID_SEARCH_INTENT", message: error.message } });
      return;
    }
    if (error instanceof BrightDataError) {
      console.error("Bright Data discovery failed", {
        statusCode: error.statusCode,
        message: error.message,
        providerMessage: error.providerMessage,
      });
    } else {
      console.error("Discovery failed", {
        message: error instanceof Error ? error.message : "Unknown discovery error",
      });
    }
    res.status(502).json({ success: false, error: { code: "DISCOVERY_FAILED", message: "Web discovery failed" } });
  }
}
