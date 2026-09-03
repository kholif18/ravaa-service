import { createRouter } from "../../factory.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { ValidationError } from "../../lib/errors.js";
import {
  updateProfileSchema,
  changePasswordSchema,
  updateRecoverySchema,
  confirm2FASchema,
  disable2FASchema,
  deleteAccountSchema,
} from "./me.schema.js";
import * as meService from "./me.service.js";
import * as authService from "../auth/auth.service.js";

const me = createRouter();

// Helper to extract client info
function getClientInfo(c: any) {
  return {
    ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown",
    userAgent: c.req.header("user-agent") ?? "unknown",
  };
}

// GET /api/v1/me — current user (moved from app.ts for consistency)
me.get("/", authMiddleware(), async (c) => {
  const { userId } = c.get("auth");
  const user = await authService.getCurrentUser(userId);
  // enrich with security fields via meService.getSecurity? But getCurrentUser already returns safeUser
  // We keep simple: return user as before
  return c.json({ user });
});

// PATCH /api/v1/me — update profile
me.patch("/", authMiddleware(), async (c) => {
  const { userId } = c.get("auth");
  const body = await c.req.json();
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }
  const user = await meService.updateProfile(userId, parsed.data);
  return c.json({ user });
});

// PATCH /api/v1/me/password — change password
me.patch("/password", authMiddleware(), async (c) => {
  const { userId, sessionId } = c.get("auth");
  const body = await c.req.json();
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }
  const clientInfo = getClientInfo(c);
  await meService.changePassword(userId, parsed.data.currentPassword, parsed.data.newPassword, clientInfo, sessionId);
  return c.json({ message: "Password changed successfully" });
});

// GET /api/v1/me/security — security overview
me.get("/security", authMiddleware(), async (c) => {
  const { userId } = c.get("auth");
  const security = await meService.getSecurity(userId);
  return c.json({ security });
});

// POST /api/v1/me/security/2fa/setup
me.post("/security/2fa/setup", authMiddleware(), async (c) => {
  const { userId } = c.get("auth");
  const clientInfo = getClientInfo(c);
  const result = await meService.setup2FA(userId, clientInfo);
  return c.json(result);
});

// POST /api/v1/me/security/2fa/confirm
me.post("/security/2fa/confirm", authMiddleware(), async (c) => {
  const { userId } = c.get("auth");
  const body = await c.req.json();
  const parsed = confirm2FASchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }
  const clientInfo = getClientInfo(c);
  const result = await meService.confirm2FA(userId, parsed.data.code, clientInfo);
  return c.json(result);
});

// POST /api/v1/me/security/2fa/disable
me.post("/security/2fa/disable", authMiddleware(), async (c) => {
  const { userId } = c.get("auth");
  const body = await c.req.json();
  const parsed = disable2FASchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }
  const clientInfo = getClientInfo(c);
  const result = await meService.disable2FA(userId, parsed.data.password, clientInfo);
  return c.json(result);
});

// PATCH /api/v1/me/security/recovery
me.patch("/security/recovery", authMiddleware(), async (c) => {
  const { userId } = c.get("auth");
  const body = await c.req.json();
  const parsed = updateRecoverySchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }
  const clientInfo = getClientInfo(c);
  const user = await meService.updateRecovery(userId, parsed.data, clientInfo);
  return c.json({ user, message: "Recovery options updated" });
});

// GET /api/v1/me/applications — list my applications
me.get("/applications", authMiddleware(), async (c) => {
  const { userId } = c.get("auth");
  const accesses = await meService.listMyApplications(userId);
  return c.json({ accesses, applications: accesses });
});

// DELETE /api/v1/me/applications/:accessId — revoke
me.delete("/applications/:accessId", authMiddleware(), async (c) => {
  const { userId } = c.get("auth");
  const accessId = c.req.param("accessId") as string;
  await meService.revokeMyApplicationAccess(userId, accessId);
  return c.json({ message: "Application access revoked" });
});

// GET /api/v1/me/export — export data
me.get("/export", authMiddleware(), async (c) => {
  const { userId } = c.get("auth");
  const data = await meService.exportData(userId);
  return c.json(data);
});

// DELETE /api/v1/me — delete account
me.delete("/", authMiddleware(), async (c) => {
  const { userId } = c.get("auth");
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const parsed = deleteAccountSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }
  const clientInfo = getClientInfo(c);
  await meService.deleteAccount(userId, parsed.data.password, clientInfo);
  // clear cookie is handled by frontend logout? But we also try to clear refreshToken cookie via app layer?
  // We'll just return message, client will clear local state
  return c.json({ message: "Account deleted" });
});

export { me };
