import { prisma } from "../db/index.js";
import { logger } from "./logger.js";

export type PrincipalType = "USER" | "APPLICATION" | "SYSTEM";

export type ResourceIdentifier = {
  type: string;
  id: string;
};

export type AuthorizationContext = {
  userId?: string;
  applicationId?: string;
  sessionId?: string;
};

export type AuthorizationResult = {
  allowed: boolean;
  reason: string;
};

export type AuthorizationCheck = {
  principalType: PrincipalType;
  principalId: string;
  permission: string;
  resource?: ResourceIdentifier;
};

const DENY_REASONS = {
  NOT_AUTHENTICATED: "NOT_AUTHENTICATED",
  APPLICATION_DISABLED: "APPLICATION_DISABLED",
  NO_APPLICATION_ACCESS: "NO_APPLICATION_ACCESS",
  ACCESS_REVOKED: "ACCESS_REVOKED",
  INSUFFICIENT_SCOPE: "INSUFFICIENT_SCOPE",
  PERMISSION_NOT_FOUND: "PERMISSION_NOT_FOUND",
  RESOURCE_ACCESS_DENIED: "RESOURCE_ACCESS_DENIED",
  PERMISSION_EXPIRED: "PERMISSION_EXPIRED",
  PERMISSION_REVOKED: "PERMISSION_REVOKED",
  EFFECT_DENY: "EFFECT_DENY",
} as const;

const ALLOW_REASONS = {
  ALLOWED: "ALLOWED",
  ADMIN_BYPASS: "ADMIN_BYPASS",
  OWNER_BYPASS: "OWNER_BYPASS",
} as const;

export async function authorize(check: AuthorizationCheck): Promise<AuthorizationResult> {
  const { principalType, principalId, permission, resource } = check;

  // 1. Parse permission key
  const [resourcePart, actionPart] = permission.split(":");
  if (!resourcePart || !actionPart) {
    return { allowed: false, reason: DENY_REASONS.PERMISSION_NOT_FOUND };
  }

  // 2. Check if permission exists
  const permissionRecord = await prisma.permission.findUnique({
    where: { resource_action: { resource: resourcePart, action: actionPart } },
  });

  if (!permissionRecord) {
    return { allowed: false, reason: DENY_REASONS.PERMISSION_NOT_FOUND };
  }

  // 3. If no resource specified, check global permission
  if (!resource) {
    return checkGlobalPermission(principalType, principalId, permissionRecord.id);
  }

  // 4. Check resource-specific permission
  return checkResourcePermission(principalType, principalId, permissionRecord.id, resource);
}

async function checkGlobalPermission(
  principalType: PrincipalType,
  principalId: string,
  permissionId: string,
): Promise<AuthorizationResult> {
  const resourcePermission = await prisma.resourcePermission.findFirst({
    where: {
      principalType,
      principalId,
      permissionId,
      effect: "allow",
      revokedAt: null,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
  });

  if (resourcePermission) {
    return { allowed: true, reason: ALLOW_REASONS.ALLOWED };
  }

  return { allowed: false, reason: DENY_REASONS.RESOURCE_ACCESS_DENIED };
}

async function checkResourcePermission(
  principalType: PrincipalType,
  principalId: string,
  permissionId: string,
  resource: ResourceIdentifier,
): Promise<AuthorizationResult> {
  // Check for explicit deny first
  const denyPermission = await prisma.resourcePermission.findFirst({
    where: {
      resourceType: resource.type,
      resourceId: resource.id,
      principalType,
      principalId,
      permissionId,
      effect: "deny",
      revokedAt: null,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
  });

  if (denyPermission) {
    return { allowed: false, reason: DENY_REASONS.EFFECT_DENY };
  }

  // Check for explicit allow
  const allowPermission = await prisma.resourcePermission.findFirst({
    where: {
      resourceType: resource.type,
      resourceId: resource.id,
      principalType,
      principalId,
      permissionId,
      effect: "allow",
      revokedAt: null,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
  });

  if (allowPermission) {
    return { allowed: true, reason: ALLOW_REASONS.ALLOWED };
  }

  return { allowed: false, reason: DENY_REASONS.RESOURCE_ACCESS_DENIED };
}

export async function checkApplicationScope(
  applicationId: string,
  requiredScope: string,
): Promise<boolean> {
  const scope = await prisma.applicationScope.findUnique({
    where: { applicationId_scope: { applicationId, scope: requiredScope } },
  });

  return scope !== null;
}

export async function checkUserApplicationAccess(
  userId: string,
  applicationId: string,
  requiredScope: string,
): Promise<{ hasAccess: boolean; scopes: string[] }> {
  const access = await prisma.userApplicationAccess.findUnique({
    where: { userId_applicationId: { userId, applicationId } },
  });

  if (!access || access.revokedAt) {
    return { hasAccess: false, scopes: [] };
  }

  const hasScope = access.scopes.includes(requiredScope);
  return {
    hasAccess: hasScope,
    scopes: access.scopes,
  };
}

export async function isApplicationActive(applicationId: string): Promise<boolean> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { status: true },
  });

  return application?.status === "active";
}

export async function isUserAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  return user?.role === "ADMIN";
}

export async function getResourcePermissions(resourceType: string, resourceId: string) {
  return prisma.resourcePermission.findMany({
    where: {
      resourceType,
      resourceId,
      revokedAt: null,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    include: { permission: true },
  });
}

export async function grantResourcePermission(
  resourceType: string,
  resourceId: string,
  principalType: PrincipalType,
  principalId: string,
  permissionId: string,
  _grantedBy: string,
  expiresAt?: Date,
) {
  const existing = await prisma.resourcePermission.findFirst({
    where: {
      resourceType,
      resourceId,
      principalType,
      principalId,
      permissionId,
    },
  });

  if (existing) {
    if (existing.revokedAt) {
      // Re-grant: update existing
      return prisma.resourcePermission.update({
        where: { id: existing.id },
        data: {
          effect: "allow",
          revokedAt: null,
          expiresAt: expiresAt ?? null,
          grantedAt: new Date(),
        },
      });
    }
    // Already granted
    return existing;
  }

  return prisma.resourcePermission.create({
    data: {
      resourceType,
      resourceId,
      principalType,
      principalId,
      permissionId,
      effect: "allow",
      expiresAt,
    },
  });
}

export async function revokeResourcePermission(
  resourceType: string,
  resourceId: string,
  principalType: PrincipalType,
  principalId: string,
  permissionId: string,
) {
  const existing = await prisma.resourcePermission.findFirst({
    where: {
      resourceType,
      resourceId,
      principalType,
      principalId,
      permissionId,
    },
  });

  if (!existing) {
    return null;
  }

  return prisma.resourcePermission.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });
}

export async function logAuthorizationDenial(
  check: AuthorizationCheck,
  result: AuthorizationResult,
  clientInfo: { ipAddress: string; userAgent: string },
) {
  try {
    await prisma.auditLog.create({
      data: {
        action: "AUTHORIZATION_DENIED",
        metadata: {
          principalType: check.principalType,
          principalId: check.principalId,
          permission: check.permission,
          resource: check.resource,
          reason: result.reason,
        },
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
      },
    });
  } catch (error) {
    logger.error("Failed to log authorization denial", { error });
  }
}

export { DENY_REASONS, ALLOW_REASONS };
