import nodemailer from "nodemailer";

import { env } from "../../config/env.js";
import { AppError } from "../../middleware/error-handler.js";

export type MailSender = (options: {
  to: string;
  subject: string;
  html: string;
  devHint?: string;
}) => Promise<void>;

let cachedTransport: nodemailer.Transporter | null = null;

/** Public URL of the web app, used for every link inside emails. */
const APP_URL = (env.FRONTEND_URL ?? "http://localhost:5173").replace(
  /\/$/,
  "",
);

export function isMailerConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

function getTransport(): nodemailer.Transporter {
  if (!cachedTransport) {
    cachedTransport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }
  return cachedTransport;
}

export async function sendMail(options: {
  to: string;
  subject: string;
  html: string;
  /** Surfaced in the console when SMTP is unconfigured, so local flows stay testable. */
  devHint?: string;
}): Promise<void> {
  if (!isMailerConfigured()) {
    if (env.NODE_ENV === "production") {
      throw new AppError(
        503,
        "EMAIL_NOT_CONFIGURED",
        "Email delivery is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS.",
      );
    }
    console.warn(
      `[mailer] SMTP not configured — skipping delivery of "${options.subject}" to ${options.to}. ${options.devHint ?? ""}`,
    );
    return;
  }

  await getTransport().sendMail({
    // MAIL_FROM holds a bare address (schema-validated); brand it for the inbox.
    from: env.MAIL_FROM ? `FindOP <${env.MAIL_FROM}>` : env.SMTP_USER,
    to: options.to,
    subject: options.subject,
    html: options.html,
  });
}

/* ── Shared email layout ─────────────────────────────────────────────────── */

const BRAND_PURPLE = "#7c6cf0";
const INK = "#e8ebf5";
const MUTED = "#98a0b8";
const PANEL = "#141927";
const CARD = "#1b2132";
const BORDER = "#2b3347";

function ctaButton(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:${BRAND_PURPLE};color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:8px;">${escapeHtml(label)}</a>`;
}

/**
 * Consistent frame for every FindOP email: brand wordmark header, content
 * panel, footer with a direct link into the app.
 */
function renderEmailShell(contentHtml: string): string {
  return `
<div style="margin:0;padding:24px 12px;background:#0a0d16;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:520px;margin:0 auto;">
    <div style="padding:20px 8px;">
      <span style="color:${INK};font-size:20px;font-weight:bold;letter-spacing:-0.5px;">find<span style="color:${BRAND_PURPLE};">op</span></span>
    </div>
    <div style="background:${PANEL};border:1px solid ${BORDER};border-radius:14px;padding:36px 34px;">
      ${contentHtml}
    </div>
    <div style="padding:22px 8px;text-align:center;">
      <p style="color:${MUTED};font-size:11px;line-height:1.6;margin:0 0 10px;">
        You are receiving this email because an account was created on FindOP.<br/>
        FindOP · Opportunity intelligence for people building what&rsquo;s next.
      </p>
      <a href="${escapeHtml(APP_URL)}" style="color:${MUTED};font-size:11px;">Visit FindOP</a>
    </div>
  </div>
</div>`;
}

function greeting(name: string): string {
  return `<p style="color:${INK};font-size:16px;margin:0 0 14px;">Hi ${escapeHtml(name)},</p>`;
}

export function renderOtpEmail(name: string, code: string, ttlMinutes: number) {
  const html = renderEmailShell(`
    ${greeting(name)}
    <p style="color:${MUTED};font-size:14px;line-height:1.65;margin:0 0 24px;">
      Welcome to <b style="color:${INK};">FindOP</b>. Confirm your email address by entering
      this verification code in the app. It expires in ${ttlMinutes} minutes.
    </p>
    <div style="background:${CARD};border:1px solid ${BORDER};border-radius:10px;padding:18px;text-align:center;margin-bottom:26px;">
      <span style="color:${INK};font-size:32px;font-weight:bold;letter-spacing:10px;font-family:'Courier New',monospace;">${escapeHtml(code)}</span>
    </div>
    <p style="color:${MUTED};font-size:12px;line-height:1.6;margin:0;">
      If you did not try to create a FindOP account, you can safely ignore this email —
      no account will be activated without this code.
    </p>`);
  return {
    subject: `Your FindOP verification code: ${code}`,
    html,
  };
}

/** Sent once, right after an account becomes active (email verified). */
export function renderWelcomeEmail(name: string) {
  const html = renderEmailShell(`
    ${greeting(name)}
    <h1 style="color:${INK};font-size:21px;margin:0 0 16px;">Your FindOP account is ready</h1>
    <p style="color:${MUTED};font-size:14px;line-height:1.65;margin:0 0 26px;">
      Your email has been verified and your account is now active. Sign in any time to
      discover hackathons, fellowships, grants and more — matched to what you care about.
    </p>
    <div style="margin-bottom:28px;">
      ${ctaButton(`${APP_URL}/discover`, "Go to FindOP")}
    </div>
    <p style="color:${MUTED};font-size:12px;line-height:1.6;margin:0;">
      Welcome aboard,<br/>The FindOP team
    </p>`);
  return {
    subject: "Welcome to FindOP — your account is ready",
    html,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
