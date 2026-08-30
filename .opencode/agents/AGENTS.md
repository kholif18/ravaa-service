# Ravaa-Service AI Agent Guide

## Project Overview

Ravaa-Service is the Central Account / Identity Service for the Ravaa ecosystem. It provides authentication, user management, session management, application registration, and audit logging. All Ravaa apps (Drive, Notes, Office) will eventually connect to this service.

- **User language**: The user communicates in Indonesian — respond in Indonesian unless they write in English.
- **Git policy**: NEVER commit/push unless the user explicitly asks ("push ke git", "commit"). When asked, inspect `git status`, stage only intended files, use a concise message matching repo style (`feat:`/`fix:` prefix).

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Hono (lightweight, TypeScript-native)
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL 16 (via Docker)
- **ORM**: Prisma 7 (with `@prisma/adapter-pg` driver adapter)
- **Password Hashing**: Argon2id
- **JWT**: `jose` library (HS256)
- **Validation**: Zod
- **Testing**: Vitest

## Project Structure

```
ravaa-service/
├── .opencode/              # AI agent configuration
├── src/
│   ├── index.ts            # HTTP server entry (Hono + @hono/node-server)
│   ├── app.ts              # Hono app setup, middleware, routes
│   ├── factory.ts          # createRouter() helper + AppEnv type
│   ├── env.ts              # Zod environment validation
│   ├── db/
│   │   └── index.ts        # Prisma singleton (lazy init, driver adapter)
│   ├── lib/
│   │   ├── errors.ts       # AppError, ValidationError, AuthenticationError, etc.
│   │   ├── jwt.ts          # JWT sign/verify, refresh token, token hash
│   │   ├── logger.ts       # Structured logging with sensitive data redaction
│   │   └── password.ts     # Argon2id hash/verify, password validation
│   ├── middlewares/
│   │   ├── auth.middleware.ts         # JWT + session validation
│   │   ├── error-handler.middleware.ts # Global error handler
│   │   └── rate-limit.middleware.ts   # In-memory rate limiter
│   └── modules/
│       ├── auth/
│       │   ├── auth.routes.ts    # POST register, login, refresh
│       │   ├── auth.service.ts   # Auth business logic
│       │   ├── auth.schema.ts    # Zod validation schemas
│       │   └── auth.types.ts     # SafeUser, AuthResult, SessionInfo
│       ├── sessions/
│       │   ├── sessions.service.ts  # List/revoke sessions
│       │   └── sessions.routes.ts   # (unused — routes in app.ts)
│       ├── users/          # (Phase 3+)
│       ├── applications/   # (Phase 4+)
│       └── audit/          # (Phase 3+)
├── prisma/
│   ├── schema.prisma       # Database schema (8 models)
│   └── config.ts           # Prisma 7 config (datasource URL)
├── tests/
│   ├── setup.ts            # Test env setup (dotenv)
│   ├── health.test.ts      # Health endpoint tests
│   ├── health-db.test.ts   # Database health tests
│   └── auth.test.ts        # Auth integration tests (16 tests)
├── deploy/                 # (Phase 5+)
├── Dockerfile              # Multi-stage Node.js build
├── docker-compose.yml      # PostgreSQL 16
├── prisma.config.ts        # Prisma 7 CLI config
├── vitest.config.ts        # Vitest configuration
├── package.json
├── tsconfig.json
└── README.md
```

## Development Rules

### Code Style

- Use TypeScript for all files (strict mode)
- Follow existing patterns in the codebase
- **Verification**: always run `npm run typecheck` after changes — it must pass with 0 errors
- **Verification**: always run `npm test` after changes — all tests must pass

### Code Writing Rules

#### Module Structure Order

