import { prisma } from "../../db/index.js";
import { hashPassword, verifyPassword, validatePassword } from "../../lib/password.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  AuthenticationError,
  AppError,
} from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import type { UpdateProfileInput, UpdateRecoveryInput } from "./me.schema.js";
import { randomBytes, createHmac } from "node:crypto";

// ─── Helpers: Safe User ──────────────────────────────────────────────────────
function toSafeUser(user: {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  status: string;
  emailVerifiedAt: Date | null;
  recoveryEmail: string | null;
  recoveryPhone: string | null;
  twoFactorEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role as "USER" | "ADMIN",
    status: user.status as "active" | "suspended" | "pending",
    emailVerifiedAt: user.emailVerifiedAt,
    recoveryEmail: user.recoveryEmail,
    recoveryPhone: user.recoveryPhone,
    twoFactorEnabled: user.twoFactorEnabled,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// ─── TOTP helpers (RFC 6238) ─────────────────────────────────────────────────
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  // pad to multiple of 8
  while (output.length % 8 !== 0) output += "=";
  return output.replace(/=+$/, "");
}

function base32Decode(str: string): Buffer {
  const cleaned = str.toUpperCase().replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error("Invalid base32 char");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generateTOTPSecret(): string {
  const buf = randomBytes(20);
  return base32Encode(buf);
}

function hotp(secret: string, counter: number, digits = 6): string {
  const key = base32Decode(secret);
  const counterBuf = Buffer.alloc(8);
  // write 64-bit big-endian counter
  let c = BigInt(counter);
  for (let i = 7; i >= 0; i--) {
    counterBuf[i] = Number(c & 0xffn);
    c >>= 8n;
  }
  const hmac = createHmac("sha1", key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const otp = binary % 10 ** digits;
  return otp.toString().padStart(digits, "0");
}

function verifyTOTP(secret: string, token: string, window = 1, step = 30): boolean {
  const now = Math.floor(Date.now() / 1000);
  const counter = Math.floor(now / step);
  for (let i = -window; i <= window; i++) {
    if (hotp(secret, counter + i) === token) return true;
  }
  return false;
}

function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(randomBytes(4).toString("hex").toUpperCase()); // 8 hex chars
  }
  return codes;
}

// ─── Profile ─────────────────────────────────────────────────────────────────
export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("User");

  // username uniqueness
  if (input.username && input.username !== user.username) {
    const existing = await prisma.user.findUnique({ where: { username: input.username } });
    if (existing) throw new ConflictError("Username already taken");
  }

  // displayName can be null -> clear
  // avatarUrl can be null -> clear
  const data: Record<string, unknown> = {};
  if (input.displayName !== undefined) {
    const v = input.displayName?.trim();
    data.displayName = v && v.length > 0 ? v : null;
  }
  if (input.username !== undefined) data.username = input.username;
  if (input.avatarUrl !== undefined) {
    const v = (input.avatarUrl as string | null)?.trim();
    data.avatarUrl = v && v.length > 0 ? v : null;
  }

  if (Object.keys(data).length === 0) {
    throw new ValidationError("No fields to update");
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
  });

  await logAudit(userId, null, "PROFILE_UPDATED", {
    ipAddress: "unknown",
    userAgent: "unknown",
  });

  return toSafeUser(updated as any);
}

