import { prisma } from "../../db/index.js";
import { authorize } from "../../lib/authorization.js";

export type IntrospectResult = { valid: true; userId: string; sessionId: string } | { valid: false; reason: "REVOKED" };

/**
 * Validate Ravaa session for server-to-server introspection.
 * Returns valid:true only if:
 *  - session exists
 *  - session.userId === userId
 *  - session.revokedAt is null
 *  - session.expiresAt > now
 *  - user exists and status is active or pending
 * All other cases -> valid:false reason REVOKED (enumeration resistant)
 */
export async function introspectSession(userId: string, sessionId: string): Promise<IntrospectResult> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });

  if (!session) {
    return { valid: false, reason: "REVOKED" };
  }

  if (session.userId !== userId) {
    return { valid: false, reason: "REVOKED" };
  }

  if (session.revokedAt) {
    return { valid: false, reason: "REVOKED" };
  }

  if (session.expiresAt < new Date()) {
    return { valid: false, reason: "REVOKED" };
  }

  if (!session.user) {
    return { valid: false, reason: "REVOKED" };
  }

  if (session.user.status !== "active" && session.user.status !== "pending") {
    return { valid: false, reason: "REVOKED" };
  }

  return { valid: true, userId: session.userId, sessionId: session.id };
}

export async function checkAuthorization(input: {
  principalType: "USER" | "APPLICATION" | "SYSTEM";
  principalId: string;
  permission: string;
  resourceType?: string;
  resourceId?: string;
}): Promise<{ allowed: boolean; reason: string }> {
  const resource =
    input.resourceType && input.resourceId
      ? { type: input.resourceType, id: input.resourceId }
      : undefined;

  const result = await authorize({
    principalType: input.principalType,
    principalId: input.principalId,
    permission: input.permission,
    resource,
  });

  return result;
}
