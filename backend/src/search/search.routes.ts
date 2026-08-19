import { Router } from "express";
import { validateSearchIntent } from "./search-intent.controller.js";
import { search } from "./search.controller.js";

const router = Router();
router.post("/", search);
router.post("/intent", validateSearchIntent);

export default router;