```typescript
// 1. Imports (grouped: external, internal libs, relative)
import { z } from "zod";
import { prisma } from "../../db/index.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { ConflictError, AuthenticationError } from "../../lib/errors.js";
import type { RegisterInput } from "./auth.schema.js";
import type { SafeUser, AuthResult } from "./auth.types.js";

// 2. Constants
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;

// 3. Helper functions
function toSafeUser(user: User): SafeUser { ... }

// 4. Exported service functions
export async function register(input: RegisterInput): Promise<AuthResult> { ... }
```

#### File Structure (Routes)

```typescript
// 1. Imports
import { createRouter } from "../../factory.js";
import { setCookie } from "hono/cookie";
import { registerSchema } from "./auth.schema.js";
import * as authService from "./auth.service.js";
import { ValidationError } from "../../lib/errors.js";

// 2. Router creation
const auth = createRouter();

// 3. Route definitions
auth.post("/register", async (c) => {
  const body = await c.req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }
  // ... business logic
  return c.json({ ... }, 201);
});

// 4. Export
export { auth };
```

#### Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Service file | `kebab-case.ts` | `auth.service.ts` |
| Route file | `kebab-case.ts` | `auth.routes.ts` |
| Schema file | `kebab-case.ts` | `auth.schema.ts` |
| Type file | `kebab-case.ts` | `auth.types.ts` |
| Middleware file | `kebab-case.middleware.ts` | `auth.middleware.ts` |
| Function export | `camelCase` | `hashPassword`, `signAccessToken` |
| Type/Interface | `PascalCase` | `SafeUser`, `AuthResult` |
| Constant | `UPPER_SNAKE_CASE` | `MAX_FAILED_ATTEMPTS` |
| Prisma model | `PascalCase` | `User`, `Session`, `AuditLog` |
| DB table | `snake_case` | `users`, `sessions`, `audit_logs` |

#### API Response Pattern

```typescript
// Success
return c.json({ user: safeUser, accessToken, expiresIn: 900 }, 200);
return c.json({ message: "Logged out" }, 200);
return c.json({ sessions: sessionList }, 200);

// Error (throw — handled by errorHandler)
throw new ValidationError("Validation failed", fieldErrors);
throw new AuthenticationError("Invalid credentials");
throw new ConflictError("Email already registered");
throw new NotFoundError("Session");
throw new AppError(423, "ACCOUNT_LOCKED", "Account is temporarily locked");
```

#### Error Response Format

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": { "field": ["error message"] }
  }
}
```

Available error codes: `VALIDATION_ERROR`, `AUTHENTICATION_ERROR`, `AUTHORIZATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMIT`, `ACCOUNT_LOCKED`, `INTERNAL_SERVER_ERROR`.

### Middleware Order (app.ts)

```typescript
// 1. Error handler (app.onError)
app.onError(errorHandler);

// 2. CORS
app.use("*", cors());

// 3. Rate limiting (skipped in test)
if (process.env.NODE_ENV !== "test") {
  app.use("/api/*", rateLimit({ windowMs: 60_000, maxRequests: 100 }));
  app.use("/api/v1/auth/*", rateLimit({ windowMs: 60_000, maxRequests: 20 }));
}

// 4. Public routes (no auth)
app.route("/api/v1/auth", auth);  // register, login, refresh

// 5. Protected routes (auth middleware applied per-route)
app.post("/api/v1/auth/logout", authMiddleware(), async (c) => { ... });
app.get("/api/v1/me", authMiddleware(), async (c) => { ... });
app.get("/api/v1/sessions", authMiddleware(), async (c) => { ... });
app.delete("/api/v1/sessions/:id", authMiddleware(), async (c) => { ... });
app.delete("/api/v1/sessions", authMiddleware(), async (c) => { ... });

