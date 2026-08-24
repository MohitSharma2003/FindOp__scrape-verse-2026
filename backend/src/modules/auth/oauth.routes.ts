import { Router, type Response } from "express";

import { AppError } from "../../middleware/error-handler.js";
import { isProviderConfigured } from "./oauth.client.js";
import {
  backendCallbackUrl,
  createOAuthState,
  frontendCallbackUrl,
  oauthAccountService,
  verifyOAuthState,
} from "./oauth.service.js";
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchProfile,
  type OAuthProvider,
} from "./oauth.client.js";

const router = Router();

/** Only these two providers are wired up; anything else is a 404. */
function providerOf(req: { params: { provider?: string } }): OAuthProvider {
  const value = req.params.provider;
  if (value === "google" || value === "github") return value;
  throw new AppError(404, "OAUTH_PROVIDER_UNKNOWN", "Unknown sign-in provider.");
}

/**
 * Step 1 of the sign-in dance: bounce the browser to Google/GitHub.
 * `state` carries our CSRF token + where to send the user afterwards.
 */
router.get("/:provider", (req, res) => {
  const provider = providerOf(req);

  if (!isProviderConfigured(provider)) {
    redirectWithError(res, `${provider} sign-in is not configured yet.`);
    return;
  }

  const rawNext =
    typeof req.query.next === "string" ? req.query.next : "/discover";
  // Only same-origin relative paths are accepted as post-login targets.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/discover";

  const state = createOAuthState(next);
  res.redirect(
    buildAuthorizeUrl(provider, backendCallbackUrl(provider), state),
  );
});

/**
 * Step 2: the provider sends the user back here with ?code&state. We swap
 * the code for a profile, upsert the account, and hand the frontend its JWT.
 * Everything lands back on the SPA via hash fragments (#token / #error).
 */
router.get("/:provider/callback", async (req, res) => {
  const provider = providerOf(req);
  const frontend = frontendCallbackUrl();
  const fail = (message: string) => redirectWithError(res, message, frontend);

  const state = typeof req.query.state === "string" ? req.query.state : "";
  const code = typeof req.query.code === "string" ? req.query.code : "";

  const verified = verifyOAuthState(state);
  if (!verified) {
    fail("Sign-in session expired or was tampered with. Please try again.");
    return;
  }
  if (!code) {
    // The user cancelled consent, or the provider bounced the request.
    const description =
      typeof req.query.error_description === "string"
        ? req.query.error_description
        : "Sign-in was cancelled.";
    fail(description);
    return;
  }

  try {
    const accessToken = await exchangeCodeForToken(
      provider,
      code,
      backendCallbackUrl(provider),
    );
    const profile = await fetchProfile(provider, accessToken);
    const session = await oauthAccountService.upsertOAuthUser(profile);

    res.redirect(
      `${frontend}#token=${encodeURIComponent(session.token)}&next=${encodeURIComponent(verified.next)}`,
    );
  } catch (error) {
    fail(
      error instanceof Error
        ? error.message
        : "Sign-in failed unexpectedly. Please try again.",
    );
  }
});

/** Send the browser back to the app with a human-readable error fragment. */
function redirectWithError(res: Response, message: string, frontend = frontendCallbackUrl()): void {
  res.redirect(`${frontend}#error=${encodeURIComponent(message)}`);
}

export default router;
