import React, { ReactNode, useState } from "react";
import { useAuth } from "../auth";
import { Button, Card, FindOpMark, Brand } from "../components/shared";

export function Login({ signup = false }: { signup?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    window.location.href = "/discover";
  };
  return (
    <div className="auth-page">
      <a className="auth-brand" href="/">
        <Brand />
      </a>
      <div className="auth-glow" />
      <Card className="auth-card">
        <FindOpMark />
        <p className="eyebrow">{signup ? "JOIN FINDOP" : "WELCOME BACK"}</p>
        <h1>{signup ? "Create your account" : "Find what’s next."}</h1>
        <p className="auth-copy">
          {signup
            ? "Save opportunities and shape a feed around your ambitions."
            : "Your opportunity shortlist is waiting."}
        </p>
        <div className="oauth-row">
          <button onClick={submit}>G&nbsp; Continue with Google</button>
          <button onClick={submit}>
            <span className="github-glyph">●</span> Continue with GitHub
          </button>
        </div>
        <div className="auth-divider">
          <span>or continue with email</span>
        </div>
        <form onSubmit={submit}>
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>
          {!signup && (
            <a className="auth-forgot" href="mailto:support@findop.example">
              Forgot password?
            </a>
          )}
          <button className="button primary full" type="submit">
            {signup ? "Create account" : "Sign in"} <span>→</span>
          </button>
        </form>
        <button
          className="guest-link"
          onClick={() => (window.location.href = "/discover")}
        >
          Continue without logging in
        </button>
        <p className="auth-switch">
          {signup ? "Already have an account? " : "Don’t have an account? "}
          <a href={signup ? "/login" : "/signup"}>
            {signup ? "Sign in" : "Sign up"}
          </a>
        </p>
      </Card>
      <p className="auth-foot">
        By continuing, you agree to FindOP’s terms and privacy policy.
      </p>
    </div>
  );
}
export function GoogleIcon() {
  return (
    <svg className="social-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.8 12.23c0-.72-.06-1.42-.18-2.09H12v3.96h5.5a4.7 4.7 0 0 1-2.04 3.08v2.56h3.3c1.93-1.78 3.04-4.4 3.04-7.51Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.76 0 5.08-.91 6.77-2.46l-3.3-2.56c-.91.61-2.07.97-3.47.97-2.67 0-4.94-1.8-5.75-4.22H2.84v2.64A10.22 10.22 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.25 13.73a6.14 6.14 0 0 1 0-3.46V7.63H2.84a10.23 10.23 0 0 0 0 8.74l3.41-2.64Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.05c1.5 0 2.84.52 3.9 1.54l2.92-2.92C17.07 2.99 14.76 2 12 2a10.22 10.22 0 0 0-9.16 5.63l3.41 2.64C7.06 7.85 9.33 6.05 12 6.05Z"
      />
    </svg>
  );
}
export function GithubIcon() {
  return (
    <svg
      className="social-icon github-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.4-1.34-1.77-1.34-1.77-1.1-.75.08-.74.08-.74 1.2.08 1.84 1.23 1.84 1.23 1.08 1.84 2.83 1.31 3.52 1 .11-.78.42-1.31.77-1.61-2.67-.3-5.47-1.34-5.47-5.93 0-1.31.47-2.38 1.23-3.22-.12-.3-.53-1.52.12-3.17 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.3-1.55 3.3-1.23 3.3-1.23.65 1.65.24 2.87.12 3.17.76.84 1.23 1.91 1.23 3.22 0 4.6-2.81 5.62-5.49 5.92.43.37.82 1.1.82 2.22v3.31c0 .32.22.7.83.58A12 12 0 0 0 12 .5Z"
      />
    </svg>
  );
}
export function AuthPage({ signup = false }: { signup?: boolean }) {
  const { login, signup: register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const next =
    new URLSearchParams(window.location.search).get("next") || "/discover";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      if (signup && password !== confirm)
        throw new Error("Passwords do not match.");
      if (signup) await register(name, email, password);
      else await login(email, password);
      window.location.href = next;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not continue.");
    }
  };
  const oauthUnavailable = () =>
    setError(
      "Social sign-in is not connected yet. Use email or continue as a guest.",
    );
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
        <FindOpMark />
        <p className="eyebrow">{signup ? "JOIN FINDOP" : "WELCOME BACK"}</p>
        <h1>{signup ? "Create your account" : "Welcome back"}</h1>
        <p className="auth-copy">
          {signup
            ? "Save opportunities and build a feed around your ambitions."
            : "Sign in to continue discovering opportunities matched to you."}
        </p>
        {!signup && (
          <div className="oauth-row">
            <button type="button" onClick={oauthUnavailable}>
              <GoogleIcon />
              Continue with Google
            </button>
            <button type="button" onClick={oauthUnavailable}>
              <GithubIcon />
              Continue with GitHub
            </button>
          </div>
        )}
        {!signup && (
          <div className="auth-divider">
            <span>OR CONTINUE WITH EMAIL</span>
          </div>
        )}
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
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
          <button className="button primary full" type="submit">
            {signup ? "Create account" : "Sign in"} <span>→</span>
          </button>
        </form>
        {signup && (
          <div className="auth-divider signup-divider">
            <span>OR</span>
          </div>
        )}
        {signup && (
          <div className="oauth-row">
            <button type="button" onClick={oauthUnavailable}>
              <GoogleIcon />
              Continue with Google
            </button>
            <button type="button" onClick={oauthUnavailable}>
              <GithubIcon />
              Continue with GitHub
            </button>
          </div>
        )}
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
      </Card>
      <p className="auth-foot">
        Frontend development auth only until backend authentication is
        available.
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
