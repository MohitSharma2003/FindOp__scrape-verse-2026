import {
  createHmac,
  randomBytes,
  randomInt,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

import jwt from "jsonwebtoken";

import { env, jwtSecret } from "../../config/env.js";
import { AppError } from "../../middleware/error-handler.js";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const SCRYPT_KEYLEN = 64;

/** Hash a password with a per-user random salt: `scrypt:<salt>:<derivedKey>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, SCRYPT_KEYLEN);
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

/** Constant-time password verification against a stored `scrypt:` hash. */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [scheme, salt, expectedHex] = storedHash.split(":");
  if (scheme !== "scrypt" || !salt || !expectedHex) return false;

  const derived = await scrypt(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(expectedHex, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}

/** Cryptographically random numeric OTP of the configured length. */
export function generateOtp(length = 6): string {
  const max = 10 ** length;
  return randomInt(0, max).toString().padStart(length, "0");
}

/**
 * OTP codes are never stored in plaintext: HMAC-SHA256 keyed by the JWT
 * secret binds the code to this deployment.
 */
export function hashOtp(email: string, code: string): string {
  return createHmac("sha256", jwtSecret)
    .update(`${email.toLowerCase()}:${code}`)
    .digest("hex");
}

export interface AuthTokenPayload {
  sub: string;
  email: string;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, jwtSecret, {
    expiresIn: validateExpiresIn(env.JWT_EXPIRES_IN),
  });
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, jwtSecret);
    if (typeof decoded !== "object" || decoded === null) return null;
    const { sub, email } = decoded as Record<string, unknown>;
    if (typeof sub !== "string" || typeof email !== "string") return null;
    return { sub, email };
  } catch {
    return null;
  }
}

function validateExpiresIn(value: string): jwt.SignOptions["expiresIn"] {
  // jsonwebtoken accepts "7d" style strings or seconds; pass through valid ones.
  if (/^\d+$/.test(value)) return Number(value);
  if (/^\d+\s*(d|h|m|s)$/.test(value)) return value as jwt.SignOptions["expiresIn"];
  throw new AppError(
    500,
    "INVALID_JWT_EXPIRY",
    `Invalid JWT_EXPIRES_IN value: ${value}`,
  );
}
