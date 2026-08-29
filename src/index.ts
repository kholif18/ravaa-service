import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { getEnv } from "./env.js";
import { logger } from "./lib/logger.js";

const env = getEnv();

const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    logger.info(`🚀 Ravaa Service running on http://localhost:${info.port}`);
    logger.info(`📋 Health check: http://localhost:${info.port}/health`);
    logger.info(`🗄️  Database health: http://localhost:${info.port}/health/db`);
  },
);

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down...");
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down...");
  server.close(() => process.exit(0));
});