// ─── Change Password ──────────────────────────────────────────────────────────
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  clientInfo: { ipAddress: string; userAgent: string },
  currentSessionId?: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("User");

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid)
    throw new AuthenticationError("Password saat ini salah", {
      currentPassword: ["Password saat ini salah"],
    });

  if (!validatePassword(newPassword)) {
    throw new ValidationError("New password must be at least 8 characters");
  }

  if (currentPassword === newPassword) {
    throw new ValidationError("New password must be different from current password");
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  // Revoke all other sessions (keep current session valid)
  if (currentSessionId) {
    await prisma.session.updateMany({
      where: { userId, id: { not: currentSessionId }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } else {
    // Fallback: revoke all if session unknown (safer)
    await prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  await logAudit(userId, null, "PASSWORD_CHANGED", clientInfo);
}

// ─── Security Overview ────────────────────────────────────────────────────────
export async function getSecurity(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      emailVerifiedAt: true,
      recoveryEmail: true,
      recoveryPhone: true,
      twoFactorEnabled: true,
      twoFactorSecret: true,
    },
  });
  if (!user) throw new NotFoundError("User");

  const has2FASecret = !!user.twoFactorSecret;

  return {
    emailVerified: !!user.emailVerifiedAt,
    twoFactorEnabled: user.twoFactorEnabled,
    twoFactorSetupPending: has2FASecret && !user.twoFactorEnabled,
    recoveryEmail: user.recoveryEmail,
    recoveryPhone: user.recoveryPhone,
  };
}

// ─── 2FA Setup ────────────────────────────────────────────────────────────────
export async function setup2FA(
  userId: string,
  clientInfo: { ipAddress: string; userAgent: string },
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("User");
  if (user.twoFactorEnabled) throw new ConflictError("Two-factor is already enabled");

  const secret = generateTOTPSecret();
  const backupCodes = generateBackupCodes(8);

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorSecret: secret,
      twoFactorBackupCodes: backupCodes,
    },
  });

  const issuer = "Ravaa Account";
  const label = `${issuer}:${user.email}`;
  const otpauthUrl = `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

  await logAudit(userId, null, "2FA_SETUP_INIT", clientInfo);

  return {
    secret,
    otpauthUrl,
    backupCodes,
  };
}

export async function confirm2FA(
  userId: string,
  code: string,
  clientInfo: { ipAddress: string; userAgent: string },
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("User");
  if (user.twoFactorEnabled) throw new ConflictError("Two-factor already enabled");
  if (!user.twoFactorSecret) throw new ValidationError("No 2FA setup in progress. Call setup first.");

  // also allow backup codes? No, only TOTP code for confirm
  const valid = verifyTOTP(user.twoFactorSecret, code, 1);
  // Dev bypass only in non-production (never in production)
  const isDevBypass = process.env.NODE_ENV !== "production" && code === "123456";
  if (!valid && !isDevBypass) {
    throw new ValidationError("Invalid verification code");
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: true,
    },
  });

  await logAudit(userId, null, "2FA_ENABLED", clientInfo);

  // return backup codes that were generated at setup
  const backupCodes = (user.twoFactorBackupCodes as string[]) || [];
  return { message: "Two-factor enabled", backupCodes };
}

export async function disable2FA(
  userId: string,
  password: string,
  clientInfo: { ipAddress: string; userAgent: string },
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("User");
  if (!user.twoFactorEnabled && !user.twoFactorSecret) {
    throw new ValidationError("Two-factor is not enabled");
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid)
    throw new AuthenticationError("Password salah", {
      password: ["Password salah"],
    });

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorBackupCodes: [],
    },
  });

  await logAudit(userId, null, "2FA_DISABLED", clientInfo);
  return { message: "Two-factor disabled" };
}

// ─── Recovery ─────────────────────────────────────────────────────────────────
export async function updateRecovery(
  userId: string,
  input: UpdateRecoveryInput,
  clientInfo: { ipAddress: string; userAgent: string },
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("User");

  const data: Record<string, string | null> = {};
  if (input.recoveryEmail !== undefined) {
    const v = input.recoveryEmail?.trim().toLowerCase();
    if (v && v === user.email) {
      throw new ValidationError("Recovery email cannot be the same as primary email");
    }
    data.recoveryEmail = v && v.length > 0 ? v : null;
  }
  if (input.recoveryPhone !== undefined) {
    const v = input.recoveryPhone?.trim();
    // very loose validation: allow +, digits, spaces, dashes, parentheses
    if (v && v.length > 0) {
      const phoneRegex = /^[+\d][\d\s\-().]{7,30}$/;
      if (!phoneRegex.test(v)) throw new ValidationError("Invalid phone number format");
      data.recoveryPhone = v;
    } else {
      data.recoveryPhone = null;
    }
  }

  if (Object.keys(data).length === 0) throw new ValidationError("No recovery fields to update");

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
  });

  await logAudit(userId, null, "RECOVERY_UPDATED", clientInfo);

  return toSafeUser(updated as any);
}

// ─── My Applications ──────────────────────────────────────────────────────────
export async function listMyApplications(userId: string) {
  const accesses = await prisma.userApplicationAccess.findMany({
    where: { userId },
    orderBy: { grantedAt: "desc" },
    include: {
      application: true,
    },
  });

  // Map to include application safe data
  return accesses.map((a) => ({
    id: a.id,
    userId: a.userId,
    applicationId: a.applicationId,
    scopes: a.scopes,
    grantedAt: a.grantedAt,
    revokedAt: a.revokedAt,
    application: {
      id: a.application.id,
      name: a.application.name,
      slug: a.application.slug,
      clientId: a.application.clientId,
      redirectUris: a.application.redirectUris,
      status: a.application.status,
      createdAt: a.application.createdAt,
      updatedAt: a.application.updatedAt,
    },
  }));
}

export async function revokeMyApplicationAccess(userId: string, accessId: string) {
  const access = await prisma.userApplicationAccess.findFirst({
    where: { id: accessId, userId },
  });
  if (!access) throw new NotFoundError("Application access");

  if (access.revokedAt) throw new ValidationError("Access already revoked");

  await prisma.userApplicationAccess.update({
    where: { id: accessId },
    data: { revokedAt: new Date() },
  });

  await logAudit(userId, access.applicationId, "APPLICATION_ACCESS_REVOKED_BY_USER", {
    ipAddress: "unknown",
    userAgent: "unknown",
  });
}

// ─── Data Export ──────────────────────────────────────────────────────────────
export async function exportData(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("User");

  const sessions = await prisma.session.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      deviceName: true,
      deviceType: true,
      ipAddress: true,
      lastActiveAt: true,
      expiresAt: true,
      createdAt: true,
      revokedAt: true,
    },
  });

  const accesses = await prisma.userApplicationAccess.findMany({
    where: { userId },
    include: { application: { select: { id: true, name: true, slug: true, status: true } } },
  });

  const auditLogs = await prisma.auditLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      action: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
    },
  });

  const safeUser = toSafeUser(user as any);

  return {
    exportedAt: new Date().toISOString(),
    user: safeUser,
    sessions: {
      count: sessions.length,
      items: sessions,
    },
    applications: {
      count: accesses.length,
      items: accesses.map((a) => ({
        id: a.id,
        grantedAt: a.grantedAt,
        revokedAt: a.revokedAt,
        scopes: a.scopes,
        application: a.application,
      })),
    },
    auditLogs: {
      count: auditLogs.length,
      items: auditLogs,
    },
    preferences: {
      note: "Preferences are stored locally in browser localStorage (ravaa-preferences).",
    },
    security: {
      twoFactorEnabled: user.twoFactorEnabled,
      recoveryEmail: user.recoveryEmail,
      recoveryPhone: user.recoveryPhone,
      emailVerified: !!user.emailVerifiedAt,
    },
  };
}

// ─── Delete Account ───────────────────────────────────────────────────────────
export async function deleteAccount(
  userId: string,
  password: string,
  clientInfo: { ipAddress: string; userAgent: string },
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("User");

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid)
    throw new AuthenticationError("Password salah", {
      password: ["Password salah"],
    });

  if (user.role === "ADMIN") {
    // Prevent last admin deletion? Check count of admins
    const adminCount = await prisma.user.count({ where: { role: "ADMIN", status: "active" } });
    if (adminCount <= 1) {
      throw new AppError(400, "VALIDATION_ERROR", "Cannot delete the last admin account");
    }
  }

  await logAudit(userId, null, "ACCOUNT_DELETION_REQUESTED", clientInfo);

  // Revoke all sessions
  await prisma.session.updateMany({
    where: { userId },
    data: { revokedAt: new Date() },
  });

  // Soft delete: anonymize & suspend, but also hard delete option
  // We will hard delete for GDPR compliance, but keep audit logs (SetNull)
  await prisma.user.delete({ where: { id: userId } });

  // Note: audit logs for this user will have userId = null after cascade SetNull
  // We create a final audit log with no user relation
  try {
    await prisma.auditLog.create({
      data: {
        userId: null,
        action: "ACCOUNT_DELETED",
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
        metadata: { deletedUserId: userId, email: user.email },
      },
    });
  } catch {}

  return { message: "Account deleted" };
}

async function logAudit(
  userId: string | null,
  applicationId: string | null,
  action: string,
  clientInfo: { ipAddress: string; userAgent: string },
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        applicationId,
        action,
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
      },
    });
  } catch (e) {
    logger.error("Failed to create audit log", { error: e });
  }
}
