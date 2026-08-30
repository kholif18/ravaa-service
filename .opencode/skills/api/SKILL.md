---
name: api
description: Reference for API design patterns in Ravaa-Service — Hono routes, validation, error handling, middleware, rate limiting. Use when creating new endpoints, modifying routes, or working on API responses. Triggers on "api route", "endpoint", "hono", "validation", "error response", "rate limit".
---

# API Design Reference

## Framework: Hono

Hono is a lightweight TypeScript web framework. Key differences from Express:

- **No `req.body`** — use `await c.req.json()`
- **No `res.json()`** — use `return c.json(data, status)`
- **Context (`c`)** — carries request/response through middleware chain
- **Typed context** — use `AppEnv` type for type-safe `c.get()`/`c.set()`

## Route Patterns

### Public route

```typescript
auth.post("/login", async (c) => {
  const body = await c.req.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }
  const result = await authService.login(parsed.data, clientInfo);
  return c.json({ user: result.user, accessToken: result.accessToken, expiresIn: 900 });
});
```

### Protected route (in app.ts)

```typescript
app.get("/api/v1/me", authMiddleware(), async (c) => {
  const auth = c.get("auth");
  const user = await authService.getCurrentUser(auth.userId);
  return c.json({ user });
});
```

### Route with URL params

```typescript
app.delete("/api/v1/sessions/:id", authMiddleware(), async (c) => {
  const sessionId = c.req.param("id") as string;  // cast for strict mode
  await sessionsService.revokeSession(sessionId, authCtx.userId);
  return c.json({ message: "Session revoked" });
});
```

## Validation (Zod)

Schema file pattern:

```typescript
import { z } from "zod";

export const loginSchema = z.object({
  identifier: z.string().min(1).trim().toLowerCase(),
  password: z.string().min(1),
  deviceName: z.string().max(100).trim().optional(),
  deviceType: z.enum(["web", "mobile", "desktop", "api"]).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
```

Route validation:

```typescript
const body = await c.req.json();
const parsed = loginSchema.safeParse(body);
if (!parsed.success) {
  throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
}
// parsed.data is fully typed
```

## Error Response Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "email": ["Invalid email"],
      "password": ["String must contain at least 8 character(s)"]
    }
  }
}
```

### Error codes

| Code | Status | When |
|------|--------|------|
| `VALIDATION_ERROR` | 400 | Zod validation failed |
| `AUTHENTICATION_ERROR` | 401 | Invalid credentials, expired token |
| `AUTHORIZATION_ERROR` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Duplicate email/username |
| `RATE_LIMIT` | 429 | Too many requests |
| `ACCOUNT_LOCKED` | 423 | Account temporarily locked |
| `INTERNAL_SERVER_ERROR` | 500 | Unhandled error |

### Custom error classes (`src/lib/errors.ts`)

```typescript
throw new ValidationError("Failed", fieldErrors);      // 400
throw new AuthenticationError("Invalid credentials");   // 401
throw new AuthorizationError("Insufficient permissions"); // 403
throw new NotFoundError("Session");                     // 404
throw new ConflictError("Email already registered");    // 409
throw new AppError(423, "ACCOUNT_LOCKED", "Locked");   // custom
```

## Middleware

### Global (app.ts)

```typescript
app.onError(errorHandler);  // MUST be first
app.use("*", cors());
```

### Rate limiting

```typescript
if (process.env.NODE_ENV !== "test") {
  app.use("/api/*", rateLimit({ windowMs: 60_000, maxRequests: 100 }));
  app.use("/api/v1/auth/*", rateLimit({ windowMs: 60_000, maxRequests: 20 }));
}
```

### Auth (per-route)

```typescript
app.get("/api/v1/me", authMiddleware(), handler);
```

## Response Patterns

### Success

```typescript
// 200 OK
return c.json({ user: safeUser });

// 201 Created
return c.json({ user, accessToken, refreshToken, expiresIn: 900 }, 201);

// 200 with message
return c.json({ message: "Logged out" });

// 200 with list
return c.json({ sessions: sessionList });
```

### Error (throw)

```typescript
throw new ValidationError("Failed", errors);   // 400
throw new AuthenticationError("Invalid");       // 401
throw new ConflictError("Duplicate");           // 409
```

## Cookie Management

```typescript
import { setCookie, deleteCookie } from "hono/cookie";

// Set
setCookie(c, "refreshToken", token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
  path: "/",
  maxAge: 7 * 24 * 60 * 60,
});

// Delete
deleteCookie(c, "refreshToken", { path: "/" });
```

## Testing Routes

```typescript
import { app } from "../src/app.js";

const res = await app.request("/api/v1/auth/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "test@example.com", username: "test", password: "password123" }),
});

expect(res.status).toBe(201);
const body = await res.json();
expect(body.accessToken).toBeDefined();
```

## Common Mistakes

1. **Using `app.route()` for protected routes** → auth middleware not inherited
2. **Forgetting `as string` on `c.req.param()`** → TypeScript strict error
3. **Not disabling rate limit in tests** → 429 errors in test suite
4. **Returning sensitive data** → never return passwordHash, refreshTokenHash
5. **Missing `app.onError(errorHandler)`** → errors return 500 instead of proper status
