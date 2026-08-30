import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db/index.js";

const testUser = {
  email: `test_auth_${Date.now()}@example.com`,
  username: `testuser_auth_${Date.now()}`,
  password: "password123",
  displayName: "Test User",
};

let accessToken: string;
let refreshToken: string;

beforeAll(async () => {
  // Clean up only test data
  await prisma.auditLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
});

beforeEach(async () => {
  // Clean up only test data, not all data
  await prisma.auditLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
});

describe("POST /api/v1/auth/register", () => {
  it("registers a new user successfully", async () => {
    const res = await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testUser),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe(testUser.email);
    expect(body.user.username).toBe(testUser.username);
    expect(body.accessToken).toBeDefined();
    expect(body.expiresIn).toBe(900);
    expect(body.user.passwordHash).toBeUndefined();
  });

  it("rejects duplicate email", async () => {
    await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testUser),
    });

    const res = await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...testUser, username: "different" }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
  });

  it("rejects duplicate username", async () => {
    await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testUser),
    });

    const res = await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...testUser, email: "other@example.com" }),
    });

    expect(res.status).toBe(409);
  });

  it("rejects invalid email", async () => {
    const res = await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...testUser, email: "invalid" }),
    });

    expect(res.status).toBe(400);
  });

  it("rejects short password", async () => {
    const res = await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...testUser, password: "123" }),
    });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/auth/login", () => {
  beforeEach(async () => {
    await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testUser),
    });
  });

  it("logs in with correct credentials", async () => {
    const res = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: testUser.email, password: testUser.password }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBeDefined();
    expect(body.user.email).toBe(testUser.email);
    accessToken = body.accessToken;
  });

  it("rejects wrong password", async () => {
    const res = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: testUser.email, password: "wrong" }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("AUTHENTICATION_ERROR");
  });

  it("returns generic error for unknown user", async () => {
    const res = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "unknown@example.com", password: "password123" }),
    });

    expect(res.status).toBe(401);
  });

  it("locks account after 5 failed attempts", async () => {
    for (let i = 0; i < 5; i++) {
      await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: testUser.email, password: "wrong" }),
      });
    }

    const res = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: testUser.email, password: testUser.password }),
    });

    expect(res.status).toBe(423);
    const body = await res.json();
    expect(body.error.code).toBe("ACCOUNT_LOCKED");
  });
});

describe("GET /api/v1/me", () => {
  it("returns current user", async () => {
    await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testUser),
    });

    const loginRes = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: testUser.email, password: testUser.password }),
    });
    const loginBody = await loginRes.json();
    accessToken = loginBody.accessToken;

    const res = await app.request("/api/v1/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe(testUser.email);
  });

  it("rejects unauthenticated request", async () => {
    const res = await app.request("/api/v1/me");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/auth/refresh", () => {
  it("refreshes tokens", async () => {
    const registerRes = await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testUser),
    });
    const registerBody = await registerRes.json();
    refreshToken = registerBody.refreshToken;

    const res = await app.request("/api/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBeDefined();
  });

  it("rejects reused refresh token", async () => {
    const registerRes = await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testUser),
    });
    const registerBody = await registerRes.json();
    refreshToken = registerBody.refreshToken;

    await app.request("/api/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    const res = await app.request("/api/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("revokes current session", async () => {
    const registerRes = await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testUser),
    });
    const registerBody = await registerRes.json();
    accessToken = registerBody.accessToken;

    const res = await app.request("/api/v1/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/sessions", () => {
  it("lists user sessions", async () => {
    const registerRes = await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testUser),
    });
    const registerBody = await registerRes.json();
    accessToken = registerBody.accessToken;

    const res = await app.request("/api/v1/sessions", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toBeDefined();
    expect(Array.isArray(body.sessions)).toBe(true);
  });
});

describe("DELETE /api/v1/sessions", () => {
  it("revokes all sessions", async () => {
    const registerRes = await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testUser),
    });
    const registerBody = await registerRes.json();
    accessToken = registerBody.accessToken;

    const res = await app.request("/api/v1/sessions", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(res.status).toBe(200);
  });
});
