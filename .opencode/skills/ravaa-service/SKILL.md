---
name: ravaa-service
description: Guide for developing Ravaa-Service, the Central Account / Identity Service for the Ravaa ecosystem. Use when writing or modifying any app code — routes, services, Prisma queries, middleware, tests. Covers Hono patterns, auth flows, session management, and verification steps. Triggers on "ravaa service", "account service", "identity service", "central auth".
---

# Ravaa-Service Development Guide

## Before you start

- Read `.opencode/agents/AGENTS.md` — it is the authoritative project guide (architecture, conventions, commands).
- Always finish with `npm run typecheck` — must pass with 0 errors.
- Always finish with `npm test` — all tests must pass.
- User speaks Indonesian; Git push only when explicitly asked.

## Tech Stack

- **Framework**: Hono (NOT Express, NOT Next.js)
- **Database**: PostgreSQL 16 (NOT SQLite)
- **ORM**: Prisma 7 with `@prisma/adapter-pg` driver adapter
- **Auth**: Argon2id + jose JWT + refresh token rotation
- **Validation**: Zod
- **Testing**: Vitest

## Project Structure

```
src/
├── index.ts              # HTTP server entry
├── app.ts                # Hono app, middleware, route mounting
├── factory.ts            # createRouter() + AppEnv type
├── env.ts                # Zod env validation
├── db/index.ts           # Prisma singleton (lazy init)
├── lib/                  # Shared utilities (errors, jwt, logger, password)
├── middlewares/           # auth, error-handler, rate-limit
└── modules/
    ├── auth/             # Register, login, refresh
    ├── sessions/         # List, revoke sessions
    ├── users/            # (Phase 3+)
    ├── applications/     # (Phase 4+)
    └── audit/            # (Phase 3+)
```

## Module Pattern

### Service file

```typescript
import { prisma } from "../../db/index.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { ConflictError, AuthenticationError } from "../../lib/errors.js";
import type { RegisterInput } from "./auth.schema.js";

const MAX_FAILED_ATTEMPTS = 5;

export async function register(input: RegisterInput): Promise<AuthResult> {
  // 1. Check duplicates
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ConflictError("Email already registered");

  // 2. Hash password
  const passwordHash = await hashPassword(input.password);

  // 3. Transaction for atomicity
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { ... } });
    const session = await tx.session.create({ data: { ... } });
    return { user, session };
  });

  // 4. Audit log (outside transaction, non-critical)
  await logAudit(result.user.id, null, "REGISTER_SUCCESS", clientInfo);

  return { user: toSafeUser(result.user), accessToken, refreshToken, expiresIn: 900 };
}
```

### Route file

```typescript
import { createRouter } from "../../factory.js";
import { setCookie } from "hono/cookie";
import { registerSchema } from "./auth.schema.js";
import * as authService from "./auth.service.js";
import { ValidationError } from "../../lib/errors.js";

const auth = createRouter();

auth.post("/register", async (c) => {
  const body = await c.req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }
  const clientInfo = {
    ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown",
    userAgent: c.req.header("user-agent") ?? "unknown",
  };
  const result = await authService.register(parsed.data, clientInfo);
  setCookie(c, "refreshToken", result.refreshToken, { httpOnly: true, secure: true, path: "/", maxAge: 7 * 24 * 60 * 60 });
  return c.json({ user: result.user, accessToken: result.accessToken, refreshToken: result.refreshToken, expiresIn: result.expiresIn }, 201);
});

export { auth };
```

### Schema file (Zod)

```typescript
import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  username: z.string().min(3).max(50).toLowerCase().trim().regex(/^[a-z0-9_]+$/),
  password: z.string().min(8),
  displayName: z.string().max(100).trim().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
```

### Types file

```typescript
import type { User } from "@prisma/client";

export type SafeUser = Omit<User, "passwordHash" | "failedLoginCount" | "lockedUntil">;

export type AuthResult = {
  user: SafeUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};
```

## Route Mounting (app.ts)

```typescript
// Public routes (no auth)
app.route("/api/v1/auth", auth);  // register, login, refresh

// Protected routes (auth middleware per-route)
app.post("/api/v1/auth/logout", authMiddleware(), async (c) => { ... });
app.get("/api/v1/me", authMiddleware(), async (c) => { ... });
app.get("/api/v1/sessions", authMiddleware(), async (c) => { ... });
app.delete("/api/v1/sessions/:id", authMiddleware(), async (c) => { ... });
app.delete("/api/v1/sessions", authMiddleware(), async (c) => { ... });
```

**IMPORTANT**: Do NOT use `app.route()` for protected routes. Define them directly in `app.ts` with `authMiddleware()` applied. Sub-routers don't inherit parent middleware correctly for error propagation.

## Error Handling

Throw errors from service/route — the global `app.onError(errorHandler)` catches them:

```typescript
throw new ValidationError("Validation failed", fieldErrors);  // 400
throw new AuthenticationError("Invalid credentials");          // 401
throw new ConflictError("Email already registered");           // 409
throw new AppError(423, "ACCOUNT_LOCKED", "Account locked");  // 423
```

Response format:
```json
{ "error": { "code": "ERROR_CODE", "message": "Human-readable" } }
```

## Prisma 7 Gotchas

- **No `url` in schema.prisma** — use `prisma.config.ts` with `datasource.url`
- **Driver adapter required** — `PrismaPg` from `@prisma/adapter-pg`
- **Lazy initialization** — use Proxy pattern for hot reload safety
- **UUID primary keys** — `@id @default(uuid()) @db.Uuid`
- **Snake_case DB tables** — use `@@map("table_name")` and `@map("column_name")`

## Verification Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes (18/18)
- [ ] No password/token hashes in logs or API responses
- [ ] Refresh token hashed in DB (never plaintext)
- [ ] Audit log created for auth events
