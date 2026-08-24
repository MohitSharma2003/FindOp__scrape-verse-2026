import { Router } from "express";

import {
  login,
  me,
  resendOtp,
  signup,
  verifyOtp,
} from "./auth.controller.js";
import { requireAuth } from "./auth.middleware.js";
import oauthRoutes from "./oauth.routes.js";

const router = Router();

router.post("/signup", signup);
router.post("/verify-otp", verifyOtp);
router.post("/resend-otp", resendOtp);
router.post("/login", login);
router.get("/me", requireAuth, me);

// Browser-redirect OAuth endpoints: /oauth/google, /oauth/github (+ /callback)
router.use("/oauth", oauthRoutes);

export default router;
