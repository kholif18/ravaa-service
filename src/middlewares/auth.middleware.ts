import type { Context, Next } from "hono";
import { verifyAccessToken } from "../lib/jwt.js";
import { AuthenticationError } from "../lib/errors.js";
import { prisma } from "../db/index.js";

export interface AuthContext {
  userId: string;
  sessionId: string;
}

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

export function authMiddleware() {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AuthenticationError("Missing or invalid authorization header");
    }

    const token = authHeader.slice(7);

    try {
      const payload = await verifyAccessToken(token);

      if (!payload.sub || !payload.sid) {
        throw new AuthenticationError("Invalid token payload");
      }

      const session = await prisma.session.findUnique({
        where: { id: payload.sid },
        include: { user: true },
      });

      if (!session) {
        throw new AuthenticationError("Session not found");
      }

      if (session.revokedAt) {
        throw new AuthenticationError("Session revoked");
      }

      if (session.expiresAt < new Date()) {
        throw new AuthenticationError("Session expired");
      }

      if (session.userId !== payload.sub) {
        throw new AuthenticationError("Session user mismatch");
      }

      c.set("auth", {
        userId: payload.sub,
        sessionId: payload.sid,
      });

      await next();
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError("Invalid or expired token");
    }
  };
}
