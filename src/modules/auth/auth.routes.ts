import { createRouter } from "../../factory.js";
import { setCookie, getCookie } from "hono/cookie";
import { registerSchema, loginSchema, refreshSchema, verifyEmailSchema, resendVerificationSchema } from "./auth.schema.js";
import * as authService from "./auth.service.js";
import * as emailVerificationService from "./email-verification.service.js";
import { rateLimit } from "../../middlewares/rate-limit.middleware.js";
import { ValidationError } from "../../lib/errors.js";

const auth = createRouter();

auth.post("/register", async (c) => {
  const body = await c.req.json();
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }

  const { deviceName, deviceType } = body;
  const clientInfo = {
    ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown",
    userAgent: c.req.header("user-agent") ?? "unknown",
  };

  const result = await authService.register(parsed.data, clientInfo, deviceName, deviceType);

  setCookie(c, "refreshToken", result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  return c.json({
    user: result.user,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresIn: result.expiresIn,
  }, 201);
});

auth.post("/login", async (c) => {
  const body = await c.req.json();
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }

  const clientInfo = {
    ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown",
    userAgent: c.req.header("user-agent") ?? "unknown",
  };

  const result = await authService.login(parsed.data, clientInfo);

  setCookie(c, "refreshToken", result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  return c.json({
    user: result.user,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresIn: result.expiresIn,
  });
});

auth.post("/refresh", async (c) => {
  let refreshToken: string | undefined;

  try {
    const body = await c.req.json();
    const parsed = refreshSchema.safeParse(body);
    if (parsed.success) {
      refreshToken = parsed.data.refreshToken;
    }
  } catch {
    // Ignore parse error
  }

  if (!refreshToken) {
    refreshToken = getCookie(c, "refreshToken");
  }

  if (!refreshToken) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Refresh token required" } }, 400);
  }

  const clientInfo = {
    ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown",
    userAgent: c.req.header("user-agent") ?? "unknown",
  };

  const result = await authService.refresh(refreshToken, clientInfo);

  setCookie(c, "refreshToken", result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  return c.json({
    accessToken: result.accessToken,
    expiresIn: result.expiresIn,
  });
});

auth.post("/verify-email", async (c) => {
  const body = await c.req.json();
  const parsed = verifyEmailSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }
  const clientInfo = {
    ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown",
    userAgent: c.req.header("user-agent") ?? "unknown",
  };
  const user = await emailVerificationService.verifyEmail(parsed.data.token, clientInfo);
  return c.json({ message: "Email verified successfully.", user });
});

auth.post(
  "/resend-verification",
  rateLimit({ windowMs: 15 * 60 * 1000, maxRequests: 5 }),
  async (c) => {
    const body = await c.req.json();
    const parsed = resendVerificationSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }
    const clientInfo = {
      ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown",
      userAgent: c.req.header("user-agent") ?? "unknown",
    };
    await emailVerificationService.resendVerification(parsed.data.email, clientInfo);
    return c.json({ message: "If the account requires verification, a new email will be sent." });
  },
);

export { auth };
