---
name: security
description: Reference for security practices in Ravaa-Service — password hashing, token management, session security, audit logging, rate limiting, input validation. Use when implementing auth features, reviewing security, or hardening the API. Triggers on "security", "password", "token", "session", "audit", "rate limit", "validation".
---

# Security Reference

## Password Security

### Storage

- **Algorithm**: Argon2id (memory: 65536, time: 3, parallelism: 4)
- **Never**: store plaintext, log, return in API, include in JWT, put in audit metadata

### Validation

- Minimum 8 characters
- No maximum (let users use passphrases)
- No complexity rules (they reduce security)

### Hashing (`src/lib/password.ts`)

```typescript
import { hashPassword, verifyPassword, validatePassword } from "../lib/password.js";

const hash = await hashPassword("user-password");  // Argon2id
const valid = await verifyPassword("user-password", hash);  // true/false
```

## Token Security

### Access Token (JWT)

- **Algorithm**: HS256
- **TTL**: 15 minutes
- **Payload**: `{ sub: userId, sid: sessionId, iat, exp }`
- **Never include**: password, email, passwordHash, sensitive data
- **Secret**: from `JWT_SECRET` env (min 16 chars)

### Refresh Token

- **Generation**: `crypto.randomBytes(48)` → base64url (64 chars)
- **Storage**: SHA-256 hash in `sessions.refreshTokenHash`
- **Rotation**: every refresh revokes old, creates new
- **Reuse detection**: revoked token reuse → session revoked → 401
- **Expiry**: 7 days

### Password Reset Token (future)

- Same pattern as refresh token
- Client gets plaintext, DB stores hash
- Short TTL (1 hour)

## Session Security

### Lifecycle

```
created → active → rotated → revoked
```

### Rules

- Revocable (set `revokedAt`, never delete)
- User-isolated (userId check on every access)
- Expiry checked (JWT + session level)
- Device tracking (name, type, IP, user agent)

### Logout

- Single session: set `revokedAt`
- All sessions: `updateMany` with `revokedAt = now()`

## Input Validation

### Zod schemas

```typescript
const schema = z.object({
  email: z.string().email().toLowerCase().trim(),
  username: z.string().min(3).max(50).regex(/^[a-z0-9_]+$/),
  password: z.string().min(8),
});
```

### Normalize before validation

- Email: lowercase, trim
- Username: lowercase, trim
- Identifiers: lowercase, trim

### Validate early

```typescript
const parsed = schema.safeParse(body);
if (!parsed.success) {
  throw new ValidationError("Failed", parsed.error.flatten().fieldErrors);
}
```

## Rate Limiting

### Configuration

- Global: 100 requests/minute per IP
- Auth endpoints: 20 requests/minute per IP
- Disabled in test environment

### Implementation

- In-memory (Map with expiry)
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- 429 response with `Retry-After` header

### Limitations

- Not suitable for multi-instance production
- Reset on server restart
- IP-based (can be bypassed with proxies)

## Audit Logging

### Events to log

| Event | Description |
|-------|-------------|
| `REGISTER_SUCCESS` | User registered |
| `LOGIN_SUCCESS` | Login successful |
| `LOGIN_FAILED` | Wrong password |
| `ACCOUNT_LOCKED` | Account locked |
| `LOGOUT` | Session revoked |
| `LOGOUT_ALL` | All sessions revoked |
| `TOKEN_REFRESH` | Token rotated |
| `TOKEN_REUSE_DETECTED` | Security event |

### What to store

```typescript
{
  userId: string,
  applicationId: string | null,
  action: string,
  ipAddress: string,
  userAgent: string,
  metadata: Json  // optional, non-sensitive data only
}
```

### What NEVER to store

- Passwords
- Password hashes
- Access tokens
- Refresh tokens
- Refresh token hashes
- Client secrets
- JWT secrets

## Error Messages

### Generic messages (no user enumeration)

```
"Invalid credentials"     (not "User not found" or "Wrong password")
"Session not found"       (not "Session doesn't belong to this user")
"Resource not found"      (generic for 404)
```

### Detailed messages (for developers)

```
"Validation failed"       (with field-specific errors in details)
"Email already registered" (conflict is safe to disclose)
```

## Cookie Security

```typescript
{
  httpOnly: true,           // No JavaScript access
  secure: true,             // HTTPS only (production)
  sameSite: "strict",       // CSRF protection
  path: "/",                // Consistent across routes
  maxAge: 7 * 24 * 60 * 60 // 7 days
}
```

## Environment Security

- Never commit `.env`
- Use `.env.example` as template
- Secrets in ENV only (never hardcoded)
- Different secrets for dev/production

## Common Vulnerabilities to Avoid

1. **User enumeration** — don't reveal if email/username exists
2. **Token leakage** — never log tokens, never return in error responses
3. **Weak hashing** — use Argon2id, not MD5/SHA1/bcrypt
4. **Missing rate limiting** — brute force attacks
5. **No session revocation** — stolen tokens work forever
6. **Sensitive data in logs** — passwords, tokens, hashes
7. **CORS misconfiguration** — restrict origins in production
8. **SQL injection** — use Prisma parameterized queries (never raw SQL with user input)

## Security Checklist

- [ ] Passwords hashed with Argon2id
- [ ] Refresh tokens hashed (SHA-256) in DB
- [ ] JWT secret from ENV only
- [ ] Rate limiting on auth endpoints
- [ ] Generic error messages (no user enumeration)
- [ ] Audit logging for auth events
- [ ] No sensitive data in logs
- [ ] Cookie security flags set
- [ ] Input validation with Zod
- [ ] Session revocation on logout
