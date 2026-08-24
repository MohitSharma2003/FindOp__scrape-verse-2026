import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createOAuthState,
  createOauthAccountService,
  frontendCallbackUrl,
  verifyOAuthState,
} from "./oauth.service.js";
import type { AuthUserRecord } from "./auth.service.js";

describe("oauth state", () => {
  it("round-trips the redirect target", () => {
    const state = createOAuthState("/saved?x=1");
    assert.deepEqual(verifyOAuthState(state), { next: "/saved?x=1" });
  });

  it("rejects tampered states", () => {
    const state = createOAuthState("/discover");
    assert.equal(verifyOAuthState(`${state}-tampered`), null);
    assert.equal(verifyOAuthState("not-a-jwt"), null);
  });

  it("rejects protocol-relative and absolute redirect targets", () => {
    // Signed by us, but never allowed to leave the site.
    assert.equal(verifyOAuthState(createOAuthState("//evil.example")), null);
    assert.equal(
      verifyOAuthState(createOAuthState("https://evil.example")),
      null,
    );
    assert.ok(verifyOAuthState(createOAuthState("/discover")));
  });
});

describe("frontend callback url", () => {
  it("points at the SPA callback route", () => {
    assert.match(frontendCallbackUrl(), /\/oauth\/callback$/);
  });
});

describe("oauth account service", () => {
  type StubUser = AuthUserRecord & { _id?: string };

  function stubUser(overrides: Partial<StubUser>): StubUser {
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

  function withStubs(existing: StubUser | null) {
    const created: {
      email: string;
      name: string;
      passwordHash: string;
      isVerified: boolean;
    }[] = [];
    const welcomed: { name: string; email: string }[] = [];

    const service = createOauthAccountService({
      findOneUser: async () => existing,
      createUser: async (data) => {
        created.push(data);
        return stubUser({ ...data, _id: "new-user" });
      },
      sendWelcome: async (recipient) => {
        welcomed.push(recipient);
      },
    });

    return { service, created, welcomed };
  }

  const profile = {
    provider: "google" as const,
    providerAccountId: "google:123",
    email: "ada@example.com",
    name: "Ada Lovelace",
  };

  it("creates a new verified account for a first-time provider sign-in", async () => {
    const { service, created, welcomed } = withStubs(null);

    const result = await service.upsertOAuthUser(profile);

    const firstCreated = created[0];
    assert.equal(created.length, 1);
    assert.ok(firstCreated);
    assert.equal(firstCreated.isVerified, true);
    // Password hash is unusable random data — OAuth accounts can't be logged
    // into via the password form.
    assert.notEqual(firstCreated.passwordHash.length, 0);
    assert.equal(result.user.email, "ada@example.com");
    assert.match(result.token, /\./);
    assert.deepEqual(welcomed, [{ name: "Ada Lovelace", email: "ada@example.com" }]);
  });

  it("verifies an existing unverified password account on provider proof", async () => {
    const existing = stubUser({});
    const { service } = withStubs(existing);

    const result = await service.upsertOAuthUser(profile);

    assert.equal(existing.isVerified, true);
    assert.equal(result.user.email, "ada@example.com");
  });

  it("signs in an existing verified account without changing it", async () => {
    const existing = stubUser({ isVerified: true, name: "Ada L." });
    const { service, created } = withStubs(existing);

    const result = await service.upsertOAuthUser(profile);

    assert.equal(created.length, 0);
    assert.equal(result.user.name, "Ada L.");
  });
});
