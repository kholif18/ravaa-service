import { Hono } from "hono";
import { cors } from "hono/cors";
import { deleteCookie } from "hono/cookie";
import { prisma } from "./db/index.js";
import { errorHandler } from "./middlewares/error-handler.middleware.js";
import { rateLimit } from "./middlewares/rate-limit.middleware.js";
import { authMiddleware } from "./middlewares/auth.middleware.js";
import { auth } from "./modules/auth/auth.routes.js";
import { applications } from "./modules/applications/applications.routes.js";
import { permissions } from "./modules/permissions/permissions.routes.js";
import { me } from "./modules/me/me.routes.js";
import { users } from "./modules/users/users.routes.js";
import { internal } from "./modules/internal/internal.routes.js";
import { mobile } from "./modules/mobile/mobile.routes.js";
import * as authService from "./modules/auth/auth.service.js";
import * as sessionsService from "./modules/sessions/sessions.service.js";
import { openapiDoc } from "./docs/openapi.js";
import { apiReference } from "@scalar/hono-api-reference";
import { logger } from "./lib/logger.js";

const app = new Hono();

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.onError(errorHandler);

// ─── Global Middleware ────────────────────────────────────────────────────────

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:3001",
  process.env.ACCOUNT_WEB_URL,
  "https://tesdrive.ravaa.my.id",
  "https://testoffice.ravaa.my.id",
].filter(Boolean) as string[];

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return allowedOrigins[0];
      if (allowedOrigins.includes(origin)) return origin;
      // Allow any localhost for dev (with port)
      if (/^http:\/\/localhost:\d+$/.test(origin)) return origin;
      if (/^http:\/\/192\.168\.\d+\.\d+:\d+$/.test(origin)) return origin;
      return allowedOrigins[0];
    },
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);

if (process.env.NODE_ENV !== "test") {
  app.use("/api/*", rateLimit({ windowMs: 60_000, maxRequests: 100 }));
  app.use("/api/v1/auth/*", rateLimit({ windowMs: 60_000, maxRequests: 20 }));
}

// ─── OpenAPI + Docs ───────────────────────────────────────────────────────────

app.get("/openapi.json", (c) => {
  return c.json(openapiDoc);
});

app.get("/docs", apiReference({ spec: { url: "/openapi.json" } }));

// ─── Health ───────────────────────────────────────────────────────────────────

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

app.get("/health/db", async (c) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return c.json({ status: "ok", database: "connected" });
  } catch {
    logger.error("Database health check failed");
    return c.json({ status: "error", database: "disconnected" }, 503);
  }
});

// ─── Public Auth Routes ───────────────────────────────────────────────────────

app.route("/api/v1/auth", auth);

// ─── Application Routes (Admin only) ──────────────────────────────────────────

app.route("/api/v1/applications", applications);

// ─── Permissions Routes (Admin only) ──────────────────────────────────────────

app.route("/api/v1/permissions", permissions);

// ─── Protected Auth Routes ────────────────────────────────────────────────────

app.post("/api/v1/auth/logout", authMiddleware(), async (c) => {
  const authCtx = c.get("auth");
  await authService.logout(authCtx.sessionId, authCtx.userId);
  deleteCookie(c, "refreshToken", { path: "/" });
  return c.json({ message: "Logged out" });
});

// ─── Me (User) Routes ─────────────────────────────────────────────────────────

app.route("/api/v1/me", me);

// ─── Internal (Server-to-Server) ────────────────────────────────────────────────

app.route("/api/v1/internal", internal);

// ─── Admin Users (Phase 7.4) ──────────────────────────────────────────────────

app.route("/api/v1/admin/users", users);

// ─── Mobile Gateway for Android (Drive + Notes proxy) ─────────────────────────

app.route("/api/v1/mobile", mobile);

// ─── Sessions ─────────────────────────────────────────────────────────────────

app.get("/api/v1/sessions", authMiddleware(), async (c) => {
  const authCtx = c.get("auth");
  const sessionList = await sessionsService.listSessions(authCtx.userId);
  return c.json({ sessions: sessionList });
});

app.delete("/api/v1/sessions/:id", authMiddleware(), async (c) => {
  const authCtx = c.get("auth");
  const sessionId = c.req.param("id") as string;
  await sessionsService.revokeSession(sessionId, authCtx.userId);
  return c.json({ message: "Session revoked" });
});

app.delete("/api/v1/sessions", authMiddleware(), async (c) => {
  const authCtx = c.get("auth");
  await authService.logoutAll(authCtx.userId);
  return c.json({ message: "All sessions revoked" });
});

// ─── 404 ──────────────────────────────────────────────────────────────────────

app.notFound((c) => {
  return c.json(
    { error: { code: "NOT_FOUND", message: "Not found" } },
    404,
  );
});

export { app };
