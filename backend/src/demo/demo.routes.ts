import { Router, type Request, type Response, type NextFunction } from "express";

import {
  DemoInvalidStateError,
  breakDemo,
  getDemoState,
  healDemo,
  listDemoScrapers,
  promoteDemoScraper,
  resetDemo,
  scrapeDemo,
  updateDemoConfig,
} from "./demo.service.js";

export const demoRoutes = Router();

/** Tiny in-memory sliding window — enough protection for a public demo. */
function rateLimit(options: { windowMs: number; max: number }) {
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((time) => now - time < options.windowMs);
    if (recent.length >= options.max) {
      res.status(429).json({
        success: false,
        error: { code: "RATE_LIMITED", message: "Too many requests — give the sandbox a moment." },
      });
      return;
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

const heavyActionLimit = rateLimit({ windowMs: 10 * 60_000, max: 8 });
const lightActionLimit = rateLimit({ windowMs: 60_000, max: 20 });

demoRoutes.get("/state", async (_req, res, next) => {
  try {
    res.status(200).json({ success: true, data: await getDemoState() });
  } catch (error) {
    next(error);
  }
});

demoRoutes.get("/scrapers", async (_req, res, next) => {
  try {
    res.status(200).json({ success: true, data: await listDemoScrapers() });
  } catch (error) {
    next(error);
  }
});

demoRoutes.post("/scrape", heavyActionLimit, async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as { url?: unknown; category?: unknown };
    const input = {
      ...(typeof body.url === "string" && body.url.trim() ? { url: body.url } : {}),
      ...(typeof body.category === "string" && body.category.trim() ? { category: body.category } : {}),
    };
    res.status(202).json({ success: true, data: await scrapeDemo(input) });
  } catch (error) {
    if (error instanceof DemoInvalidStateError) {
      res.status(409).json({
        success: false,
        error: { code: "DEMO_INVALID_STATE", message: error.message },
      });
      return;
    }
    next(error);
  }
});

demoRoutes.post("/break", lightActionLimit, async (_req, res, next) => {
  try {
    res.status(200).json({ success: true, data: await breakDemo() });
  } catch (error) {
    if (error instanceof DemoInvalidStateError) {
      res.status(409).json({
        success: false,
        error: { code: "DEMO_INVALID_STATE", message: error.message },
      });
      return;
    }
    next(error);
  }
});

demoRoutes.post("/heal", heavyActionLimit, async (_req, res, next) => {
  try {
    res.status(202).json({ success: true, data: await healDemo() });
  } catch (error) {
    if (error instanceof DemoInvalidStateError) {
      res.status(409).json({
        success: false,
        error: { code: "DEMO_NOT_BROKEN", message: error.message },
      });
      return;
    }
    next(error);
  }
});

demoRoutes.post("/promote", lightActionLimit, async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as { scraperId?: unknown };
    const result = await promoteDemoScraper(typeof body.scraperId === "string" ? body.scraperId : undefined);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof DemoInvalidStateError) {
      res.status(400).json({
        success: false,
        error: { code: "DEMO_PROMOTE_FAILED", message: error.message },
      });
      return;
    }
    next(error);
  }
});

demoRoutes.patch("/config", async (req, res, next) => {
  try {
    res.status(200).json({ success: true, data: await updateDemoConfig(req.body) });
  } catch (error) {
    if (error instanceof DemoInvalidStateError) {
      res.status(400).json({
        success: false,
        error: { code: "INVALID_DEMO_CONFIG", message: error.message },
      });
      return;
    }
    next(error);
  }
});

demoRoutes.post("/reset", lightActionLimit, async (_req, res, next) => {
  try {
    res.status(200).json({ success: true, data: await resetDemo() });
  } catch (error) {
    if (error instanceof DemoInvalidStateError) {
      res.status(409).json({
        success: false,
        error: { code: "DEMO_INVALID_STATE", message: error.message },
      });
      return;
    }
    next(error);
  }
});
