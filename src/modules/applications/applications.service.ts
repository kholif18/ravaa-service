import { prisma } from "../../db/index.js";
import { createHash, randomBytes } from "node:crypto";
import { ConflictError, NotFoundError, AppError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import type { CreateApplicationInput, UpdateApplicationInput } from "./applications.schema.js";
import type { SafeApplication, ApplicationWithSecret, ApplicationScopeInfo, UserApplicationAccessInfo, RotateSecretResult } from "./applications.types.js";

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

function generateClientId(slug: string): string {
  const random = randomBytes(16).toString("hex");
  return `${slug}_${random}`;
}

function generateClientSecret(): string {
  return randomBytes(32).toString("base64url");
}

function hashClientSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export async function createApplication(input: CreateApplicationInput, userId: string, clientInfo: { ipAddress: string; userAgent: string }): Promise<ApplicationWithSecret> {
  const existingSlug = await prisma.application.findUnique({ where: { slug: input.slug } });
  if (existingSlug) {
    throw new ConflictError("Application with this slug already exists");
  }

  const clientId = generateClientId(input.slug);
  const clientSecret = generateClientSecret();
  const clientSecretHash = hashClientSecret(clientSecret);

  const application = await prisma.application.create({
    data: {
      name: input.name,
      slug: input.slug,
      clientId,
      clientSecretHash,
      redirectUris: input.redirectUris,
      status: "active",
    },
  });

  await logAudit(userId, application.id, "APPLICATION_CREATED", clientInfo);

  return {
    ...toSafeApplication(application),
    clientSecret,
  };
}

export async function listApplications(): Promise<SafeApplication[]> {
  const applications = await prisma.application.findMany({
    orderBy: { createdAt: "desc" },
  });

  return applications.map(toSafeApplication);
}

export async function getApplication(applicationId: string): Promise<SafeApplication> {
  const application = await prisma.application.findUnique({ where: { id: applicationId } });

  if (!application) {
    throw new NotFoundError("Application");
  }

  return toSafeApplication(application);
}

export async function getApplicationByClientId(clientId: string): Promise<SafeApplication> {
  const application = await prisma.application.findUnique({ where: { clientId } });

  if (!application) {
    throw new NotFoundError("Application");
  }

  return toSafeApplication(application);
}

export async function updateApplication(applicationId: string, input: UpdateApplicationInput, userId: string, clientInfo: { ipAddress: string; userAgent: string }): Promise<SafeApplication> {
  const existing = await prisma.application.findUnique({ where: { id: applicationId } });

  if (!existing) {
    throw new NotFoundError("Application");
  }

  const application = await prisma.application.update({
    where: { id: applicationId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.redirectUris !== undefined && { redirectUris: input.redirectUris }),
      ...(input.status !== undefined && { status: input.status }),
    },
  });

  await logAudit(userId, application.id, "APPLICATION_UPDATED", clientInfo);

  return toSafeApplication(application);
}

export async function deleteApplication(applicationId: string, userId: string, clientInfo: { ipAddress: string; userAgent: string }): Promise<void> {
  const existing = await prisma.application.findUnique({ where: { id: applicationId } });

  if (!existing) {
    throw new NotFoundError("Application");
  }

  await prisma.application.update({
    where: { id: applicationId },
    data: { status: "disabled" },
  });

  await logAudit(userId, applicationId, "APPLICATION_DISABLED", clientInfo);
}

export async function rotateSecret(applicationId: string, userId: string, clientInfo: { ipAddress: string; userAgent: string }): Promise<RotateSecretResult> {
  const existing = await prisma.application.findUnique({ where: { id: applicationId } });

  if (!existing) {
    throw new NotFoundError("Application");
  }

  const newSecret = generateClientSecret();
  const newSecretHash = hashClientSecret(newSecret);

  await prisma.application.update({
    where: { id: applicationId },
    data: { clientSecretHash: newSecretHash },
  });

  await logAudit(userId, applicationId, "APPLICATION_SECRET_ROTATED", clientInfo);

  return { clientSecret: newSecret };
}

export async function verifyClientCredentials(clientId: string, clientSecret: string): Promise<SafeApplication> {
  const application = await prisma.application.findUnique({ where: { clientId } });

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

  return toSafeApplication(application);
}

