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

// POST /api/v1/me/avatar — upload avatar langsung (HOME)
me.post("/avatar", authMiddleware(), async (c) => {
  const { userId } = c.get("auth");
  const body = await c.req.parseBody();
  const file = body["avatar"] as File | undefined;
  if (!file || typeof (file as any).arrayBuffer !== "function") {
    throw new ValidationError("Validation failed", { avatar: ["File required"] } as any);
  }
  if (!file.type.startsWith("image/")) throw new ValidationError("Validation failed", { avatar: ["Must be image"] } as any);
  if (file.size > 2 * 1024 * 1024) throw new ValidationError("Validation failed", { avatar: ["Max 2MB"] } as any);
  const buf = Buffer.from(await (file as any).arrayBuffer());
  const { writeFile } = await import("fs/promises");
  const { mkdir } = await import("fs/promises");
  const path = await import("path");
  const dir = path.join(process.cwd(), "data", "avatars");
  await mkdir(dir, { recursive: true });
  const ext = file.type.includes("png") ? "png" : file.type.includes("webp") ? "webp" : "jpg";
  const filename = `${userId}.${ext}`;
  await writeFile(path.join(dir, filename), buf);
  const base = process.env.SERVICE_PUBLIC_URL || (process.env.NODE_ENV === "production" ? "https://service.ravaa.my.id" : "http://localhost:2711");
  const url = `${base}/api/v1/me/avatar/${filename}`;
  const user = await meService.updateProfile(userId, { avatarUrl: url } as any);
  return c.json({ user, avatarUrl: url });
});

// GET /api/v1/me/avatar/:filename — serve avatar file
me.get("/avatar/:filename", async (c) => {
  const filename = c.req.param("filename") as string;
  const path = await import("path");
  const { readFile } = await import("fs/promises");
  const filePath = path.join(process.cwd(), "data", "avatars", filename);
  try {
    const buf: any = await readFile(filePath);
    const ext = filename.split(".").pop()?.toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return new Response(buf, { headers: { "Content-Type": mime, "Cache-Control": "public, max-age=86400" } }) as any;
  } catch {
    return c.json({ error: { code: "NOT_FOUND", message: "Avatar not found" } }, 404);
  }
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

// GET /api/v1/me/storage — dynamic per-user (enterprise)
me.get("/storage", authMiddleware(), async (c) => {
  const { userId } = c.get("auth");
  const user = await c.get("auth") ? await (await import("../../db/index.js")).prisma.user.findUnique({ where: { id: userId }, select: { storageLimit: true } }) : null;
  const limit = user ? Number(user.storageLimit) : 5368709120;
  return c.json({ storage: { limit, used: 0, note: "used dihitung di Drive via SUM File" } });
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
