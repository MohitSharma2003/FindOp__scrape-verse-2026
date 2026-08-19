import { Router } from "express";
import { discover } from "./discovery.controller.js";

const router = Router();
router.post("/", discover);

export default router;
