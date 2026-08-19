import { Router } from "express";

import {
  createScrapeRunController,
  getScrapeRun,
  getScrapeRuns,
} from "./scrape-run.controller.js";

const router = Router();

router.get("/", getScrapeRuns);
router.post("/", createScrapeRunController);
router.get("/:id", getScrapeRun);

export default router;