// 6. 404 handler
app.notFound((c) => { ... });
```

**IMPORTANT**: Do NOT use `app.route()` for protected routes. Define them directly in `app.ts` with `authMiddleware()` applied. Sub-routers don't inherit parent middleware correctly for error propagation.

### Environment Variables

```env
NODE_ENV=development          # development | production | test
PORT=3000
DATABASE_URL=postgresql://ravaa:ravaa_dev_password@localhost:5432/ravaa_service
JWT_SECRET=change-this-development-secret
JWT_REFRESH_SECRET=change-this-development-refresh-secret
```

- Never hardcode credentials in source code
- `.env` is gitignored — never commit it
- Use `.env.example` as template

### Prisma 7 Configuration

Prisma 7 requires `prisma.config.ts` (NOT `url` in `schema.prisma`):

```typescript
// prisma.config.ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
```

Client initialization uses driver adapter:

```typescript
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
```

### Database Schema (8 Models)

- **User**: id (UUID), email (unique), username (unique), passwordHash, displayName, avatarUrl, status (active/suspended/pending), emailVerifiedAt, failedLoginCount, lockedUntil
- **Session**: id (UUID), userId, refreshTokenHash, deviceName, deviceType, ipAddress, userAgent, lastActiveAt, expiresAt, revokedAt
- **Application**: id (UUID), name, slug (unique), clientId (unique), clientSecretHash, redirectUris, status (active/inactive/suspended)
- **ApplicationScope**: id (UUID), applicationId, scope, description
- **UserApplicationAccess**: id (UUID), userId, applicationId, scopes[], grantedAt, revokedAt — unique(userId, applicationId)
- **PasswordReset**: id (UUID), userId, tokenHash, expiresAt, usedAt
- **EmailVerification**: id (UUID), userId, tokenHash, expiresAt, verifiedAt
- **AuditLog**: id (UUID), userId (nullable), applicationId (nullable), action, ipAddress, userAgent, metadata (JSONB)

### Authentication Flow

```
Register:
  validate → normalize → check email → check username → hash password → create user → create session → sign JWT → return

Login:
  validate → find user → check lock → verify password → reset failedCount → create session → sign JWT → return

Refresh:
  hash token → lookup session → check revoked → check expired → check user active → revoke old → create new session → sign JWT → return

Logout:
  find session → set revokedAt → return
```

### JWT Configuration

- Algorithm: HS256
- TTL: 15 minutes
- Issuer: `ravaa-service`
- Audience: `ravaa`
- Payload: `{ sub: userId, sid: sessionId, iat, exp }`
- Secret from: `JWT_SECRET` env

### Refresh Token

- 48-byte cryptographically secure random (base64url encoded)
- SHA-256 hashed before storing in database
- 7-day expiry
- Rotated on every refresh (old token revoked)
- Token reuse detection → session revoked

### Security Rules

#### Password
- Argon2id (memoryCost: 65536, timeCost: 3, parallelism: 4)
- Minimum 8 characters
- NEVER: store plaintext, log, return in API response, include in JWT

#### Tokens
- Refresh token: client gets plaintext, DB stores hash
- Password reset: client gets plaintext, DB stores hash
- Email verification: client gets plaintext, DB stores hash

#### JWT
- Short-lived (15 min)
- Secret from ENV only
- Signature, expiration, issuer, audience all validated

#### Sessions
- Revocable (set `revokedAt`)
- User-isolated (userId check)
- Expiry checked on every auth middleware pass

### Audit Logging

Log these events: `REGISTER_SUCCESS`, `LOGIN_SUCCESS`, `LOGIN_FAILED`, `ACCOUNT_LOCKED`, `LOGOUT`, `LOGOUT_ALL`, `SESSION_REVOKED`, `TOKEN_REFRESH`, `TOKEN_REUSE_DETECTED`.

Store: userId, applicationId (nullable), action, ipAddress, userAgent.

NEVER store: password, passwordHash, accessToken, refreshToken, refreshTokenHash.

### Account Lock

- 5 failed login attempts → temporary lock
- Lock duration: 15 minutes
- On success: reset failedLoginCount and lockedUntil
- Response during lock: HTTP 423 with `ACCOUNT_LOCKED` code

### Rate Limiting

- Global: 100 requests/minute per IP
- Auth endpoints: 20 requests/minute per IP
- Implementation: in-memory (not suitable for multi-instance production)
- Disabled in test environment (`NODE_ENV=test`)

### Testing

- Framework: Vitest
- Test files in `tests/` directory
- Run: `npm test`
- Database tests require running PostgreSQL
- Tests clean up after themselves (deleteMany in beforeEach/afterAll)
- Env loaded via `vitest.config.ts` (dotenv)

#### Test Structure

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db/index.js";

beforeAll(async () => { await prisma.user.deleteMany({}); });
afterAll(async () => { await prisma.user.deleteMany({}); await prisma.$disconnect(); });
beforeEach(async () => { await prisma.user.deleteMany({}); });

describe("POST /api/v1/auth/register", () => {
  it("registers a new user successfully", async () => {
    const res = await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", username: "test", password: "password123" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.accessToken).toBeDefined();
  });
});
```

