import { Router } from "express";
import { discover } from "./discovery.controller.js";
import { discoverySearch } from "../search/discovery-search.controller.js";

const router = Router();
router.post("/", discover);
router.post("/search", discoverySearch);

export default router;
