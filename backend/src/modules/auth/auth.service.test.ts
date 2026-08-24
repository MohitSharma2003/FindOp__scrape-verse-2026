import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  generateOtp,
  hashOtp,
  hashPassword,
  signAuthToken,
  verifyAuthToken,
  verifyPassword,
} from "./auth.utils.js";
import { createAuthService } from "./auth.service.js";

describe("auth utils", () => {
  it("hashes and verifies passwords", async () => {
    const stored = await hashPassword("correct horse battery staple");
    assert.match(stored, /^scrypt:[0-9a-f]{32}:/);
    assert.equal(await verifyPassword("correct horse battery staple", stored), true);
  });

  it("rejects wrong passwords", async () => {
    const stored = await hashPassword("hunter2hunter2");
    assert.equal(await verifyPassword("hunter3hunter3", stored), false);
  });

  it("rejects malformed stored hashes", async () => {
    assert.equal(await verifyPassword("x", "not-a-hash"), false);
    assert.equal(await verifyPassword("x", "scrypt:onlysalt"), false);
  });

  it("generates zero-padded six digit codes", () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateOtp();
      assert.match(code, /^\d{6}$/);
    }
  });

  it("hashes OTP codes deterministically per email", () => {
    assert.equal(hashOtp("a@b.co", "123456"), hashOtp("a@b.co", "123456"));
    assert.notEqual(hashOtp("a@b.co", "123456"), hashOtp("other@b.co", "123456"));
    assert.notEqual(hashOtp("a@b.co", "123456"), hashOtp("a@b.co", "654321"));
  });

  it("signs and verifies auth tokens", () => {
    const token = signAuthToken({ sub: "user-1", email: "a@b.co" });
    const payload = verifyAuthToken(token);
    assert.deepEqual(payload, { sub: "user-1", email: "a@b.co" });
  });

  it("rejects tampered or foreign tokens", () => {
    assert.equal(verifyAuthToken("garbage.token.value"), null);
    const token = signAuthToken({ sub: "user-1", email: "a@b.co" });
    assert.equal(verifyAuthToken(`${token}x`), null);
  });
});

