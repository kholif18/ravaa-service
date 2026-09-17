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
    storageLimit: u.storageLimit ? Number(u.storageLimit) : 5368709120,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  } as any;
}

export async function updateUserStorage(userId: string, storageLimit: number): Promise<SafeUser> {
  const user = await prisma.user.update({ where: { id: userId }, data: { storageLimit: BigInt(storageLimit) } });
  return toSafeUser(user);
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
