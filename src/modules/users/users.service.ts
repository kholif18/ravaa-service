import { prisma } from "../../db/index.js";
import type { SafeUser } from "../auth/auth.types.js";

function toSafeUser(u: any): SafeUser {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    role: u.role,
    status: u.status,
    emailVerifiedAt: u.emailVerifiedAt,
    recoveryEmail: u.recoveryEmail ?? null,
    recoveryPhone: u.recoveryPhone ?? null,
    twoFactorEnabled: u.twoFactorEnabled ?? false,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  } as SafeUser;
}

export async function listAllUsers(): Promise<SafeUser[]> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
  });
  return users.map(toSafeUser);
}

export async function getUserById(id: string): Promise<SafeUser | null> {
  const user = await prisma.user.findUnique({ where: { id } });
  return user ? toSafeUser(user) : null;
}
