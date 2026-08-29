import { Hono } from "hono";
import { cors } from "hono/cors";
import { prisma } from "./db/index.js";
import { errorHandler } from "./middlewares/error-handler.middleware.js";
import { rateLimit } from "./middlewares/rate-limit.middleware.js";
import { logger } from "./lib/logger.js";

const app = new Hono();

// ─── Global Middleware ────────────────────────────────────────────────────────

app.use("*", cors());
app.use("*", errorHandler());
app.use("/api/*", rateLimit({ windowMs: 60_000, maxRequests: 100 }));

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

// ─── 404 ──────────────────────────────────────────────────────────────────────

app.notFound((c) => {
  return c.json(
    { error: { code: "NOT_FOUND", message: "Not found" } },
    404,
  );
});

export { app };
