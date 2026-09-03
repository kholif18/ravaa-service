import { createRouter } from "../../factory.js";
import { appAuthMiddleware } from "../../middlewares/app-auth.middleware.js";
import { rateLimit } from "../../middlewares/rate-limit.middleware.js";
import { ValidationError } from "../../lib/errors.js";
import { introspectSchema, authCheckSchema } from "./internal.schema.js";
import * as internalService from "./internal.service.js";
import { prisma } from "../../db/index.js";

const internal = createRouter();

// POST /api/v1/internal/sessions/introspect
// Auth: Basic client credentials + scope session:introspect
// Rate limit: 60/min per IP (via keyGenerator default = x-forwarded-for)
internal.post(
  "/sessions/introspect",
  rateLimit({ windowMs: 60_000, maxRequests: 60 }),
  appAuthMiddleware("session:introspect"),
  async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = introspectSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }

    const { userId, sessionId } = parsed.data;

    const result = await internalService.introspectSession(userId, sessionId);

    // Audit log — never log secrets
    const clientApp = c.get("clientApp");
    try {
      await prisma.auditLog.create({
        data: {
          userId: null,
          applicationId: clientApp.applicationId,
          action: "SESSION_INTROSPECT",
          ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown",
          userAgent: c.req.header("user-agent") ?? "unknown",
          metadata: {
            userId,
            sessionId,
            result: result.valid ? "VALID" : "REVOKED",
          },
        },
      });
    } catch {
      // audit failure should not block response
    }

    if (result.valid) {
      return c.json({ valid: true, userId: result.userId, sessionId: result.sessionId });
    }

    return c.json({ valid: false, reason: "REVOKED" });
  },
);

// POST /api/v1/internal/authorization/check — READ-ONLY S2S (7.10-1)
// Auth: Basic + scope authorization:read
internal.post(
  "/authorization/check",
  rateLimit({ windowMs: 60_000, maxRequests: 60 }),
  appAuthMiddleware("authorization:read"),
  async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = authCheckSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }

    const result = await internalService.checkAuthorization(parsed.data);

    // Audit — minimal, no secrets
    const clientApp = c.get("clientApp");
    try {
      await prisma.auditLog.create({
        data: {
          userId: null,
          applicationId: clientApp.applicationId,
          action: "AUTHORIZATION_CHECK",
          ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown",
          userAgent: c.req.header("user-agent") ?? "unknown",
          metadata: {
            principalType: parsed.data.principalType,
            principalId: parsed.data.principalId,
            permission: parsed.data.permission,
            resourceType: parsed.data.resourceType ?? null,
            resourceId: parsed.data.resourceId ?? null,
            result: result.allowed ? "ALLOW" : "DENY",
            reason: result.reason,
          },
        },
      });
    } catch {
      // audit failure should not block
    }

    return c.json({ allowed: result.allowed, reason: result.reason });
  },
);

export { internal };
