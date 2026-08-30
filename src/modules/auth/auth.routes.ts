import { createRouter } from "../../factory.js";
import { setCookie } from "hono/cookie";
import { registerSchema, loginSchema, refreshSchema } from "./auth.schema.js";
import * as authService from "./auth.service.js";
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
    refreshToken = c.req.header("Cookie")?.match(/refreshToken=([^;]+)/)?.[1];
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

export { auth };
