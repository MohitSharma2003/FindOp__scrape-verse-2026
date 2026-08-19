import { Router } from "express";
import { extract } from "./extraction.controller.js";

const router = Router();
router.post("/", extract);

export default router;
