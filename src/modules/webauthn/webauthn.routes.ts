import { createRouter } from "../../factory.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import * as webauthnService from "./webauthn.service.js";
import { prisma } from "../../db/index.js";
import { signAccessToken, signRefreshToken, hashToken } from "../../lib/jwt.js";

const webauthn = createRouter();

// POST /api/v1/webauthn/register/options (auth)
webauthn.post("/register/options", authMiddleware(), async (c) => {
  const { userId } = c.get("auth");
  const options = await webauthnService.getRegistrationOptions(userId);
  return c.json(options);
});

webauthn.post("/register/verify", authMiddleware(), async (c) => {
  const { userId } = c.get("auth");
  const body = await c.req.json();
  const { deviceName, ...credential } = body;
  await webauthnService.verifyRegistration(userId, credential, deviceName);
  return c.json({ verified: true });
});

webauthn.get("/credentials", authMiddleware(), async (c) => {
  const { userId } = c.get("auth");
  const list = await webauthnService.listCredentials(userId);
  return c.json({ credentials: list });
});

webauthn.delete("/credentials/:id", authMiddleware(), async (c) => {
  const { userId } = c.get("auth");
  const id = c.req.param("id") as string;
  if (!id) return c.json({ error: { code: "VALIDATION_ERROR", message: "id required" } }, 400);
  await webauthnService.deleteCredential(userId, id);
  return c.json({ success: true });
});

// Public login with passkey
webauthn.post("/login/options", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const identifier = body.identifier as string | undefined;
  const options = await webauthnService.getAuthenticationOptions(identifier);
  return c.json(options);
});

webauthn.post("/login/verify", async (c) => {
  const body = await c.req.json();
  const { identifier, credential } = body;
  if (!identifier || !credential) return c.json({ error: { code: "VALIDATION_ERROR", message: "identifier and credential required" } }, 400);
  const user = await webauthnService.verifyAuthentication(identifier, credential);
  // Create session like normal login
  const refreshToken = await signRefreshToken();
  const refreshTokenHash = await hashToken(refreshToken);
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash,
      deviceName: "Passkey",
      deviceType: "webauthn",
      ipAddress: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown",
      userAgent: c.req.header("user-agent") || "unknown",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  const accessToken = await signAccessToken(user.id, session.id);
  return c.json({ user: { id: user.id, email: user.email, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl, role: user.role }, accessToken, refreshToken, expiresIn: 900 });
});

export { webauthn };
