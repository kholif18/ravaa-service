import type { User } from "@prisma/client";

export type SafeUser = Omit<User, "passwordHash" | "failedLoginCount" | "lockedUntil" | "twoFactorSecret" | "twoFactorBackupCodes">;

export type AuthResult = {
  user: SafeUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type SessionInfo = {
  id: string;
  deviceName: string | null;
  deviceType: string | null;
  ipAddress: string | null;
  lastActiveAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
};
