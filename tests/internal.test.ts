import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db/index.js";
import { createHash, randomBytes } from "node:crypto";

function basicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

async function createTestApp(opts: { withScope?: boolean; status?: string; scopes?: string[] } = {}) {
  const slug = `test-introspect-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const clientId = `${slug}_${randomBytes(4).toString("hex")}`;
  const clientSecret = randomBytes(16).toString("base64url");
  const clientSecretHash = createHash("sha256").update(clientSecret).digest("hex");

  const appRec = await prisma.application.create({
    data: {
      name: `Test ${slug}`,
      slug,
      clientId,
      clientSecretHash,
      redirectUris: [],
      status: (opts.status as any) ?? "active",
    },
  });

  const scopeList = opts.scopes ?? (opts.withScope ? ["session:introspect"] : []);
  for (const scope of scopeList) {
    await prisma.applicationScope.create({
      data: { applicationId: appRec.id, scope, description: "test" },
    });
  }

  return { app: appRec, clientId, clientSecret };
}

async function createUserAndSession(opts: { status?: string; revoked?: boolean; expired?: boolean } = {}) {
  const email = `introspect_${Date.now()}_${Math.random().toString(36).slice(2,6)}@example.com`;
  const username = `introspect_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
  const { hashPassword } = await import("../src/lib/password.js");
  const pw = await hashPassword("password123");

  const user = await prisma.user.create({
    data: {
      email,
      username,
      passwordHash: pw,
      displayName: "Test",
      status: (opts.status as any) ?? "active",
      emailVerifiedAt: new Date(),
    },
  });

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: createHash("sha256").update(randomBytes(16).toString("hex")).digest("hex"),
      deviceName: "test",
      deviceType: "api",
      ipAddress: "127.0.0.1",
      userAgent: "test",
      expiresAt: opts.expired ? new Date(Date.now() - 1000) : new Date(Date.now() + 7 * 24 * 3600 * 1000),
      revokedAt: opts.revoked ? new Date() : null,
    },
  });

  return { user, session };
}

