import { z } from "zod";

export const createPermissionSchema = z.object({
  resource: z
    .string()
    .min(1)
    .max(100)
    .trim()
    .regex(/^[a-z0-9_]+$/, "Resource must contain only lowercase letters, numbers, and underscores"),
  action: z
    .string()
    .min(1)
    .max(100)
    .trim()
    .regex(/^[a-z0-9_]+$/, "Action must contain only lowercase letters, numbers, and underscores"),
  description: z.string().max(500).trim().optional(),
});

export const grantResourcePermissionSchema = z.object({
  resourceType: z.string().min(1).max(100).trim(),
  resourceId: z.string().uuid(),
  principalType: z.enum(["USER", "APPLICATION", "SYSTEM"]),
  principalId: z.string().min(1).max(200),
  permissionId: z.string().uuid(),
  expiresAt: z.string().datetime().optional(),
});

export const revokeResourcePermissionSchema = z.object({
  resourceType: z.string().min(1).max(100).trim(),
  resourceId: z.string().uuid(),
  principalType: z.enum(["USER", "APPLICATION", "SYSTEM"]),
  principalId: z.string().min(1).max(200),
  permissionId: z.string().uuid(),
});

export type CreatePermissionInput = z.infer<typeof createPermissionSchema>;
export type GrantResourcePermissionInput = z.infer<typeof grantResourcePermissionSchema>;
export type RevokeResourcePermissionInput = z.infer<typeof revokeResourcePermissionSchema>;
