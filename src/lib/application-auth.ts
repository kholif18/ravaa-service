import { prisma } from "../db/index.js";
import { createHash } from "node:crypto";
import { AppError } from "./errors.js";
import type { SafeApplication } from "../modules/applications/applications.types.js";

function hashClientSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function toSafeApplication(app: { id: string; name: string; slug: string; clientId: string; redirectUris: string[]; status: string; createdAt: Date; updatedAt: Date }): SafeApplication {
  return {
    id: app.id,
    name: app.name,
    slug: app.slug,
    clientId: app.clientId,
    redirectUris: app.redirectUris,
    status: app.status as SafeApplication["status"],
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  };
}

export interface ApplicationAuthResult {
  application: SafeApplication;
}

export async function authenticateApplication(clientId: string, clientSecret: string): Promise<ApplicationAuthResult> {
  if (!clientId || !clientSecret) {
    throw new AppError(401, "INVALID_CLIENT", "Client credentials required");
  }

  const application = await prisma.application.findUnique({
    where: { clientId },
  });

  if (!application) {
    throw new AppError(401, "INVALID_CLIENT", "Invalid client credentials");
  }

  if (application.status !== "active") {
    throw new AppError(401, "APPLICATION_DISABLED", "Application is not active");
  }

  const providedHash = hashClientSecret(clientSecret);
  if (providedHash !== application.clientSecretHash) {
    throw new AppError(401, "INVALID_CLIENT", "Invalid client credentials");
  }

  return {
    application: toSafeApplication(application),
  };
}

export async function verifyApplicationScope(applicationId: string, requiredScope: string): Promise<boolean> {
  const scope = await prisma.applicationScope.findUnique({
    where: { applicationId_scope: { applicationId, scope: requiredScope } },
  });

  return scope !== null;
}

export async function getUserApplicationAccess(userId: string, applicationId: string): Promise<{ hasAccess: boolean; scopes: string[] }> {
  const access = await prisma.userApplicationAccess.findUnique({
    where: { userId_applicationId: { userId, applicationId } },
  });

  if (!access || access.revokedAt) {
    return { hasAccess: false, scopes: [] };
  }

  return {
    hasAccess: true,
    scopes: access.scopes,
  };
}