describe("auth service", () => {
  type StubUser = {
    _id?: string;
    name: string;
    email: string;
    passwordHash: string;
    isVerified: boolean;
    otp: null | { codeHash: string; expiresAt: Date; attempts: number; lastSentAt: Date };
    save(): Promise<StubUser>;
  };

  function stubUser(overrides: Partial<StubUser> = {}): StubUser {
    return {
      _id: "user-1",
      name: "Ada",
      email: "ada@example.com",
      passwordHash: "scrypt:00:00",
      isVerified: false,
      otp: null,
      save: async function (this: StubUser) {
        return this;
      },
      ...overrides,
    };
  }

  interface ServiceStubs {
    findOneResult?: StubUser | null;
    fixedNow?: Date;
    onCreate?: (data: { email: string; name: string; passwordHash: string }) => void;
    onOtpStored?: (email: string, otp: unknown) => void;
    deliverMail?: (options: { to: string; subject: string; html: string }) => Promise<void>;
  }

  function withStubs(options: ServiceStubs) {
    const sentMail: { to: string; subject: string }[] = [];
    const createdUsers: { email: string; name: string; passwordHash: string }[] = [];
    const storedOtps: { email: string; otp: unknown }[] = [];

    const service = createAuthService({
      now: options.fixedNow ? () => options.fixedNow! : undefined,
      deliverMail:
        options.deliverMail ??
        (async (mailOptions) => {
          sentMail.push(mailOptions);
        }),
      findOneUser: async () => options.findOneResult ?? null,
      createUser: async (data) => {
        createdUsers.push(data);
        options.onCreate?.(data);
        return stubUser({ ...data, _id: "new-user" });
      },
      updateOtpByMail: async (email, otp) => {
        storedOtps.push({ email, otp });
        options.onOtpStored?.(email, otp);
      },
    });

    return { service, sentMail, createdUsers, storedOtps };
  }

  it("signup sends an OTP via the injected mail transport", async () => {
    let created: Record<string, unknown> | null = null;
    const { service, sentMail } = withStubs({
      onCreate: (data) => {
        created = data as unknown as Record<string, unknown>;
      },
    });

    const result = await service.signup({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "super-secret-9",
    });

    assert.equal(result.email, "ada@example.com");
    const firstMail = sentMail[0];
    assert.ok(firstMail);
    assert.equal(firstMail.to, "ada@example.com");
    assert.ok(created);
    // Password is never stored in plaintext.
    assert.notEqual((created as Record<string, unknown>).passwordHash, "super-secret-9");
  });

  it("signup refuses a verified duplicate email", async () => {
    const { service } = withStubs({ findOneResult: stubUser({ isVerified: true }) });

    await assert.rejects(
      service.signup({ name: "Ada", email: "ada@example.com", password: "super-secret-9" }),
      (error: { statusCode?: number; code?: string }) =>
        error.statusCode === 409 && error.code === "EMAIL_IN_USE",
    );
  });

  it("verifyOtp rejects an expired code", async () => {
    const user = stubUser({
      otp: {
        codeHash: hashOtp("ada@example.com", "111111"),
        expiresAt: new Date(Date.now() - 1000),
        attempts: 0,
        lastSentAt: new Date(),
      },
    });
    const { service } = withStubs({ findOneResult: user });

    await assert.rejects(
      service.verifyOtp({ email: "ada@example.com", code: "111111" }),
      (error: { code?: string }) => error.code === "OTP_EXPIRED",
    );
  });

  it("verifyOtp accepts the correct code and returns a usable token", async () => {
    const code = "424242";
    const user = stubUser({
      otp: {
        codeHash: hashOtp("ada@example.com", code),
        expiresAt: new Date(Date.now() + 60000),
        attempts: 0,
        lastSentAt: new Date(),
      },
    });
    const { service, sentMail } = withStubs({ findOneResult: user });

    const result = await service.verifyOtp({ email: "ada@example.com", code });
    assert.equal(result.user.email, "ada@example.com");
    assert.deepEqual(verifyAuthToken(result.token), {
      sub: "user-1",
      email: "ada@example.com",
    });
    assert.equal(user.isVerified, true);
    assert.equal(user.otp, null);
    // A successful verification activates the account and triggers the
    // account-creation ("welcome") email.
    const lastMail = sentMail[sentMail.length - 1];
    assert.ok(lastMail);
    assert.match(lastMail.subject, /Welcome/);
  });

  it("verifyOtp rejects a wrong code and counts the attempt", async () => {
    const otp = {
      codeHash: hashOtp("ada@example.com", "111111"),
      expiresAt: new Date(Date.now() + 60000),
      attempts: 0,
      lastSentAt: new Date(),
    };
    const user = stubUser({ otp });
    const { service } = withStubs({ findOneResult: user });

    await assert.rejects(
      service.verifyOtp({ email: "ada@example.com", code: "999999" }),
      (error: { code?: string }) => error.code === "INVALID_OTP",
    );
    assert.equal(otp.attempts, 1);
  });

  it("verifyOtp locks after too many failed attempts", async () => {
    const user = stubUser({
      otp: {
        codeHash: hashOtp("ada@example.com", "111111"),
        expiresAt: new Date(Date.now() + 60000),
        attempts: 5,
        lastSentAt: new Date(),
      },
    });
    const { service } = withStubs({ findOneResult: user });

    await assert.rejects(
      service.verifyOtp({ email: "ada@example.com", code: "000000" }),
      (error: { code?: string }) => error.code === "OTP_LOCKED",
    );
  });

  it("resendOtp enforces the cooldown window", async () => {
    const user = stubUser({
      otp: {
        codeHash: "deadbeef",
        expiresAt: new Date(Date.now() + 60000),
        attempts: 0,
        lastSentAt: new Date(),
      },
    });
    const { service } = withStubs({ findOneResult: user });

    await assert.rejects(
      service.resendOtp("ada@example.com"),
      (error: { code?: string }) => error.code === "OTP_RESEND_COOLDOWN",
    );
  });

  it("resendOtp sends a fresh code after the cooldown", async () => {
    const user = stubUser({
      otp: {
        codeHash: "deadbeef",
        expiresAt: new Date(Date.now() + 60000),
        attempts: 2,
        lastSentAt: new Date(Date.now() - 5 * 60 * 1000),
      },
    });
    const { service, sentMail } = withStubs({ findOneResult: user });

    const result = await service.resendOtp("ada@example.com");
    assert.equal(sentMail.length, 1);
    assert.ok(result.expiresAt.getTime() > Date.now());
  });

  it("login rejects unknown emails without leaking existence", async () => {
    const { service } = withStubs({ findOneResult: null });

    await assert.rejects(
      service.login({ email: "ghost@example.com", password: "whatever-1" }),
      (error: { statusCode?: number; code?: string }) =>
        error.statusCode === 401 && error.code === "INVALID_CREDENTIALS",
    );
  });

  it("login blocks unverified accounts with EMAIL_NOT_VERIFIED", async () => {
    const passwordHash = await hashPassword("letmein-123456");
    const { service } = withStubs({
      findOneResult: stubUser({ passwordHash, isVerified: false }),
    });

    await assert.rejects(
      service.login({ email: "ada@example.com", password: "letmein-123456" }),
      (error: { statusCode?: number; code?: string }) =>
        error.statusCode === 403 && error.code === "EMAIL_NOT_VERIFIED",
    );
  });

  it("login issues a token for verified users with correct passwords", async () => {
    const passwordHash = await hashPassword("letmein-123456");
    const { service } = withStubs({
      findOneResult: stubUser({ passwordHash, isVerified: true }),
    });

    const result = await service.login({ email: "ada@example.com", password: "letmein-123456" });
    assert.equal(result.user.name, "Ada");
    assert.deepEqual(verifyAuthToken(result.token), {
      sub: "user-1",
      email: "ada@example.com",
    });
  });
});
