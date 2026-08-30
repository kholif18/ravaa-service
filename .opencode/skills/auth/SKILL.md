---
name: auth
description: Reference for the authentication system in Ravaa-Service — JWT access tokens, refresh token rotation, session management, password hashing, account lockout. Use when working on login, register, logout, refresh, auth middleware, or session handling. Triggers on "auth", "login", "register", "jwt", "refresh token", "session", "password", "logout".
---

# Authentication System Reference

Read `src/modules/auth/` and `src/lib/jwt.ts` and `src/lib/password.ts` first.

## Architecture

```
Client
  │
  ├── Register/Login → auth.service.ts → prisma → DB
  │                              │
  │                              ├── hashPassword (Argon2id)
  │                              ├── signAccessToken (JWT HS256, 15min)
  │                              ├── signRefreshToken (48-byte crypto random)
  │                              └── hashToken (SHA-256 for DB storage)
  │
  ├── Auth Middleware → auth.middleware.ts
  │         │
  │         ├── verifyAccessToken (jose)
  │         ├── prisma.session.findUnique (validate session)
  │         └── c.set("auth", { userId, sessionId })
  │
  └── Refresh → auth.service.ts
            │
            ├── hashToken → lookup session
            ├── check: not revoked, not expired, user active
            ├── revoke old session
            ├── create new session
            └── sign new JWT
```

## Password Hashing (`src/lib/password.ts`)

- **Algorithm**: Argon2id (memory: 65536, time: 3, parallelism: 4)
- **Functions**: `hashPassword(password)`, `verifyPassword(password, hash)`, `validatePassword(password)`
- **Rules**: min 8 chars, never logged, never returned in API, never in JWT

## JWT (`src/lib/jwt.ts`)

- **Algorithm**: HS256
- **TTL**: 15 minutes
- **Issuer**: `ravaa-service`
- **Audience**: `ravaa`
- **Payload**: `{ sub: userId, sid: sessionId, iat, exp }`
- **Functions**: `signAccessToken(userId, sessionId)`, `verifyAccessToken(token)`
- **Secret**: from `JWT_SECRET` env (min 16 chars)

## Refresh Token

- **Generation**: `signRefreshToken()` → 48-byte `crypto.randomBytes` → base64url
- **Storage**: SHA-256 hash stored in `sessions.refreshTokenHash`
- **Rotation**: every refresh revokes old session, creates new one
- **Reuse detection**: if revoked token is used → revoke entire session → return 401
- **Expiry**: 7 days (`sessions.expiresAt`)

## Session Management

```
Session lifecycle:
  created (register/login)
    ↓
  active (JWT valid, not revoked)
    ↓
  rotated (refresh → old revoked, new created)
    ↓
  revoked (logout, reuse detection, manual revoke)
```

**Never delete sessions** — set `revokedAt` for audit history.

## Account Lock

- Field: `users.failedLoginCount`, `users.lockedUntil`
- Threshold: 5 failed attempts → lock for 15 minutes
- On success: reset both fields
- During lock: HTTP 423 `ACCOUNT_LOCKED`

## Auth Middleware (`src/middlewares/auth.middleware.ts`)

```typescript
// Applied per-route in app.ts
app.get("/api/v1/me", authMiddleware(), async (c) => {
  const auth = c.get("auth");  // { userId, sessionId }
  // ...
});
```

Checks:
1. `Authorization: Bearer <token>` header
2. JWT signature valid
3. JWT not expired
4. Session exists in DB
5. Session not revoked
6. Session not expired
7. Session userId matches JWT sub

## Client Info Extraction

```typescript
const clientInfo = {
  ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown",
  userAgent: c.req.header("user-agent") ?? "unknown",
};
```

For production behind Nginx: configure trusted proxy and use `X-Forwarded-For` properly.

## Cookie Configuration

```typescript
setCookie(c, "refreshToken", token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
  path: "/",
  maxAge: 7 * 24 * 60 * 60,  // 7 days
});
```

## Audit Events

| Event | When |
|-------|------|
| `REGISTER_SUCCESS` | User registered |
| `LOGIN_SUCCESS` | Login successful |
| `LOGIN_FAILED` | Wrong password |
| `ACCOUNT_LOCKED` | Account locked (5 failures) |
| `LOGOUT` | Session revoked |
| `LOGOUT_ALL` | All sessions revoked |
| `TOKEN_REFRESH` | Refresh token rotated |
| `TOKEN_REUSE_DETECTED` | Revoked token reused |

## Security Rules

- Password: Argon2id, never plaintext/logged/returned
- Refresh token: plaintext to client, SHA-256 hash in DB
- JWT: short-lived (15min), secret from ENV only
- Sessions: revocable, user-isolated, expiry checked
- Login: rate limited, generic errors (no user enumeration)

## Common Mistakes

1. **Forgetting `authMiddleware()`** on protected routes → 500 (undefined userId)
2. **Using `app.route()` for protected routes** → auth context not available
3. **Not hashing refresh token** → security vulnerability
4. **Not implementing token reuse detection** → stolen tokens work forever
5. **Logging sensitive data** → audit log should not contain tokens/hashes
