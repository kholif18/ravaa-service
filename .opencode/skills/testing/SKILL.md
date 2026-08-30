---
name: testing
description: Reference for testing patterns in Ravaa-Service — Vitest setup, integration tests, database cleanup, API testing. Use when writing tests, debugging test failures, or setting up test infrastructure. Triggers on "test", "vitest", "integration test", "test setup", "mock".
---

# Testing Reference (Vitest)

## Setup

### vitest.config.ts

```typescript
import { defineConfig } from "vitest/config";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(__dirname, ".env") });

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    env: {
      NODE_ENV: "test",  // Disables rate limiting
    },
  },
});
```

### tests/setup.ts

```typescript
import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
config({ path: resolve(__dirname, "../.env") });
```

## Test Structure

### Basic test

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db/index.js";

beforeAll(async () => {
  await prisma.user.deleteMany({});
});

afterAll(async () => {
  await prisma.user.deleteMany({});
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.user.deleteMany({});
});

describe("POST /api/v1/auth/register", () => {
  it("registers a new user successfully", async () => {
    const res = await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        username: "testuser",
        password: "password123",
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe("test@example.com");
    expect(body.accessToken).toBeDefined();
    expect(body.user.passwordHash).toBeUndefined();
  });
});
```

### API request pattern

```typescript
// app.request() is Hono's built-in test helper
const res = await app.request("/api/v1/auth/login", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${accessToken}`,  // for protected routes
  },
  body: JSON.stringify({ identifier: "test@example.com", password: "password123" }),
});

expect(res.status).toBe(200);
const body = await res.json();
```

### Extracting tokens from responses

```typescript
const registerRes = await app.request("/api/v1/auth/register", { ... });
const registerBody = await registerRes.json();
const accessToken = registerBody.accessToken;
const refreshToken = registerBody.refreshToken;
```

## Database Cleanup

### Pattern

```typescript
beforeAll(async () => {
  await prisma.user.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.auditLog.deleteMany({});
});

afterAll(async () => {
  await prisma.user.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.user.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.auditLog.deleteMany({});
});
```

### Order matters

Delete in reverse dependency order:
1. `auditLog` (depends on user)
2. `session` (depends on user)
3. `user` (independent)

## Test Categories

### Validation tests

```typescript
it("rejects invalid email", async () => {
  const res = await app.request("/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "invalid", username: "test", password: "password123" }),
  });
  expect(res.status).toBe(400);
});

it("rejects short password", async () => {
  const res = await app.request("/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "test@example.com", username: "test", password: "123" }),
  });
  expect(res.status).toBe(400);
});
```

### Duplicate/conflict tests

```typescript
it("rejects duplicate email", async () => {
  await app.request("/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "test@example.com", username: "user1", password: "password123" }),
  });

  const res = await app.request("/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "test@example.com", username: "user2", password: "password123" }),
  });
  expect(res.status).toBe(409);
});
```

### Authentication tests

```typescript
it("rejects unauthenticated request", async () => {
  const res = await app.request("/api/v1/me");
  expect(res.status).toBe(401);
});

it("returns current user", async () => {
  // Register first
  const registerRes = await app.request("/api/v1/auth/register", { ... });
  const { accessToken } = await registerRes.json();

  const res = await app.request("/api/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(res.status).toBe(200);
});
```

### Session tests

```typescript
it("revokes session on logout", async () => {
  const registerRes = await app.request("/api/v1/auth/register", { ... });
  const { accessToken } = await registerRes.json();

  const logoutRes = await app.request("/api/v1/auth/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(logoutRes.status).toBe(200);

  // Token should no longer work
  const meRes = await app.request("/api/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(meRes.status).toBe(401);
});
```

### Refresh token rotation tests

```typescript
it("rejects reused refresh token", async () => {
  const registerRes = await app.request("/api/v1/auth/register", { ... });
  const { refreshToken } = await registerRes.json();

  // First refresh (should succeed)
  await app.request("/api/v1/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  // Second refresh with same token (should fail - reuse detected)
  const res = await app.request("/api/v1/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  expect(res.status).toBe(401);
});
```

### Account lock tests

```typescript
it("locks account after 5 failed attempts", async () => {
  await app.request("/api/v1/auth/register", { ... });

  // 5 failed attempts
  for (let i = 0; i < 5; i++) {
    await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "test@example.com", password: "wrong" }),
    });
  }

  // 6th attempt should be locked
  const res = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "test@example.com", password: "password123" }),
  });
  expect(res.status).toBe(423);
});
```

## Running Tests

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage
```

## Common Issues

1. **"client password must be a string"** — `.env` not loaded. Check `vitest.config.ts` loads dotenv.
2. **429 errors in tests** — rate limiting not disabled. Check `NODE_ENV=test` in vitest config.
3. **Database connection leak** — call `await prisma.$disconnect()` in `afterAll`.
4. **Stale data between tests** — use `beforeEach` to clean database.
5. **Tests pass locally but fail in CI** — check PostgreSQL is running and accessible.

## Test File Naming

- Test files: `tests/*.test.ts`
- Setup file: `tests/setup.ts`
- Pattern: `{feature}.test.ts` (e.g., `auth.test.ts`, `health.test.ts`)
