import { z } from "zod";

export const introspectSchema = z.object({
  userId: z.string().uuid(),
  sessionId: z.string().uuid(),
});

export type IntrospectInput = z.infer<typeof introspectSchema>;

export const authCheckSchema = z.object({
  principalType: z.enum(["USER", "APPLICATION", "SYSTEM"]),
  principalId: z.string().uuid(),
  permission: z.string().min(1).regex(/^[^:]+:[^:]+$/, "permission must be resource:action"),
  resourceType: z.string().min(1).optional(),
  resourceId: z.string().min(1).optional(),
}).refine((d) => (d.resourceType && d.resourceId) || (!d.resourceType && !d.resourceId), {
  message: "resourceType and resourceId must both be provided or both omitted",
  path: ["resourceType"],
});

export type AuthCheckInput = z.infer<typeof authCheckSchema>;
