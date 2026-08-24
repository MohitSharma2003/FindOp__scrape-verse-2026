import jwt from "jsonwebtoken";

import { env, jwtSecret } from "../../config/env.js";
import { hashPassword, signAuthToken } from "./auth.utils.js";
import { randomBytes } from "node:crypto";
import { User } from "./user.model.js";
import type { AuthUserRecord } from "./auth.service.js";
import type { OAuthProfile } from "./oauth.client.js";

export interface OAuthSessionResult {
  token: string;
  user: { name: string; email: string };
}

interface OAuthServiceDependencies {
  findOneUser?: (email: string) => Promise<AuthUserRecord | null>;
  createUser?: (data: {
    email: string;
    name: string;
    passwordHash: string;
    isVerified: boolean;
  }) => Promise<AuthUserRecord>;
}

/**
 * Stateless CSRF protection for the OAuth round-trip: the `state` parameter is
 * a short-lived JWT carrying the post-login redirect target.
 */
export function createOAuthState(next: string): string {
  return jwt.sign({ purpose: "oauth-state", next }, jwtSecret, {
    expiresIn: "10m",
  });
}

export function verifyOAuthState(state: string): { next: string } | null {
  try {
    const decoded = jwt.verify(state, jwtSecret);
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      (decoded as { purpose?: string }).purpose !== "oauth-state"
    ) {
      return null;
    }
    const next = (decoded as { next?: unknown }).next;
    if (typeof next !== "string") return null;
    // Only same-site relative paths may be used as redirect targets.
    if (!next.startsWith("/") || next.startsWith("//")) return null;
    return { next };
  } catch {
    return null;
  }
}

/** Where to send the browser after the provider round-trip. */
export function frontendCallbackUrl(): string {
  const base = env.FRONTEND_URL ?? "http://localhost:5173";
  return `${base.replace(/\/$/, "")}/oauth/callback`;
}

/** Public backend base used to build provider-registered redirect URIs. */
export function backendCallbackUrl(provider: "google" | "github"): string {
  const base =
    env.BACKEND_URL ?? `http://localhost:${env.PORT.toString()}`;
  return `${base.replace(/\/$/, "")}/api/auth/oauth/${provider}/callback`;
}

/**
 * Sign-in/sign-up via a trusted identity provider:
 * existing accounts are marked verified and logged in; new accounts are
 * created verified with an unusable random password (OAuth-only access).
 */
export function createOauthAccountService(
  dependencies: OAuthServiceDependencies = {},
) {
  const findUser =
    dependencies.findOneUser ??
    (async (email: string) =>
      (await User.findOne({ email })) as unknown as AuthUserRecord | null);
  const createUser =
    dependencies.createUser ??
    (async ({
      email,
      name,
      passwordHash,
      isVerified,
    }: {
      email: string;
      name: string;
      passwordHash: string;
      isVerified: boolean;
    }) => (await User.create({ email, name, passwordHash, isVerified })) as unknown as AuthUserRecord);

  async function upsertOAuthUser(
    profile: OAuthProfile,
  ): Promise<OAuthSessionResult> {
    let user = await findUser(profile.email);

    if (!user) {
      // Random scrypt hash no one can match: password login stays impossible
      // for provider-created accounts.
      const passwordHash = await hashPassword(randomSecret());
      user = await createUser({
        email: profile.email,
        name: profile.name,
        passwordHash,
        isVerified: true,
      });
    } else if (!user.isVerified) {
      // The provider proved ownership of this email; complete verification.
      user.isVerified = true;
      await user.save();
    }

    return {
      token: signAuthToken({
        sub: String(user._id ?? user.email),
        email: user.email,
      }),
      user: { name: user.name, email: user.email },
    };
  }

  return { upsertOAuthUser };
}

function randomSecret(): string {
  return randomBytes(32).toString("hex");
}

/** Production instance backed by Mongoose. */
export const oauthAccountService = createOauthAccountService();
