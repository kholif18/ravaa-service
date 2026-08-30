import type { Permission, ResourcePermission, PrincipalType } from "@prisma/client";

export type SafePermission = Permission;

export type SafeResourcePermission = Omit<ResourcePermission, ""> & {
  permission?: Permission;
};

export type CreatePermissionInput = {
  resource: string;
  action: string;
  description?: string;
};

export type GrantResourcePermissionInput = {
  resourceType: string;
  resourceId: string;
  principalType: PrincipalType;
  principalId: string;
  permissionId: string;
  expiresAt?: string;
};

export type RevokeResourcePermissionInput = {
  resourceType: string;
  resourceId: string;
  principalType: PrincipalType;
  principalId: string;
  permissionId: string;
};

export { type PrincipalType } from "@prisma/client";
