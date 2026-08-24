import {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
} from "./auth.constants.js";
import {
  generateOtp,
  hashOtp,
  hashPassword,
  signAuthToken,
  verifyPassword,
} from "./auth.utils.js";
import { renderOtpEmail, renderWelcomeEmail, sendMail, type MailSender } from "./mailer.js";
import { User } from "./user.model.js";
import { AppError } from "../../middleware/error-handler.js";

export interface PublicUser {
  name: string;
  email: string;
}

export interface AuthResult {
  token: string;
  user: PublicUser;
}

export interface OtpRequestResult {
  email: string;
  expiresAt: Date;
}

/** Shape of the user record the service needs; satisfied by the mongoose document. */
export interface AuthUserRecord {
  _id?: unknown;
  name: string;
  email: string;
  passwordHash: string;
  isVerified: boolean;
  otp: null | {
    codeHash: string;
    expiresAt: Date;
    attempts: number;
    lastSentAt: Date | null;
  };
  save(): Promise<AuthUserRecord>;
}

interface AuthServiceDependencies {
  /** Injectable mail transport so tests never touch SMTP. */
  deliverMail?: MailSender;
  now?: () => Date;
  /** Injectable persistence so the flow is testable without MongoDB. */
  findOneUser?: (email: string) => Promise<AuthUserRecord | null>;
  createUser?: (data: {
    email: string;
    name: string;
    passwordHash: string;
  }) => Promise<AuthUserRecord>;
  updateOtpByMail?: (
    email: string,
    otp: NonNullable<AuthUserRecord["otp"]>,
  ) => Promise<void>;
}

const nowDefault = () => new Date();

/**
 * Create (or refresh) unverified accounts, verify emailed one-time passcodes,
 * and issue JWT sessions. Persistence and mail delivery are injectable so the
 * whole flow is unit-testable without MongoDB or SMTP.
 */
export function createAuthService(dependencies: AuthServiceDependencies = {}) {
  const deliverMail = dependencies.deliverMail ?? sendMail;
  const now = dependencies.now ?? nowDefault;
  const findUser =
    dependencies.findOneUser ??
    (async (email: string) =>
      (await User.findOne({ email })) as unknown as AuthUserRecord | null);
  const createUser =
    dependencies.createUser ??
    (async ({ email, name, passwordHash }: { email: string; name: string; passwordHash: string }) => {
      const created = await User.create({ email, name, passwordHash });
      return created as unknown as AuthUserRecord;
    });
  const storeOtp =
    dependencies.updateOtpByMail ??
    (async (
      email: string,
      otp: { codeHash: string; expiresAt: Date; attempts: number; lastSentAt: Date },
    ) => {
      await User.updateOne({ email }, { $set: { otp } });
    });

  async function issueOtp(
    email: string,
    name: string,
  ): Promise<OtpRequestResult> {
    const code = generateOtp();
    const expiresAt = new Date(now().getTime() + OTP_TTL_MS);

    await storeOtp(email, {
      codeHash: hashOtp(email, code),
      expiresAt,
      attempts: 0,
      lastSentAt: now(),
    });

    const mail = renderOtpEmail(name, code, Math.round(OTP_TTL_MS / 60000));
    try {
      await deliverMail({
        to: email,
        subject: mail.subject,
        html: mail.html,
        devHint: `[DEV ONLY] OTP for ${email}: ${code}`,
      });
    } catch (error) {
      throw new AppError(
        502,
        "EMAIL_SEND_FAILED",
        error instanceof Error
          ? `Could not send the verification email: ${error.message}`
          : "Could not send the verification email.",
      );
    }

    return { email, expiresAt };
  }

  async function signup(input: {
    name: string;
    email: string;
    password: string;
  }): Promise<OtpRequestResult> {
    const existing = await findUser(input.email);

    if (existing?.isVerified) {
      throw new AppError(
        409,
        "EMAIL_IN_USE",
        "An account with this email already exists. Try signing in instead.",
      );
    }

    const passwordHash = await hashPassword(input.password);

    if (existing) {
      // Unverified duplicate signup: refresh credentials, then re-send the code.
      existing.name = input.name;
      existing.passwordHash = passwordHash;
      await existing.save();
    } else {
      await createUser({
        email: input.email,
        name: input.name,
        passwordHash,
      });
    }

    return issueOtp(input.email, input.name);
  }

  async function resendOtp(email: string): Promise<OtpRequestResult> {
    const user = await findUser(email);
    if (!user || user.isVerified) {
      throw new AppError(
        404,
        "VERIFICATION_NOT_PENDING",
        "No pending verification found for this email. Sign up or sign in instead.",
      );
    }

    if (
      user.otp?.lastSentAt &&
      now().getTime() - user.otp.lastSentAt.getTime() < OTP_RESEND_COOLDOWN_MS
    ) {
      throw new AppError(
        429,
        "OTP_RESEND_COOLDOWN",
        "A code was sent recently. Wait a minute before requesting another.",
      );
    }

    return issueOtp(user.email, user.name);
  }

  async function verifyOtp(input: {
    email: string;
    code: string;
  }): Promise<AuthResult> {
    const user = await findUser(input.email);
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "Account not found.");
    }
    if (user.isVerified) {
      throw new AppError(
        409,
        "ALREADY_VERIFIED",
        "This email is already verified. Please sign in.",
      );
    }
    if (!user.otp) {
      throw new AppError(
        400,
        "OTP_NOT_REQUESTED",
        "Request a verification code first.",
      );
    }
    if (user.otp.expiresAt.getTime() <= now().getTime()) {
      throw new AppError(
        400,
        "OTP_EXPIRED",
        "That code has expired. Request a new one.",
      );
    }
    if (user.otp.attempts >= OTP_MAX_ATTEMPTS) {
      throw new AppError(
        429,
        "OTP_LOCKED",
        "Too many incorrect attempts. Request a new code.",
      );
    }

    user.otp.attempts += 1;
    await user.save();

    if (user.otp.codeHash !== hashOtp(input.email, input.code)) {
      throw new AppError(
        400,
        "INVALID_OTP",
        "Incorrect verification code. Check the email and try again.",
      );
    }

    user.isVerified = true;
    user.otp = null;
    await user.save();

    // Account just became active: greet the user. Delivery problems must not
    // fail the verification itself, so this is best-effort.
    try {
      const mail = renderWelcomeEmail(user.name);
      await deliverMail({ to: user.email, subject: mail.subject, html: mail.html });
    } catch (error) {
      console.error(
        "[auth] welcome email failed:",
        error instanceof Error ? error.message : error,
      );
    }

    return {
      token: signAuthToken({ sub: String(user._id ?? user.email), email: user.email }),
      user: { name: user.name, email: user.email },
    };
  }

  async function login(input: {
    email: string;
    password: string;
  }): Promise<AuthResult> {
    const user = await findUser(input.email);
    const passwordOk = user
      ? await verifyPassword(input.password, user.passwordHash)
      : false;

    if (!user || !passwordOk) {
      throw new AppError(
        401,
        "INVALID_CREDENTIALS",
        "Incorrect email or password.",
      );
    }

    if (!user.isVerified) {
      throw new AppError(
        403,
        "EMAIL_NOT_VERIFIED",
        "Verify your email before signing in. Enter the code we emailed you.",
      );
    }

    return {
      token: signAuthToken({ sub: String(user._id ?? user.email), email: user.email }),
      user: { name: user.name, email: user.email },
    };
  }

  return { signup, resendOtp, verifyOtp, login };
}

/** Production service instance backed by Mongoose and SMTP/nodemailer. */
export const authService = createAuthService();
