import type { Context, Next } from "hono";
import { prisma } from "../db/index.js";
import { AuthorizationError, AuthenticationError } from "../lib/errors.js";

export interface AdminContext {
  userId: string;
  sessionId: string;
  role: string;
}

declare module "hono" {
  interface ContextVariableMap {
    admin: AdminContext;
  }
}

export function requireAdmin() {
  return async (c: Context, next: Next) => {
    const auth = c.get("auth");

    if (!auth) {
      throw new AuthenticationError("Authentication required");
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { role: true, status: true },
    });

    if (!user) {
      throw new AuthenticationError("User not found");
    }

    if (user.status !== "active" && user.status !== "pending") {
      throw new AuthenticationError("Account is not active");
    }

    if (user.role !== "ADMIN") {
      throw new AuthorizationError("Administrator privileges required");
    }

    c.set("admin", {
      userId: auth.userId,
      sessionId: auth.sessionId,
      role: user.role,
    });

    await next();
  };
}