describe("POST /api/v1/internal/sessions/introspect", () => {
  beforeAll(async () => {
    // clean up test data
    await prisma.auditLog.deleteMany();
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany();
  });

  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
  });

  // ─── AUTHENTICATION ──────────────────────────

  it("1. No Authorization header → 401", async () => {
    const res = await app.request("/api/v1/internal/sessions/introspect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "00000000-0000-4000-a000-000000000000", sessionId: "00000000-0000-4000-a000-000000000000" }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_CLIENT");
    expect(res.headers.get("WWW-Authenticate")).toContain("Basic");
  });

  it("2. Invalid Basic format → 401", async () => {
    const res = await app.request("/api/v1/internal/sessions/introspect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Basic not-base64!!!" },
      body: JSON.stringify({ userId: "00000000-0000-4000-a000-000000000000", sessionId: "00000000-0000-4000-a000-000000000000" }),
    });
    expect(res.status).toBe(401);
  });

  it("3. Invalid client ID → 401", async () => {
    const res = await app.request("/api/v1/internal/sessions/introspect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: basicAuth("unknown_client", "secret") },
      body: JSON.stringify({ userId: "00000000-0000-4000-a000-000000000000", sessionId: "00000000-0000-4000-a000-000000000000" }),
    });
    expect(res.status).toBe(401);
  });

  it("4. Invalid client secret → 401", async () => {
    const { clientId } = await createTestApp({ withScope: true });
    const res = await app.request("/api/v1/internal/sessions/introspect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: basicAuth(clientId, "wrong_secret") },
      body: JSON.stringify({ userId: "00000000-0000-4000-a000-000000000000", sessionId: "00000000-0000-4000-a000-000000000000" }),
    });
    expect(res.status).toBe(401);
    await prisma.application.delete({ where: { id: (await prisma.application.findUnique({ where: { clientId } }))!.id } });
  });

  it("5. Disabled application → 401", async () => {
    const { clientId, clientSecret, app: appRec } = await createTestApp({ withScope: true, status: "disabled" });
    const res = await app.request("/api/v1/internal/sessions/introspect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: basicAuth(clientId, clientSecret) },
      body: JSON.stringify({ userId: "00000000-0000-4000-a000-000000000000", sessionId: "00000000-0000-4000-a000-000000000000" }),
    });
    expect(res.status).toBe(401);
    await prisma.application.delete({ where: { id: appRec.id } });
  });

  it("6. Valid application + missing scope → 403", async () => {
    const { clientId, clientSecret, app: appRec } = await createTestApp({ withScope: false });
    const res = await app.request("/api/v1/internal/sessions/introspect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: basicAuth(clientId, clientSecret) },
      body: JSON.stringify({ userId: "00000000-0000-4000-a000-000000000000", sessionId: "00000000-0000-4000-a000-000000000000" }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
    await prisma.application.delete({ where: { id: appRec.id } });
  });

  it("7. Valid application + scope → continue (400 due validation)", async () => {
    const { clientId, clientSecret, app: appRec } = await createTestApp({ withScope: true });
    const res = await app.request("/api/v1/internal/sessions/introspect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: basicAuth(clientId, clientSecret) },
      body: JSON.stringify({}), // missing fields -> 400 not 401/403
    });
    expect(res.status).toBe(400);
    await prisma.applicationScope.deleteMany({ where: { applicationId: appRec.id } });
    await prisma.application.delete({ where: { id: appRec.id } });
  });

  // ─── REQUEST VALIDATION ──────────────────────

  it("8. Missing userId → 400", async () => {
    const { clientId, clientSecret, app: appRec } = await createTestApp({ withScope: true });
    const res = await app.request("/api/v1/internal/sessions/introspect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: basicAuth(clientId, clientSecret) },
      body: JSON.stringify({ sessionId: "00000000-0000-4000-a000-000000000000" }),
    });
    expect(res.status).toBe(400);
    await prisma.applicationScope.deleteMany({ where: { applicationId: appRec.id } });
    await prisma.application.delete({ where: { id: appRec.id } });
  });

  it("9. Missing sessionId → 400", async () => {
    const { clientId, clientSecret, app: appRec } = await createTestApp({ withScope: true });
    const res = await app.request("/api/v1/internal/sessions/introspect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: basicAuth(clientId, clientSecret) },
      body: JSON.stringify({ userId: "00000000-0000-4000-a000-000000000000" }),
    });
    expect(res.status).toBe(400);
    await prisma.applicationScope.deleteMany({ where: { applicationId: appRec.id } });
    await prisma.application.delete({ where: { id: appRec.id } });
  });

  it("10. Invalid userId UUID → 400", async () => {
    const { clientId, clientSecret, app: appRec } = await createTestApp({ withScope: true });
    const res = await app.request("/api/v1/internal/sessions/introspect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: basicAuth(clientId, clientSecret) },
      body: JSON.stringify({ userId: "not-uuid", sessionId: "00000000-0000-4000-a000-000000000000" }),
    });
    expect(res.status).toBe(400);
    await prisma.applicationScope.deleteMany({ where: { applicationId: appRec.id } });
    await prisma.application.delete({ where: { id: appRec.id } });
  });

  it("11. Invalid sessionId UUID → 400", async () => {
    const { clientId, clientSecret, app: appRec } = await createTestApp({ withScope: true });
    const res = await app.request("/api/v1/internal/sessions/introspect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: basicAuth(clientId, clientSecret) },
      body: JSON.stringify({ userId: "00000000-0000-4000-a000-000000000000", sessionId: "not-uuid" }),
    });
    expect(res.status).toBe(400);
    await prisma.applicationScope.deleteMany({ where: { applicationId: appRec.id } });
    await prisma.application.delete({ where: { id: appRec.id } });
  });

  // ─── SESSION STATE ───────────────────────────

  it("12. Valid user + valid session → 200 valid:true", async () => {
    const { clientId, clientSecret, app: appRec } = await createTestApp({ withScope: true });
    const { user, session } = await createUserAndSession();
    const res = await app.request("/api/v1/internal/sessions/introspect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: basicAuth(clientId, clientSecret) },
      body: JSON.stringify({ userId: user.id, sessionId: session.id }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
    expect(body.userId).toBe(user.id);
    expect(body.sessionId).toBe(session.id);
    // cleanup
    await prisma.session.delete({ where: { id: session.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.applicationScope.deleteMany({ where: { applicationId: appRec.id } });
    await prisma.application.delete({ where: { id: appRec.id } });
  });

  it("13. Unknown session → 200 valid:false REVOKED", async () => {
    const { clientId, clientSecret, app: appRec } = await createTestApp({ withScope: true });
    const { user } = await createUserAndSession();
    const fakeSessionId = "00000000-0000-4000-a000-000000000099";
    const res = await app.request("/api/v1/internal/sessions/introspect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: basicAuth(clientId, clientSecret) },
      body: JSON.stringify({ userId: user.id, sessionId: fakeSessionId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(false);
    expect(body.reason).toBe("REVOKED");
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.applicationScope.deleteMany({ where: { applicationId: appRec.id } });
    await prisma.application.delete({ where: { id: appRec.id } });
  });

  it("14. Revoked session → 200 valid:false REVOKED", async () => {
    const { clientId, clientSecret, app: appRec } = await createTestApp({ withScope: true });
    const { user, session } = await createUserAndSession({ revoked: true });
    const res = await app.request("/api/v1/internal/sessions/introspect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: basicAuth(clientId, clientSecret) },
      body: JSON.stringify({ userId: user.id, sessionId: session.id }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).valid).toBe(false);
    await prisma.session.delete({ where: { id: session.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.applicationScope.deleteMany({ where: { applicationId: appRec.id } });
    await prisma.application.delete({ where: { id: appRec.id } });
  });

  it("15. Expired session → 200 valid:false REVOKED", async () => {
    const { clientId, clientSecret, app: appRec } = await createTestApp({ withScope: true });
    const { user, session } = await createUserAndSession({ expired: true });
    const res = await app.request("/api/v1/internal/sessions/introspect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: basicAuth(clientId, clientSecret) },
      body: JSON.stringify({ userId: user.id, sessionId: session.id }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).valid).toBe(false);
    await prisma.session.delete({ where: { id: session.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.applicationScope.deleteMany({ where: { applicationId: appRec.id } });
    await prisma.application.delete({ where: { id: appRec.id } });
  });

  it("16. Wrong userId + valid sessionId → 200 valid:false REVOKED", async () => {
    const { clientId, clientSecret, app: appRec } = await createTestApp({ withScope: true });
    const { session } = await createUserAndSession();
    const otherUser = await prisma.user.create({
      data: {
        email: `other_${Date.now()}@example.com`,
        username: `other_${Date.now()}`,
        passwordHash: "x",
        displayName: "Other",
        status: "active",
        emailVerifiedAt: new Date(),
      },
    });
    const res = await app.request("/api/v1/internal/sessions/introspect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: basicAuth(clientId, clientSecret) },
      body: JSON.stringify({ userId: otherUser.id, sessionId: session.id }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).valid).toBe(false);
    await prisma.session.delete({ where: { id: session.id } });
    await prisma.user.deleteMany({ where: { id: { in: [otherUser.id, session.userId] } } });
    await prisma.applicationScope.deleteMany({ where: { applicationId: appRec.id } });
    await prisma.application.delete({ where: { id: appRec.id } });
  });

  it("17. Inactive user (suspended) → 200 valid:false REVOKED", async () => {
    const { clientId, clientSecret, app: appRec } = await createTestApp({ withScope: true });
    const { user, session } = await createUserAndSession({ status: "suspended" });
    const res = await app.request("/api/v1/internal/sessions/introspect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: basicAuth(clientId, clientSecret) },
      body: JSON.stringify({ userId: user.id, sessionId: session.id }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).valid).toBe(false);
    await prisma.session.delete({ where: { id: session.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.applicationScope.deleteMany({ where: { applicationId: appRec.id } });
    await prisma.application.delete({ where: { id: appRec.id } });
  });

  // ─── SECURITY ────────────────────────────────

  it("18. Response does not expose sensitive data", async () => {
    const { clientId, clientSecret, app: appRec } = await createTestApp({ withScope: true });
    const { user, session } = await createUserAndSession();
    const res = await app.request("/api/v1/internal/sessions/introspect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: basicAuth(clientId, clientSecret) },
      body: JSON.stringify({ userId: user.id, sessionId: session.id }),
    });
    const body = await res.json();
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("password");
    expect(raw).not.toContain("refreshToken");
    expect(raw).not.toContain("clientSecret");
    await prisma.session.delete({ where: { id: session.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.applicationScope.deleteMany({ where: { applicationId: appRec.id } });
    await prisma.application.delete({ where: { id: appRec.id } });
  });

  it("22. AuditLog created with applicationId", async () => {
    const { clientId, clientSecret, app: appRec } = await createTestApp({ withScope: true });
    const { user, session } = await createUserAndSession();
    await prisma.auditLog.deleteMany({ where: { applicationId: appRec.id } });
    const res = await app.request("/api/v1/internal/sessions/introspect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: basicAuth(clientId, clientSecret) },
      body: JSON.stringify({ userId: user.id, sessionId: session.id }),
    });
    expect(res.status).toBe(200);
    const logs = await prisma.auditLog.findMany({ where: { applicationId: appRec.id, action: "SESSION_INTROSPECT" } });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].metadata).toBeDefined();
    await prisma.auditLog.deleteMany({ where: { applicationId: appRec.id } });
    await prisma.session.delete({ where: { id: session.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.applicationScope.deleteMany({ where: { applicationId: appRec.id } });
    await prisma.application.delete({ where: { id: appRec.id } });
  });
});

// ─── AUTHORIZATION CHECK (7.10-1) ──────────────────────

describe("POST /api/v1/internal/authorization/check", () => {
  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany();
  });

  it("no auth → 401", async () => {
    const res = await app.request("/api/v1/internal/authorization/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ principalType: "USER", principalId: "00000000-0000-4000-a000-000000000000", permission: "drive:read" }),
    });
    expect(res.status).toBe(401);
  });

  it("wrong secret → 401", async () => {
    const { clientId, app: a } = await createTestApp({ scopes: ["authorization:read"] });
    const res = await app.request("/api/v1/internal/authorization/check", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: basicAuth(clientId, "wrong") },
      body: JSON.stringify({ principalType: "USER", principalId: "00000000-0000-4000-a000-000000000000", permission: "drive:read" }),
    });
    expect(res.status).toBe(401);
    await prisma.applicationScope.deleteMany({ where: { applicationId: a.id } });
    await prisma.application.delete({ where: { id: a.id } });
  });

  it("missing scope → 403", async () => {
    const { clientId, clientSecret, app: a } = await createTestApp({ scopes: ["session:introspect"] });
    const res = await app.request("/api/v1/internal/authorization/check", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: basicAuth(clientId, clientSecret) },
      body: JSON.stringify({ principalType: "USER", principalId: "00000000-0000-4000-a000-000000000000", permission: "drive:read" }),
    });
    expect(res.status).toBe(403);
    await prisma.applicationScope.deleteMany({ where: { applicationId: a.id } });
    await prisma.application.delete({ where: { id: a.id } });
  });

  it("invalid principalId → 400", async () => {
    const { clientId, clientSecret, app: a } = await createTestApp({ scopes: ["authorization:read"] });
    const res = await app.request("/api/v1/internal/authorization/check", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: basicAuth(clientId, clientSecret) },
      body: JSON.stringify({ principalType: "USER", principalId: "not-uuid", permission: "drive:read" }),
    });
    expect(res.status).toBe(400);
    await prisma.applicationScope.deleteMany({ where: { applicationId: a.id } });
    await prisma.application.delete({ where: { id: a.id } });
  });

  it("invalid permission format → 400", async () => {
    const { clientId, clientSecret, app: a } = await createTestApp({ scopes: ["authorization:read"] });
    const res = await app.request("/api/v1/internal/authorization/check", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: basicAuth(clientId, clientSecret) },
      body: JSON.stringify({ principalType: "USER", principalId: "00000000-0000-4000-a000-000000000000", permission: "nocolon" }),
    });
    expect(res.status).toBe(400);
    await prisma.applicationScope.deleteMany({ where: { applicationId: a.id } });
    await prisma.application.delete({ where: { id: a.id } });
  });

  it("deny when permission does not exist → {allowed:false}", async () => {
    const { clientId, clientSecret, app: a } = await createTestApp({ scopes: ["authorization:read"] });
    const res = await app.request("/api/v1/internal/authorization/check", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: basicAuth(clientId, clientSecret) },
      body: JSON.stringify({ principalType: "USER", principalId: "00000000-0000-4000-a000-000000000000", permission: "nonexistent:perm" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.allowed).toBe(false);
    await prisma.applicationScope.deleteMany({ where: { applicationId: a.id } });
    await prisma.application.delete({ where: { id: a.id } });
  });

  it("allow when ResourcePermission granted → {allowed:true}", async () => {
    const { clientId, clientSecret, app: a } = await createTestApp({ scopes: ["authorization:read"] });

    // Ensure permission exists
    let perm = await prisma.permission.findUnique({ where: { resource_action: { resource: "drive", action: "read" } } });
    if (!perm) {
      perm = await prisma.permission.create({ data: { resource: "drive", action: "read", description: "test" } });
    }

    // Create user + grant
    const { hashPassword } = await import("../src/lib/password.js");
    const pw = await hashPassword("test123");
    const testUser = await prisma.user.create({
      data: { email: `authz_${Date.now()}@test.com`, username: `authz_${Date.now()}`, passwordHash: pw, displayName: "Test", status: "active", emailVerifiedAt: new Date() },
    });
    await prisma.resourcePermission.create({
      data: { resourceType: "global", resourceId: "*", principalType: "USER", principalId: testUser.id, permissionId: perm.id, effect: "allow" },
    });

    const res = await app.request("/api/v1/internal/authorization/check", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: basicAuth(clientId, clientSecret) },
      body: JSON.stringify({ principalType: "USER", principalId: testUser.id, permission: "drive:read" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.allowed).toBe(true);

    // cleanup
    await prisma.resourcePermission.deleteMany({ where: { principalId: testUser.id } });
    await prisma.auditLog.deleteMany({ where: { applicationId: a.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
    await prisma.applicationScope.deleteMany({ where: { applicationId: a.id } });
    await prisma.application.delete({ where: { id: a.id } });
  });

  it("audit log created with AUTHORIZATION_CHECK", async () => {
    const { clientId, clientSecret, app: a } = await createTestApp({ scopes: ["authorization:read"] });
    await prisma.auditLog.deleteMany({ where: { applicationId: a.id } });
    const res = await app.request("/api/v1/internal/authorization/check", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: basicAuth(clientId, clientSecret) },
      body: JSON.stringify({ principalType: "USER", principalId: "00000000-0000-4000-a000-000000000000", permission: "drive:read" }),
    });
    expect(res.status).toBe(200);
    const logs = await prisma.auditLog.findMany({ where: { applicationId: a.id, action: "AUTHORIZATION_CHECK" } });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    await prisma.auditLog.deleteMany({ where: { applicationId: a.id } });
    await prisma.applicationScope.deleteMany({ where: { applicationId: a.id } });
    await prisma.application.delete({ where: { id: a.id } });
  });
});
