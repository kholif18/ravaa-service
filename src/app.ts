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
import * as authService from "./modules/auth/auth.service.js";
import * as sessionsService from "./modules/sessions/sessions.service.js";
import { openapiDoc } from "./docs/openapi.js";
import { apiReference } from "@scalar/hono-api-reference";
import { logger } from "./lib/logger.js";

const app = new Hono();

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.onError(errorHandler);

// ─── Global Middleware ────────────────────────────────────────────────────────

app.use("*", cors());

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

// ─── User ─────────────────────────────────────────────────────────────────────

app.get("/api/v1/me", authMiddleware(), async (c) => {
  const authCtx = c.get("auth");
  const user = await authService.getCurrentUser(authCtx.userId);
  return c.json({ user });
});

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
