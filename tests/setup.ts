import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const result = config({ path: resolve(__dirname, "../.env") });
console.log("Setup loaded:", result.parsed ? "success" : "failed");
console.log("DATABASE_URL:", process.env.DATABASE_URL ? "set" : "not set");
