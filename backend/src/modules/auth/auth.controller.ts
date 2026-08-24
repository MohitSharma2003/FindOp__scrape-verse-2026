import type { Request, Response } from "express";

import { User } from "./user.model.js";
import {
  authService,
  type PublicUser,
} from "./auth.service.js";
import {
  loginSchema,
  signupSchema,
  verifyOtpSchema,
} from "./auth.schema.js";

const INVALID_BODY = {
  success: false,
  error: { code: "INVALID_AUTH_INPUT", message: "Invalid request payload" },
} as const;

/**
 * Step 1 of sign-up: store the account (unverified) and email a code.
 * The user only becomes a real account after verifyOtp succeeds.
 */
export async function signup(req: Request, res: Response): Promise<void> {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(INVALID_BODY);
    return;
  }

  const result = await authService.signup(parsed.data);

  res.status(201).json({
    success: true,
    data: {
      message: `Verification code sent to ${result.email}.`,
      email: result.email,
      expiresAt: result.expiresAt.toISOString(),
    },
  });
}

export async function verifyOtp(req: Request, res: Response): Promise<void> {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: {
        code: "INVALID_OTP_FORMAT",
        message:
          parsed.error.issues[0]?.message ?? "Enter the 6-digit code from your email",
      },
    });
    return;
  }

  const result = await authService.verifyOtp(parsed.data);

  res.status(200).json({ success: true, data: result });
}

export async function resendOtp(req: Request, res: Response): Promise<void> {
  const parsed = verifyOtpSchema.pick({ email: true }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(INVALID_BODY);
    return;
  }

  const result = await authService.resendOtp(parsed.data.email);

  res.status(200).json({
    success: true,
    data: {
      message: `Verification code re-sent to ${result.email}.`,
      email: result.email,
      expiresAt: result.expiresAt.toISOString(),
    },
  });
}

export async function login(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(INVALID_BODY);
    return;
  }

  const result = await authService.login(parsed.data);

  res.status(200).json({ success: true, data: result });
}

/** Who am I? Used by the frontend to restore a session on page load. */
export async function me(
  req: Request & { userId?: string },
  res: Response,
): Promise<void> {
  if (!req.userId) {
    res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Sign in to continue." },
    });
    return;
  }

  const user = await User.findById(req.userId).select("name email");
  if (!user) {
    res.status(404).json({
      success: false,
      error: { code: "USER_NOT_FOUND", message: "Account not found." },
    });
    return;
  }

  const publicUser: PublicUser = { name: user.name, email: user.email };
  res.status(200).json({ success: true, data: { user: publicUser } });
}
