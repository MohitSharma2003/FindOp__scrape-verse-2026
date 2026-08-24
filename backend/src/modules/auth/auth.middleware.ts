import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../middleware/error-handler.js";
import { verifyAuthToken } from "./auth.utils.js";

/** Request enriched by `requireAuth` once a Bearer token checks out. */
export interface AuthedRequest extends Request {
  userId?: string;
  userEmail?: string;
}

/**
 * Express guard for routes that need a signed-in user. Reads the standard
 * Authorization header, validates the JWT and copies the identity onto the
 * request. Sends a JSON error itself when the token is missing/invalid.
 */
export function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Sign in to continue." },
    });
    return;
  }

  const payload = verifyAuthToken(token);
  if (!payload) {
    res.status(401).json({
      success: false,
      error: { code: "INVALID_TOKEN", message: "Session expired. Sign in again." },
    });
    return;
  }

  req.userId = payload.sub;
  req.userEmail = payload.email;
  next();
}
