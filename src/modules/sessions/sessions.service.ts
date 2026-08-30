import { prisma } from "../../db/index.js";
import { NotFoundError } from "../../lib/errors.js";
import type { SessionInfo } from "../auth/auth.types.js";

export async function listSessions(userId: string): Promise<SessionInfo[]> {
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

  return sessions;
}

export async function revokeSession(sessionId: string, userId: string): Promise<void> {
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
}