export async function createScope(applicationId: string, input: { scope: string; description?: string }, userId: string, clientInfo: { ipAddress: string; userAgent: string }): Promise<ApplicationScopeInfo> {
  const application = await prisma.application.findUnique({ where: { id: applicationId } });

  if (!application) {
    throw new NotFoundError("Application");
  }

  const existingScope = await prisma.applicationScope.findUnique({
    where: { applicationId_scope: { applicationId, scope: input.scope } },
  });

  if (existingScope) {
    throw new ConflictError("Scope already exists for this application");
  }

  const scope = await prisma.applicationScope.create({
    data: {
      applicationId,
      scope: input.scope,
      description: input.description,
    },
  });

  await logAudit(userId, applicationId, "APPLICATION_SCOPE_CREATED", clientInfo);

  return scope;
}

export async function listScopes(applicationId: string): Promise<ApplicationScopeInfo[]> {
  const application = await prisma.application.findUnique({ where: { id: applicationId } });

  if (!application) {
    throw new NotFoundError("Application");
  }

  return prisma.applicationScope.findMany({
    where: { applicationId },
    orderBy: { scope: "asc" },
  });
}

export async function deleteScope(applicationId: string, scopeId: string, userId: string, clientInfo: { ipAddress: string; userAgent: string }): Promise<void> {
  const application = await prisma.application.findUnique({ where: { id: applicationId } });

  if (!application) {
    throw new NotFoundError("Application");
  }

  const scope = await prisma.applicationScope.findFirst({
    where: { id: scopeId, applicationId },
  });

  if (!scope) {
    throw new NotFoundError("Scope");
  }

  await prisma.applicationScope.delete({ where: { id: scopeId } });

  await logAudit(userId, applicationId, "APPLICATION_SCOPE_DELETED", clientInfo);
}

export async function grantAccess(applicationId: string, input: { userId: string; scopes: string[] }, grantedBy: string, clientInfo: { ipAddress: string; userAgent: string }): Promise<UserApplicationAccessInfo> {
  const application = await prisma.application.findUnique({ where: { id: applicationId } });

  if (!application) {
    throw new NotFoundError("Application");
  }

  const user = await prisma.user.findUnique({ where: { id: input.userId } });

  if (!user) {
    throw new NotFoundError("User");
  }

  const existingAccess = await prisma.userApplicationAccess.findUnique({
    where: { userId_applicationId: { userId: input.userId, applicationId } },
  });

  if (existingAccess) {
    throw new ConflictError("User already has access to this application");
  }

  const access = await prisma.userApplicationAccess.create({
    data: {
      userId: input.userId,
      applicationId,
      scopes: input.scopes,
    },
  });

  await logAudit(grantedBy, applicationId, "USER_APPLICATION_ACCESS_GRANTED", clientInfo);

  return access;
}

export async function listAccess(applicationId: string): Promise<UserApplicationAccessInfo[]> {
  const application = await prisma.application.findUnique({ where: { id: applicationId } });

  if (!application) {
    throw new NotFoundError("Application");
  }

  return prisma.userApplicationAccess.findMany({
    where: { applicationId },
    orderBy: { grantedAt: "desc" },
  });
}

export async function revokeAccess(applicationId: string, accessId: string, revokedBy: string, clientInfo: { ipAddress: string; userAgent: string }): Promise<void> {
  const application = await prisma.application.findUnique({ where: { id: applicationId } });

  if (!application) {
    throw new NotFoundError("Application");
  }

  const access = await prisma.userApplicationAccess.findFirst({
    where: { id: accessId, applicationId },
  });

  if (!access) {
    throw new NotFoundError("Access grant");
  }

  await prisma.userApplicationAccess.update({
    where: { id: accessId },
    data: { revokedAt: new Date() },
  });

  await logAudit(revokedBy, applicationId, "USER_APPLICATION_ACCESS_REVOKED", clientInfo);
}

async function logAudit(userId: string, applicationId: string | null, action: string, clientInfo: { ipAddress: string; userAgent: string }) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        applicationId,
        action,
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
      },
    });
  } catch (error) {
    logger.error("Failed to create audit log", { error });
  }
}
