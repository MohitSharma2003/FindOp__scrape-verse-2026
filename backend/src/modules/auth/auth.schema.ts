import { z } from "zod";

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254);

export const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: emailField,
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1).max(128),
});

export const verifyOtpSchema = z.object({
  email: emailField,
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