## Common Commands

```bash
# Development
docker compose up -d db          # Start PostgreSQL
npm install                      # Install dependencies
npx prisma generate              # Generate Prisma client
npx prisma migrate dev           # Run migrations
npm run dev                      # Start dev server

# Verification (run after every change)
npm run typecheck                # Type check — MUST pass
npm run build                    # Build — MUST pass
npm test                         # Tests — MUST pass

# Database
npx prisma db push               # Push schema without migration
npx prisma studio                # Database GUI
npx prisma migrate dev --name X  # Create new migration

# Production
npm run build
npm start
```

## API Endpoints (Phase 2)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check |
| GET | `/health/db` | No | Database health check |
| POST | `/api/v1/auth/register` | No | Register new user |
| POST | `/api/v1/auth/login` | No | Login |
| POST | `/api/v1/auth/refresh` | No | Refresh access token |
| POST | `/api/v1/auth/logout` | Yes | Logout (revoke session) |
| GET | `/api/v1/me` | Yes | Get current user |
| GET | `/api/v1/sessions` | Yes | List user sessions |
| DELETE | `/api/v1/sessions/:id` | Yes | Revoke single session |
| DELETE | `/api/v1/sessions` | Yes | Revoke all sessions |

## Troubleshooting

### Prisma 7 "url not supported"
- Ensure `prisma.config.ts` exists with `datasource.url`
- Ensure `schema.prisma` does NOT have `url` in `datasource db`

### Prisma "client password must be a string"
- `DATABASE_URL` not loaded — check `.env` file exists and `dotenv` is loaded
- In tests: check `vitest.config.ts` loads dotenv

### Rate limit (429) during tests
- Rate limiter is disabled when `NODE_ENV=test`
- Check `vitest.config.ts` sets `env: { NODE_ENV: "test" }`

### Auth middleware returns 500
- Ensure `app.onError(errorHandler)` is set (NOT `app.use("*", errorHandler())`)
- Ensure auth routes use `authMiddleware()` per-route, not via `app.route()`

### Token reuse detected
- Refresh token rotation revokes old token
- Using the old token after rotation triggers reuse detection
- Session is revoked and new refresh is rejected
- This is correct behavior — client must use the new refresh token

### Database connection issues
```bash
docker compose up -d db          # Start PostgreSQL
docker compose ps                # Check status
docker compose logs db           # Check logs
npx prisma migrate dev           # Run migrations
```

## Phases

- **Phase 1** ✅: Foundation (Hono, Prisma, PostgreSQL, Health endpoints, Error handling)
- **Phase 2** ✅: Authentication (Register, Login, JWT, Refresh, Sessions, Logout, Audit)
- **Phase 3** ⏳: OpenAPI + Documentation
- **Phase 4** ⏳: Application Registration + Client Management
- **Phase 5** ⏳: Permission Foundation
- **Phase 6** ⏳: Integration with Ravaa Drive
