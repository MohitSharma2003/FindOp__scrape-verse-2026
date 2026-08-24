import { AppError } from "../../middleware/error-handler.js";
import { env } from "../../config/env.js";

export type OAuthProvider = "google" | "github";

export interface OAuthProfile {
  provider: OAuthProvider;
  /** Provider account id (stable, used for diagnostics only). */
  providerAccountId: string;
  email: string;
  name: string;
}

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

const GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";
const GITHUB_EMAILS_URL = "https://api.github.com/user/emails";

export function isProviderConfigured(provider: OAuthProvider): boolean {
  return provider === "google"
    ? Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
    : Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
}

/** URL the user's browser hits to grant consent. */
export function buildAuthorizeUrl(
  provider: OAuthProvider,
  redirectUri: string,
  state: string,
): string {
  if (provider === "google") {
    const params = new URLSearchParams({
      client_id: credentials(provider).clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "online",
      prompt: "select_account",
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  const params = new URLSearchParams({
    client_id: credentials(provider).clientId,
    redirect_uri: redirectUri,
    scope: "read:user user:email",
    state,
  });
  return `${GITHUB_AUTH_URL}?${params.toString()}`;
}

interface ProviderCredentials {
  clientId: string;
  clientSecret: string;
}

function credentials(provider: OAuthProvider): ProviderCredentials {
  const clientId =
    provider === "google" ? env.GOOGLE_CLIENT_ID : env.GITHUB_CLIENT_ID;
  const clientSecret =
    provider === "google" ? env.GOOGLE_CLIENT_SECRET : env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new AppError(
      503,
      "OAUTH_NOT_CONFIGURED",
      `${provider} sign-in is not configured on this deployment.`,
    );
  }
  return { clientId, clientSecret };
}

/** Exchange the authorization code for an access token (provider-specific). */
export async function exchangeCodeForToken(
  provider: OAuthProvider,
  code: string,
  redirectUri: string,
): Promise<string> {
  const { clientId, clientSecret } = credentials(provider);

  const response =
    provider === "google"
      ? await fetchWithTimeout(GOOGLE_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          }),
        })
      : await fetchWithTimeout(GITHUB_TOKEN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
          }),
        });

  const payload = (await response.json().catch(() => null)) as
    | { access_token?: string; error_description?: string }
    | null;

  if (!response.ok || !payload?.access_token) {
    throw new AppError(
      502,
      "OAUTH_EXCHANGE_FAILED",
      payload?.error_description ||
        `${provider} rejected the sign-in attempt. Please try again.`,
    );
  }
  return payload.access_token;
}

/** Fetch the verified email + display name for the given access token. */
export async function fetchProfile(
  provider: OAuthProvider,
  accessToken: string,
): Promise<OAuthProfile> {
  if (provider === "google") {
    const response = await fetchWithTimeout(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = (await response.json().catch(() => null)) as
      | {
          sub?: string;
          email?: string;
          email_verified?: boolean;
          name?: string;
        }
      | null;

    if (!response.ok || !data?.sub || !data.email) {
      throw new AppError(
        502,
        "OAUTH_PROFILE_FAILED",
        "Could not read your Google profile. Please try again.",
      );
    }
    if (data.email_verified === false) {
      throw new AppError(
        403,
        "EMAIL_NOT_VERIFIED_BY_PROVIDER",
        "Your Google account email is not verified.",
      );
    }
    return {
      provider,
      providerAccountId: `google:${data.sub}`,
      email: data.email.toLowerCase(),
      name: data.name || (data.email.split("@")[0] ?? data.email),
    };
  }

  const response = await fetchWithTimeout(GITHUB_USER_URL, {
    headers: githubHeaders(accessToken),
  });
  const user = (await response.json().catch(() => null)) as
    | { id?: number; login?: string; name?: string; email?: string | null }
    | null;

  if (!response.ok || !user?.id) {
    throw new AppError(
      502,
      "OAUTH_PROFILE_FAILED",
      "Could not read your GitHub profile. Please try again.",
    );
  }

  const email = await primaryVerifiedGithubEmail(accessToken, user.email);

  return {
    provider,
    providerAccountId: `github:${user.id}`,
    email,
    name: user.name || user.login || (email.split("@")[0] ?? email),
  };
}

async function primaryVerifiedGithubEmail(
  accessToken: string,
  fallback: string | null | undefined,
): Promise<string> {
  const response = await fetchWithTimeout(GITHUB_EMAILS_URL, {
    headers: githubHeaders(accessToken),
  });
  const emails = (await response.json().catch(() => null)) as
    | { email: string; primary: boolean; verified: boolean }[]
    | null;

  const primaryVerified = emails?.find((e) => e.primary && e.verified);
  if (primaryVerified) return primaryVerified.email.toLowerCase();

  // Some accounts expose no email scopes; fall back to the public profile email.
  if (fallback) return fallback.toLowerCase();

  throw new AppError(
    403,
    "EMAIL_NOT_AVAILABLE",
    "Your GitHub account has no verified email we can use. Add one on github.com and retry.",
  );
}

function githubHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "findop-auth",
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
}
