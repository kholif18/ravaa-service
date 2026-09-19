import { z } from "zod";

export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .max(100, "Display name max 100 chars")
    .trim()
    .optional()
    .nullable(),
  username: z
    .string()
    .min(3, "Username min 3 chars")
    .max(50, "Username max 50 chars")
    .toLowerCase()
    .trim()
    .regex(/^[a-z0-9_]+$/, "Username can only contain lowercase letters, numbers, and underscores")
    .optional(),
  avatarUrl: z
    .string()
    .url("Avatar must be a valid URL")
    .max(500)
    .trim()
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export const updateRecoverySchema = z.object({
  recoveryEmail: z
    .string()
    .email("Invalid email")
    .toLowerCase()
    .trim()
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  recoveryPhone: z
    .string()
    .max(30)
    .trim()
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
});

export const confirm2FASchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
});

export const disable2FASchema = z.object({
  password: z.string().min(1, "Password required"),
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Password required"),
  confirmation: z.string().optional(),
});

export const updatePreferencesSchema = z.object({
  language: z.string().min(2).max(10).optional(),
  timezone: z.string().min(1).max(50).optional(),
  emailNotifications: z.boolean().optional(),
  securityAlerts: z.boolean().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateRecoveryInput = z.infer<typeof updateRecoverySchema>;
export type Confirm2FAInput = z.infer<typeof confirm2FASchema>;
export type Disable2FAInput = z.infer<typeof disable2FASchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
