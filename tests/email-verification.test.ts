import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db/index.js";
import { hashVerificationToken } from "../src/lib/email/token.js";
import { FakeEmailProvider, setEmailProvider } from "../src/lib/email/email.provider.js";

const fakeProvider = new FakeEmailProvider();

beforeAll(async () => {
  setEmailProvider(fakeProvider);
  await prisma.auditLog.deleteMany();
  await prisma.emailVerification.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.emailVerification.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
});

beforeEach(async () => {
  fakeProvider.clear();
  await prisma.auditLog.deleteMany();
  await prisma.emailVerification.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
});

function uniqueUser() {
  const s = Date.now() + Math.random().toString(36).slice(2, 6);
  return {
    email: `ev_${s}@example.com`,
    username: `ev_${s}`.replace(/[^a-z0-9_]/g, "_").slice(0, 20),
    password: "password123",
  };
}

async function registerAndGetUser(u = uniqueUser()) {
  const res = await app.request("/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(u),
  });
  expect(res.status).toBe(201);
  const body = await res.json();
  return { user: body.user, rawU: u };
}

// Extract raw token from fake email (parse verificationUrl)
function extractTokenFromEmail(): string | null {
  const last = fakeProvider.getLast();
  if (!last) return null;
  const m = last.html.match(/token=([^"&]+)/) || last.text.match(/token=([^\s]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

describe("Phase 6.9 — Register active + optional verification", () => {
  it("register → active + emailVerifiedAt null (optional verification)", async () => {
    const { user } = await registerAndGetUser();
    expect(user.status).toBe("active");
    expect(user.emailVerifiedAt).toBeNull();
  });

  it("active unverified can login", async () => {
    const u = uniqueUser();
    await registerAndGetUser(u);
    const res = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: u.email, password: u.password }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.status).toBe("active");
    expect(body.user.emailVerifiedAt).toBeNull();
  });

  it("verify sets emailVerifiedAt but keeps status active", async () => {
    const { user } = await registerAndGetUser();
    const token = extractTokenFromEmail()!;
    const res = await app.request("/api/v1/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    expect(res.status).toBe(200);
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(dbUser!.status).toBe("active");
    expect(dbUser!.emailVerifiedAt).not.toBeNull();
  });

  it("resend after already verified does not send new token", async () => {
    const { user } = await registerAndGetUser();
    const token = extractTokenFromEmail()!;
    await app.request("/api/v1/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    fakeProvider.clear();
    const res = await app.request("/api/v1/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email }),
    });
    expect(res.status).toBe(200);
    expect(fakeProvider.sent.length).toBe(0);
  });
});

describe("Token generation security", () => {
  it("stores only hash, not raw token", async () => {
    await registerAndGetUser();
    const verifications = await prisma.emailVerification.findMany();
    expect(verifications.length).toBe(1);
    const token = extractTokenFromEmail();
    expect(token).toBeTruthy();
    // DB should not contain raw token
    const hashed = hashVerificationToken(token!);
    expect(verifications[0].tokenHash).toBe(hashed);
    expect(verifications[0].tokenHash).not.toBe(token);
  });

  it("expiration is ~24h", async () => {
    await registerAndGetUser();
    const v = await prisma.emailVerification.findFirst();
    const diff = v!.expiresAt.getTime() - Date.now();
    // 23h to 25h tolerance
    expect(diff).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(diff).toBeLessThan(25 * 60 * 60 * 1000);
  });
});

describe("POST /api/v1/auth/verify-email", () => {
  it("valid token → active + emailVerifiedAt (optional verification)", async () => {
    const { user } = await registerAndGetUser();
    expect(user.status).toBe("active");
    expect(user.emailVerifiedAt).toBeNull();

    const token = extractTokenFromEmail()!;
    const res = await app.request("/api/v1/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.status).toBe("active");
    expect(body.user.emailVerifiedAt).toBeTruthy();

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(dbUser!.status).toBe("active");
    expect(dbUser!.emailVerifiedAt).not.toBeNull();

    const v = await prisma.emailVerification.findFirst({ where: { tokenHash: hashVerificationToken(token) } });
    expect(v!.verifiedAt).not.toBeNull();
  });

  it("invalid token → 400 generic", async () => {
    const res = await app.request("/api/v1/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "invalidtoken123" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toMatch(/Invalid or expired/);
  });

  it("expired token → 400", async () => {
    const { user } = await registerAndGetUser();
    // manually expire
    await prisma.emailVerification.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const token = extractTokenFromEmail()!;
    const res = await app.request("/api/v1/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    expect(res.status).toBe(400);
  });

  it("already verified token → 400 (idempotent safe)", async () => {
    await registerAndGetUser();
    const token = extractTokenFromEmail()!;
    await app.request("/api/v1/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const res2 = await app.request("/api/v1/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    expect(res2.status).toBe(400);
  });

  it("suspended user cannot be activated", async () => {
    const { user } = await registerAndGetUser();
    await prisma.user.update({ where: { id: user.id }, data: { status: "suspended" } });
    const token = extractTokenFromEmail()!;
    const res = await app.request("/api/v1/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    expect(res.status).toBe(403);
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(dbUser!.status).toBe("suspended");
  });

  it("already active user second verification is safe", async () => {
    const { user } = await registerAndGetUser();
    const token = extractTokenFromEmail()!;
    await app.request("/api/v1/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    // create new token for same user (simulate resend after active - should be noop but test second verify)
    // Already tested above: second use of same token returns 400
  });
});

describe("POST /api/v1/auth/resend-verification", () => {
  it("active unverified user can resend, old token invalidated, new token generated", async () => {
    await registerAndGetUser();
    const oldToken = extractTokenFromEmail()!;
    fakeProvider.clear();

    const u = await prisma.user.findFirst();
    const res = await app.request("/api/v1/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: u!.email }),
    });
    expect(res.status).toBe(200);
    expect(fakeProvider.sent.length).toBe(1);
    const newToken = extractTokenFromEmail()!;
    expect(newToken).not.toBe(oldToken);

    // old token should now be invalid (deleted)
    const oldRes = await app.request("/api/v1/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: oldToken }),
    });
    expect(oldRes.status).toBe(400);

    // new token should work
    const newRes = await app.request("/api/v1/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: newToken }),
    });
    expect(newRes.status).toBe(200);
  });

  it("generic response for unknown email", async () => {
    const res = await app.request("/api/v1/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "unknown999@example.com" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toMatch(/If the account requires verification/);
    expect(fakeProvider.sent.length).toBe(0);
  });

  it("generic response for already active user", async () => {
    const { user } = await registerAndGetUser();
    const token = extractTokenFromEmail()!;
    await app.request("/api/v1/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    fakeProvider.clear();
    const res = await app.request("/api/v1/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email }),
    });
    expect(res.status).toBe(200);
    expect(fakeProvider.sent.length).toBe(0);
  });

  it("rate limited (5 per 15m)", async () => {
    const { user } = await registerAndGetUser();
    // 5 allowed
    for (let i = 0; i < 5; i++) {
      const r = await app.request("/api/v1/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });
      // first may be 200, subsequent also 200 until limit
      expect([200, 429]).toContain(r.status);
    }
    // 6th should be 429
    const r6 = await app.request("/api/v1/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email }),
    });
    expect(r6.status).toBe(429);
  });
});
