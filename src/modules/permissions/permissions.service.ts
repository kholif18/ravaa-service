import { prisma } from "../../db/index.js";
import { ConflictError, NotFoundError } from "../../lib/errors.js";
import { grantResourcePermission, revokeResourcePermission } from "../../lib/authorization.js";
import type { CreatePermissionInput, GrantResourcePermissionInput, RevokeResourcePermissionInput } from "./permissions.schema.js";
import type { SafePermission, SafeResourcePermission } from "./permissions.types.js";
import type { PrincipalType } from "@prisma/client";

export async function createPermission(input: CreatePermissionInput): Promise<SafePermission> {
  const existing = await prisma.permission.findUnique({
    where: { resource_action: { resource: input.resource, action: input.action } },
  });

  if (existing) {
    throw new ConflictError("Permission already exists");
  }

  return prisma.permission.create({
    data: {
      resource: input.resource,
      action: input.action,
      description: input.description,
    },
  });
}

export async function listPermissions(): Promise<SafePermission[]> {
  return prisma.permission.findMany({
    orderBy: [{ resource: "asc" }, { action: "asc" }],
  });
}

export async function getPermission(id: string): Promise<SafePermission> {
  const permission = await prisma.permission.findUnique({ where: { id } });

  if (!permission) {
    throw new NotFoundError("Permission");
  }

  return permission;
}

export async function deletePermission(id: string): Promise<void> {
  const permission = await prisma.permission.findUnique({ where: { id } });

  if (!permission) {
    throw new NotFoundError("Permission");
  }

  await prisma.permission.delete({ where: { id } });
}

export async function grantPermission(input: GrantResourcePermissionInput): Promise<SafeResourcePermission> {
  const permission = await prisma.permission.findUnique({ where: { id: input.permissionId } });

  if (!permission) {
    throw new NotFoundError("Permission");
  }

  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : undefined;

  const result = await grantResourcePermission(
    input.resourceType,
    input.resourceId,
    input.principalType as PrincipalType,
    input.principalId,
    input.permissionId,
    "", // grantedBy - system
    expiresAt,
  );

  return result as SafeResourcePermission;
}

export async function revokePermission(input: RevokeResourcePermissionInput): Promise<SafeResourcePermission | null> {
  const result = await revokeResourcePermission(
    input.resourceType,
    input.resourceId,
    input.principalType as PrincipalType,
    input.principalId,
    input.permissionId,
  );

  return result as SafeResourcePermission | null;
}

export async function getResourcePermissions(resourceType: string, resourceId: string): Promise<SafeResourcePermission[]> {
  return prisma.resourcePermission.findMany({
    where: {
      resourceType,
      resourceId,
      revokedAt: null,
    },
    include: { permission: true },
    orderBy: { grantedAt: "desc" },
  }) as unknown as SafeResourcePermission[];
}

export async function getPrincipalPermissions(principalType: PrincipalType, principalId: string): Promise<SafeResourcePermission[]> {
  return prisma.resourcePermission.findMany({
    where: {
      principalType,
      principalId,
      revokedAt: null,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    include: { permission: true },
    orderBy: { grantedAt: "desc" },
  }) as unknown as SafeResourcePermission[];
}
