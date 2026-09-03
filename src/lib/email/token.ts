import { randomBytes, createHash } from "node:crypto";

export function generateVerificationToken(): { rawToken: string; hashedToken: string } {
  const rawToken = randomBytes(32).toString("base64url");
  const hashedToken = createHash("sha256").update(rawToken).digest("hex");
  return { rawToken, hashedToken };
}

export function hashVerificationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
