import { describe, it, expect } from "vitest";
import { app } from "../src/app.js";

describe("GET /health/db", () => {
  it("returns database status", async () => {
    const res = await app.request("/health/db");
    const body = await res.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("database");
    // When DB is not running, expect 503 with disconnected
    // When DB is running, expect 200 with connected
    if (res.status === 200) {
      expect(body.status).toBe("ok");
      expect(body.database).toBe("connected");
    } else {
      expect(res.status).toBe(503);
      expect(body.status).toBe("error");
      expect(body.database).toBe("disconnected");
    }
  });
});
