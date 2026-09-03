import { prisma } from "../../db/index.js";
import { getEnv } from "../../env.js";
import { generateVerificationToken, hashVerificationToken } from "../../lib/email/token.js";
import { buildVerificationUrl, sendVerificationEmail } from "../../lib/email/email.service.js";
import { logger } from "../../lib/logger.js";
import { AppError } from "../../lib/errors.js";
import type { SafeUser } from "./auth.types.js";

function toSafeUser(u: {
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
    id: u.id,
    email: u.email,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    role: u.role as SafeUser["role"],
    status: u.status as SafeUser["status"],
    emailVerifiedAt: u.emailVerifiedAt,
    recoveryEmail: (u as any).recoveryEmail ?? null,
    recoveryPhone: (u as any).recoveryPhone ?? null,
    twoFactorEnabled: (u as any).twoFactorEnabled ?? false,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  } as SafeUser;
}

export async function createVerificationForUser(
  user: { id: string; email: string; displayName: string | null },
): Promise<{ rawToken: string }> {
  const env = getEnv();
  const { rawToken, hashedToken } = generateVerificationToken();
  const expiresAt = new Date(Date.now() + env.EMAIL_VERIFICATION_EXPIRES_HOURS * 60 * 60 * 1000);

  // Invalidate previous unverified tokens
  await prisma.emailVerification.deleteMany({
    where: { userId: user.id, verifiedAt: null },
  });

  await prisma.emailVerification.create({
    data: { userId: user.id, tokenHash: hashedToken, expiresAt },
  });

  // Send email (outside transaction, failure should not rollback user)
  try {
    const verificationUrl = buildVerificationUrl(rawToken);
    await sendVerificationEmail({
      to: user.email,
      displayName: user.displayName,
      verificationUrl,
      expiresHours: env.EMAIL_VERIFICATION_EXPIRES_HOURS,
    });
    await prisma.auditLog.create({
      data: { userId: user.id, action: "EMAIL_VERIFICATION_SENT", ipAddress: null, userAgent: null },
    });
  } catch (err) {
    logger.error("email.verification.failed", { userId: user.id });
    await prisma.auditLog.create({
      data: { userId: user.id, action: "EMAIL_VERIFICATION_FAILED", ipAddress: null, userAgent: null },
    });
    // Do not throw — registration already succeeded
  }

  return { rawToken };
}

export async function verifyEmail(rawToken: string, clientInfo: { ipAddress: string; userAgent: string }): Promise<SafeUser> {
  const hashedToken = hashVerificationToken(rawToken);
  const record = await prisma.emailVerification.findFirst({
    where: { tokenHash: hashedToken },
  });

  if (!record) {
    throw new AppError(400, "INVALID_TOKEN", "Invalid or expired verification token.");
  }
  if (record.verifiedAt) {
    throw new AppError(400, "INVALID_TOKEN", "Invalid or expired verification token.");
  }
  if (record.expiresAt < new Date()) {
    throw new AppError(400, "INVALID_TOKEN", "Invalid or expired verification token.");
  }

  const user = await prisma.user.findUnique({ where: { id: record.userId } });
  if (!user) throw new AppError(404, "NOT_FOUND", "User not found.");

  // Do not activate suspended users
  if (user.status === "suspended") {
    throw new AppError(403, "ACCOUNT_SUSPENDED", "Account is suspended.");
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.emailVerification.update({
      where: { id: record.id },
      data: { verifiedAt: new Date() },
    });

    // Optional verification: only set emailVerifiedAt, never change status
    if (!user.emailVerifiedAt) {
      const updated = await tx.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      });
      return updated;
    }
    return user;
  });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "EMAIL_VERIFICATION_SUCCESS", ipAddress: clientInfo.ipAddress, userAgent: clientInfo.userAgent },
  });

  return toSafeUser(result);
}

export async function resendVerification(
  email: string,
  clientInfo: { ipAddress: string; userAgent: string },
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

  // Generic response — do not reveal existence. Only send if email not yet verified.
  if (!user) {
    logger.info("email.verification.resend_noop", { reason: "user_not_found" });
    return;
  }
  if (user.status === "suspended") return;
  if (user.emailVerifiedAt) {
    logger.info("email.verification.resend_noop", { reason: "already_verified", userId: user.id });
    return;
  }

  const env = getEnv();
  const { rawToken, hashedToken } = generateVerificationToken();
  const expiresAt = new Date(Date.now() + env.EMAIL_VERIFICATION_EXPIRES_HOURS * 60 * 60 * 1000);

  // Invalidate old unverified tokens
  await prisma.emailVerification.deleteMany({
    where: { userId: user.id, verifiedAt: null },
  });

  await prisma.emailVerification.create({
    data: { userId: user.id, tokenHash: hashedToken, expiresAt },
  });

  try {
    const verificationUrl = buildVerificationUrl(rawToken);
    await sendVerificationEmail({
      to: user.email,
      displayName: user.displayName,
      verificationUrl,
      expiresHours: env.EMAIL_VERIFICATION_EXPIRES_HOURS,
    });
    await prisma.auditLog.create({
      data: { userId: user.id, action: "EMAIL_VERIFICATION_RESENT", ipAddress: clientInfo.ipAddress, userAgent: clientInfo.userAgent },
    });
  } catch {
    logger.error("email.verification.resend_failed", { userId: user.id });
    await prisma.auditLog.create({
      data: { userId: user.id, action: "EMAIL_VERIFICATION_FAILED", ipAddress: clientInfo.ipAddress, userAgent: clientInfo.userAgent },
    });
  }
}
