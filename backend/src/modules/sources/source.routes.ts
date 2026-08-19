import { Router } from "express";
import {
  getHealingHistoryController,
  startHealingController,
} from "../../healing/healing.controller.js";

import {
  createSourceController,
  getSource,
  getSourceHealthController,
  getSources,
  setSourceEnabledController,
  updateSourceController,
  scrapeSourceController,
} from "./source.controller.js";

const router = Router();

router.get("/", getSources);
router.post("/", createSourceController);
router.patch("/:id/enabled", setSourceEnabledController);
router.patch("/:id", updateSourceController);
router.post("/:id/scrape", scrapeSourceController);
router.post("/:id/heal", startHealingController);
router.get("/:id/health", getSourceHealthController);
router.get("/:id/healing", getHealingHistoryController);
router.get("/:id", getSource);

export default router;
