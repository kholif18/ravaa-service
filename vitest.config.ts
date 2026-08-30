import { defineConfig } from "vitest/config";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(__dirname, ".env") });

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    env: {
      NODE_ENV: "test",
    },
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
