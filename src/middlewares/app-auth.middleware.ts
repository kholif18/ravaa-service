import type { Context, Next } from "hono";
import { AppError } from "../lib/errors.js";
import * as applicationsService from "../modules/applications/applications.service.js";
import { prisma } from "../db/index.js";

export interface AppAuthContext {
  applicationId: string;
  clientId: string;
}

declare module "hono" {
  interface ContextVariableMap {
    clientApp: AppAuthContext;
  }
}

/**
 * Application Basic Auth middleware (server-to-server).
 * Expects: Authorization: Basic base64(clientId:clientSecret)
 * Verifies via verifyClientCredentials (SHA256 hash check) + status active.
 * Does NOT log credentials.
 */
export function appAuthMiddleware(requiredScope?: string) {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Basic ")) {
      return c.json(
        { error: { code: "INVALID_CLIENT", message: "Invalid client credentials" } },
        401,
        { "WWW-Authenticate": 'Basic realm="Ravaa Service"' },
      );
    }

    let decoded: string;
    try {
      const b64 = authHeader.slice(6).trim();
      decoded = Buffer.from(b64, "base64").toString("utf-8");
    } catch {
      return c.json(
        { error: { code: "INVALID_CLIENT", message: "Invalid client credentials" } },
        401,
        { "WWW-Authenticate": 'Basic realm="Ravaa Service"' },
      );
    }

    const sepIdx = decoded.indexOf(":");
    if (sepIdx === -1) {
      return c.json(
        { error: { code: "INVALID_CLIENT", message: "Invalid client credentials" } },
        401,
        { "WWW-Authenticate": 'Basic realm="Ravaa Service"' },
      );
    }

    const clientId = decoded.slice(0, sepIdx);
    const clientSecret = decoded.slice(sepIdx + 1);

    if (!clientId || !clientSecret) {
      return c.json(
        { error: { code: "INVALID_CLIENT", message: "Invalid client credentials" } },
        401,
        { "WWW-Authenticate": 'Basic realm="Ravaa Service"' },
      );
    }

    try {
      const app = await applicationsService.verifyClientCredentials(clientId, clientSecret);

      if (requiredScope) {
        const scope = await prisma.applicationScope.findUnique({
          where: { applicationId_scope: { applicationId: app.id, scope: requiredScope } },
        });
        if (!scope) {
          throw new AppError(403, "FORBIDDEN", `Missing scope ${requiredScope}`);
        }
      }

      c.set("clientApp", {
        applicationId: app.id,
        clientId: app.clientId,
      });

      await next();
    } catch (error) {
      if (error instanceof AppError) {
        const status = error.statusCode as 401 | 403;
        if (status === 401) {
          return c.json(
            { error: { code: error.code, message: error.message } },
            401,
            { "WWW-Authenticate": 'Basic realm="Ravaa Service"' },
          );
        }
        throw error;
      }
      throw error;
    }
  };
}
