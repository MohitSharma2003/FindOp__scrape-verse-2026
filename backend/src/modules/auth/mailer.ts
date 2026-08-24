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
    from: env.MAIL_FROM ?? env.SMTP_USER,
    to: options.to,
    subject: options.subject,
    html: options.html,
  });
}

export function renderOtpEmail(name: string, code: string, ttlMinutes: number) {
  return {
    subject: `Your FindOP verification code: ${code}`,
    html: `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#0f1320;color:#e7e9f2;border-radius:12px">
  <p style="letter-spacing:3px;font-size:11px;color:#8f97b3;margin:0 0 16px">FINDOP ACCOUNT VERIFICATION</p>
  <h1 style="font-size:22px;margin:0 0 8px">Hi ${escapeHtml(name)},</h1>
  <p style="color:#b6bcd4;line-height:1.5;margin:0 0 24px">
    Use the verification code below to finish creating your FindOP account.
    It expires in ${ttlMinutes} minutes.
  </p>
  <div style="font-size:34px;font-weight:bold;letter-spacing:10px;font-family:'Courier New',monospace;background:#181d30;border:1px solid #2a3050;border-radius:8px;padding:18px;text-align:center">${escapeHtml(code)}</div>
  <p style="color:#8f97b3;font-size:12px;line-height:1.5;margin-top:24px">
    If you did not request this code you can safely ignore this email.
  </p>
</div>`,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
