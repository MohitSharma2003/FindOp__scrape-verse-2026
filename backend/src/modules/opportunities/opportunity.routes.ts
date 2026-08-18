import { Router } from "express";

import {
  createOpportunity,
  getOpportunity,
  getOpportunities,
} from "./opportunity.controller.js";

const router = Router();

router.get("/", getOpportunities);
router.post("/", createOpportunity);
router.get("/:id", getOpportunity);

export default router;