import React, { ReactNode, useEffect, useState } from "react";
import { useAuth } from "../auth";
import { ApiError, api, authToken } from "../api";
import { Button, Card, FindOpMark, Brand } from "../components/shared";

export function AuthPage({ signup = false }: { signup?: boolean }) {
  const { login, signup: register, verifyOtp, resendOtp } = useAuth();
  const [stage, setStage] = useState<"form" | "otp">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const next =
    new URLSearchParams(window.location.search).get("next") || "/discover";

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  const enterOtpStage = (verifiedEmail: string, message?: string) => {
    setPendingEmail(verifiedEmail);
    setNotice(message ?? "");
    setError("");
    setCode("");
    setResendIn(60);
    setStage("otp");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      if (signup && password !== confirm)
        throw new Error("Passwords do not match.");
      if (signup) {
        await register(name, email, password);
        enterOtpStage(
          email,
          `We sent a 6-digit verification code to ${email}. It expires in 10 minutes.`,
        );
      } else {
        try {
          await login(email, password);
          window.location.href = next;
        } catch (loginError) {
          if (
            loginError instanceof ApiError &&
            loginError.code === "EMAIL_NOT_VERIFIED"
          ) {
            enterOtpStage(
              email,
              "Your email isn't verified yet. Enter the code we sent you.",
            );
          } else {
            throw loginError;
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not continue.");
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await verifyOtp(pendingEmail, code);
      window.location.href = next;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not verify the code.");
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    if (busy || resendIn > 0) return;
    setError("");
    setBusy(true);
    try {
      await resendOtp(pendingEmail);
      setNotice(`A fresh code was sent to ${pendingEmail}.`);
      setResendIn(60);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resend the code.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-orbit auth-orbit-one" />
      <div className="auth-orbit auth-orbit-two" />
      <span className="auth-particle auth-particle-one" />
      <span className="auth-particle auth-particle-two" />
      <a className="auth-brand" href="/">
        <Brand />
      </a>
      <div className="auth-glow" />
      <Card className="auth-card">
        {stage === "otp" ? (
          <>
            <FindOpMark />
            <p className="eyebrow">VERIFY YOUR EMAIL</p>
            <h1>Check your inbox</h1>
            <p className="auth-copy">
              Enter the 6-digit code we emailed to{" "}
              <b>{pendingEmail}</b>.
            </p>
            <form onSubmit={submitOtp}>
              <label>
                Verification code
                <input
                  className="otp-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                  maxLength={6}
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="••••••"
                />
              </label>
              {notice && (
                <div className="auth-notice" role="status">
                  {notice}
                </div>
              )}
              {error && (
                <div className="auth-error" role="alert">
                  {error}
                </div>
              )}
              <button className="button primary full" type="submit" disabled={busy}>
                {busy ? "Verifying…" : "Verify and continue"} <span>→</span>
              </button>
            </form>
            <button
              className="auth-resend"
              onClick={() => void resendCode()}
              disabled={busy || resendIn > 0}
            >
              {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
            </button>
            <button className="guest-link" onClick={() => setStage("form")}>
              Use a different email
            </button>
          </>
        ) : (
          <>
            <FindOpMark />
            <p className="eyebrow">{signup ? "JOIN FINDOP" : "WELCOME BACK"}</p>
            <h1>{signup ? "Create your account" : "Welcome back"}</h1>
            <p className="auth-copy">
              {signup
                ? "Save opportunities and build a feed around your ambitions."
                : "Sign in to continue discovering opportunities matched to you."}
            </p>
            <form onSubmit={submit}>
              {signup && (
                <label>
                  Name
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                  />
                </label>
              )}
              <label>
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  required
                  minLength={signup ? 8 : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={signup ? "At least 8 characters" : "••••••••"}
                />
              </label>
              {!signup && (
                <a className="auth-forgot" href="#password">
                  Forgot password?
                </a>
              )}
              {signup && (
                <label>
                  Confirm password
                  <input
                    type="password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                  />
                </label>
              )}
              {error && (
                <div className="auth-error" role="alert">
                  {error}
                </div>
              )}
              <button className="button primary full" type="submit" disabled={busy}>
                {busy
                  ? signup
                    ? "Creating account…"
                    : "Signing in…"
                  : (signup ? "Create account" : "Sign in")}{" "}
                <span>→</span>
              </button>
            </form>
            <button
              className="guest-link"
              onClick={() => (window.location.href = "/discover")}
            >
              Continue without signing in
            </button>
            <p className="auth-switch">
              {signup ? "Already have an account? " : "Don’t have an account? "}
              <a href={signup ? "/login" : "/signup"}>
                {signup ? "Sign in" : "Create an account"}
              </a>
            </p>
          </>
        )}
      </Card>
      <p className="auth-foot">
        By continuing, you agree to FindOP’s terms and privacy policy.
      </p>
    </div>
  );
}
export function Protected({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    return null;
  }
  return <>{children}</>;
}

/**
 * Landing point after the provider round-trip. The backend redirects here
 * with a URL fragment (never a server-visible query): #token=…&next=… or
 * #error=…
 */
export function OAuthCallback() {
  const [message, setMessage] = useState("Finishing sign-in…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const error = params.get("error");
    const token = params.get("token");
    const nextRaw = params.get("next") || "/discover";
    const next =
      nextRaw.startsWith("/") && !nextRaw.startsWith("//")
        ? nextRaw
        : "/discover";

    if (error) {
      setFailed(true);
      setMessage(error);
      return;
    }

    if (!token) {
      setFailed(true);
      setMessage("Sign-in did not complete. Please try again.");
      return;
    }

    authToken.set(token);
    api
      .me()
      .then(() => {
        window.location.hash = "";
        window.location.replace(next);
      })
      .catch(() => {
        authToken.clear();
        setFailed(true);
        setMessage("Could not restore your session. Please sign in again.");
      });
  }, []);

  return (
    <div className="auth-page">
      <div className="auth-orbit auth-orbit-one" />
      <div className="auth-orbit auth-orbit-two" />
      <a className="auth-brand" href="/">
        <Brand />
      </a>
      <div className="auth-glow" />
      <Card className="auth-card">
        <FindOpMark />
        <p className="eyebrow">{failed ? "SIGN-IN PROBLEM" : "SOCIAL SIGN-IN"}</p>
        <h1>{failed ? "That didn’t work." : "One moment…"}</h1>
        <p className="auth-copy">{message}</p>
        {failed && (
          <>
            <a className="button primary full" href="/login">
              Back to sign in
            </a>
            <Button variant="ghost" onClick={() => (window.location.href = "/discover")}>
              Continue as guest
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
