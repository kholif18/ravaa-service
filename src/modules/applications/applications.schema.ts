import { z } from "zod";

export const createApplicationSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  slug: z
    .string()
    .min(3)
    .max(50)
    .toLowerCase()
    .trim()
    .regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens"),
  redirectUris: z.array(z.string().url()).optional().default([]),
});

export const updateApplicationSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  redirectUris: z.array(z.string().url()).optional(),
  status: z.enum(["active", "inactive", "suspended", "disabled"]).optional(),
});

export const createScopeSchema = z.object({
  scope: z
    .string()
    .min(1)
    .max(100)
    .trim()
    .regex(/^[a-z0-9:._-]+$/, "Scope must follow <resource>:<action> pattern"),
  description: z.string().max(500).trim().optional(),
});

export const grantAccessSchema = z.object({
  userId: z.string().uuid(),
  scopes: z.array(z.string().min(1).max(100)).min(1),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;
export type CreateScopeInput = z.infer<typeof createScopeSchema>;
export type GrantAccessInput = z.infer<typeof grantAccessSchema>;
