import { prisma } from "../../db/index.js";
import { hashPassword, verifyPassword, validatePassword } from "../../lib/password.js";
import { signAccessToken, signRefreshToken, hashToken } from "../../lib/jwt.js";
import { ConflictError, AuthenticationError, ValidationError, NotFoundError, AppError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import type { RegisterInput, LoginInput } from "./auth.schema.js";
import type { SafeUser, AuthResult } from "./auth.types.js";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;
const SESSION_EXPIRY_DAYS = 7;

function toSafeUser(user: {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  status: string;
  emailVerifiedAt: Date | null;
  recoveryEmail?: string | null;
  recoveryPhone?: string | null;
  twoFactorEnabled?: boolean;
  createdAt: Date;
  updatedAt: Date;
}): SafeUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role as SafeUser["role"],
    status: user.status as SafeUser["status"],
    emailVerifiedAt: user.emailVerifiedAt,
    recoveryEmail: (user as any).recoveryEmail ?? null,
    recoveryPhone: (user as any).recoveryPhone ?? null,
    twoFactorEnabled: (user as any).twoFactorEnabled ?? false,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  } as SafeUser;
}

function getExpiryDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() + SESSION_EXPIRY_DAYS);
  return date;
}

export async function register(input: RegisterInput, clientInfo: { ipAddress: string; userAgent: string }, deviceName?: string, deviceType?: string): Promise<AuthResult> {
  const existingEmail = await prisma.user.findUnique({ where: { email: input.email } });
  if (existingEmail) {
    throw new ConflictError("Email already registered");
  }

  const existingUsername = await prisma.user.findUnique({ where: { username: input.username } });
  if (existingUsername) {
    throw new ConflictError("Username already taken");
  }

  if (!validatePassword(input.password)) {
    throw new ValidationError("Password must be at least 8 characters");
  }

  const passwordHash = await hashPassword(input.password);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email,
        username: input.username,
        passwordHash,
        displayName: input.displayName ?? input.username,
        status: "active",
      },
    });

    const refreshToken = await signRefreshToken();
    const refreshTokenHash = await hashToken(refreshToken);

    const session = await tx.session.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        deviceName: deviceName ?? "Unknown Device",
        deviceType: deviceType ?? "api",
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
        expiresAt: getExpiryDate(),
      },
    });

    const accessToken = await signAccessToken(user.id, session.id);

    return { user, accessToken, refreshToken };
  }, { maxWait: 10000, timeout: 20000 });

  await logAudit(result.user.id, null, "REGISTER_SUCCESS", clientInfo);

  // Create verification token + send email (do not fail registration on email error)
  try {
    const { createVerificationForUser } = await import("./email-verification.service.js");
    await createVerificationForUser(result.user);
  } catch (err) {
    logger.error("email.verification.create_failed", { userId: result.user.id });
  }

  return {
    user: toSafeUser(result.user),
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresIn: 900,
  };
}

export async function login(input: LoginInput, clientInfo: { ipAddress: string; userAgent: string }): Promise<AuthResult> {
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: input.identifier }, { username: input.identifier }],
    },
  });

  if (!user) {
    throw new AuthenticationError("Username atau email tidak ditemukan", {
      identifier: ["Username atau email tidak ditemukan"],
    });
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await logAudit(user.id, null, "ACCOUNT_LOCKED", clientInfo);
    throw new AppError(423, "ACCOUNT_LOCKED", "Account is temporarily locked. Please try again later.");
  }

  const validPassword = await verifyPassword(input.password, user.passwordHash);
  if (!validPassword) {
    const newFailedCount = user.failedLoginCount + 1;
    const lockUntil = newFailedCount >= MAX_FAILED_ATTEMPTS
      ? new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000)
      : null;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: newFailedCount,
        lockedUntil: lockUntil,
      },
    });

    await logAudit(user.id, null, "LOGIN_FAILED", clientInfo);

    if (lockUntil) {
      await logAudit(user.id, null, "ACCOUNT_LOCKED", clientInfo);
    }

    throw new AuthenticationError("Password salah", {
      password: ["Password salah"],
    });
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    const refreshToken = await signRefreshToken();
    const refreshTokenHash = await hashToken(refreshToken);

    const session = await tx.session.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        deviceName: input.deviceName ?? "Unknown Device",
        deviceType: input.deviceType ?? "api",
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
        expiresAt: getExpiryDate(),
      },
    });

    const accessToken = await signAccessToken(user.id, session.id);

    return { accessToken, refreshToken };
  }, { maxWait: 10000, timeout: 20000 });

  await logAudit(user.id, null, "LOGIN_SUCCESS", clientInfo);

  return {
    user: toSafeUser(user),
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresIn: 900,
  };
}

export async function refresh(refreshToken: string, clientInfo: { ipAddress: string; userAgent: string }): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const tokenHash = await hashToken(refreshToken);

  const session = await prisma.session.findFirst({
    where: { refreshTokenHash: tokenHash },
    include: { user: true },
  });

  if (!session) {
    throw new AuthenticationError("Invalid refresh token");
  }

  if (session.revokedAt) {
    await logAudit(session.userId, null, "TOKEN_REUSE_DETECTED", clientInfo);
    await prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    throw new AuthenticationError("Token reuse detected. Session revoked.");
  }

  if (session.expiresAt < new Date()) {
    throw new AuthenticationError("Refresh token expired");
  }

  if (session.user.status !== "active" && session.user.status !== "pending") {
    throw new AuthenticationError("Account is not active");
  }

  const newRefreshToken = await signRefreshToken();
  const newRefreshTokenHash = await hashToken(newRefreshToken);

  const newSession = await prisma.$transaction(async (tx) => {
    await tx.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), lastActiveAt: new Date() },
    });

    const created = await tx.session.create({
      data: {
        userId: session.userId,
        refreshTokenHash: newRefreshTokenHash,
        deviceName: session.deviceName,
        deviceType: session.deviceType,
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
        expiresAt: getExpiryDate(),
        lastActiveAt: new Date(),
      },
    });
    return created;
  }, { maxWait: 10000, timeout: 20000 });

  const accessToken = await signAccessToken(session.userId, newSession.id);

  await logAudit(session.userId, null, "TOKEN_REFRESH", clientInfo);

  return {
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn: 900,
  };
}

export async function logout(sessionId: string, userId: string): Promise<void> {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, userId },
  });

  if (!session) {
    throw new NotFoundError("Session");
  }

  await prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });

  await logAudit(userId, null, "LOGOUT", { ipAddress: "unknown", userAgent: "unknown" });
}

export async function logoutAll(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await logAudit(userId, null, "LOGOUT_ALL", { ipAddress: "unknown", userAgent: "unknown" });
}

export async function getCurrentUser(userId: string): Promise<SafeUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw new NotFoundError("User");
  }

  return toSafeUser(user);
}

async function logAudit(userId: string, applicationId: string | null, action: string, clientInfo: { ipAddress: string; userAgent: string }) {
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
  } catch (error) {
    logger.error("Failed to create audit log", { error });
  }
}
