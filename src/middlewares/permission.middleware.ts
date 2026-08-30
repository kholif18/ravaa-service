import type { Context, Next } from "hono";
import { authorize, logAuthorizationDenial, type ResourceIdentifier } from "../lib/authorization.js";
import { AuthenticationError, AppError } from "../lib/errors.js";

export interface PermissionContext {
  userId: string;
  sessionId: string;
  applicationId?: string;
}

declare module "hono" {
  interface ContextVariableMap {
    permission: PermissionContext;
  }
}

type ResourceExtractor = (c: Context) => ResourceIdentifier | Promise<ResourceIdentifier | null> | null;

export function requirePermission(permission: string, resourceExtractor?: ResourceExtractor) {
  return async (c: Context, next: Next) => {
    const auth = c.get("auth");

    if (!auth) {
      throw new AuthenticationError("Authentication required");
    }

    const clientInfo = {
      ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown",
      userAgent: c.req.header("user-agent") ?? "unknown",
    };

    // Extract resource if extractor provided
    let resource: ResourceIdentifier | null = null;
    if (resourceExtractor) {
      resource = await resourceExtractor(c);
    }

    // Authorize
    const result = await authorize({
      principalType: "USER",
      principalId: auth.userId,
      permission,
      resource: resource ?? undefined,
    });

    if (!result.allowed) {
      await logAuthorizationDenial(
        {
          principalType: "USER",
          principalId: auth.userId,
          permission,
          resource: resource ?? undefined,
        },
        result,
        clientInfo,
      );

      throw new AppError(403, "INSUFFICIENT_PERMISSION", "You do not have permission to perform this action");
    }

    c.set("permission", {
      userId: auth.userId,
      sessionId: auth.sessionId,
    });

    await next();
  };
}

export function requireAnyPermission(...permissions: string[]) {
  return async (c: Context, next: Next) => {
    const auth = c.get("auth");

    if (!auth) {
      throw new AuthenticationError("Authentication required");
    }

    // Check if user has any of the required permissions
    for (const permission of permissions) {
      const result = await authorize({
        principalType: "USER",
        principalId: auth.userId,
        permission,
      });

      if (result.allowed) {
        c.set("permission", {
          userId: auth.userId,
          sessionId: auth.sessionId,
        });
        await next();
        return;
      }
    }

    throw new AppError(403, "INSUFFICIENT_PERMISSION", "You do not have permission to perform this action");
  };
}
