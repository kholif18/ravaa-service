import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { getEnv } from "../env.js";

export interface AccessTokenPayload extends JWTPayload {
  sub: string;
  sid: string;
}

function getJwtSecret(): Uint8Array {
  const env = getEnv();
  return new TextEncoder().encode(env.JWT_SECRET);
}



export async function signAccessToken(userId: string, sessionId: string): Promise<string> {
  const secret = getJwtSecret();
  return new SignJWT({ sub: userId, sid: sessionId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .setIssuer("ravaa-service")
    .setAudience("ravaa")
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const secret = getJwtSecret();
  const { payload } = await jwtVerify(token, secret, {
    issuer: "ravaa-service",
    audience: "ravaa",
  });
  return payload as AccessTokenPayload;
}

export async function signRefreshToken(): Promise<string> {
  const { randomBytes } = await import("node:crypto");
  return new Promise((resolve, reject) => {
    randomBytes(48, (err, buf) => {
      if (err) return reject(err);
      resolve(buf.toString("base64url"));
    });
  });
}

export async function hashToken(token: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(token).digest("hex");
}
