import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  username: z
    .string()
    .min(3)
    .max(50)
    .toLowerCase()
    .trim()
    .regex(/^[a-z0-9_]+$/, "Username can only contain lowercase letters, numbers, and underscores"),
  password: z.string().min(8),
  displayName: z.string().max(100).trim().optional(),
});

export const loginSchema = z.object({
  identifier: z.string().min(1).trim().toLowerCase(),
  password: z.string().min(1),
  deviceName: z.string().max(100).trim().optional(),
  deviceType: z.enum(["web", "mobile", "desktop", "api"]).optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
