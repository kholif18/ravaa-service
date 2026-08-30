import { describe, it, expect } from "vitest";
import { app } from "../src/app.js";

const EXPECTED_PATHS = [
  "/health",
  "/health/db",
  "/api/v1/auth/register",
  "/api/v1/auth/login",
  "/api/v1/auth/logout",
  "/api/v1/auth/refresh",
  "/api/v1/me",
  "/api/v1/sessions",
  "/api/v1/sessions/{id}",
];

describe("GET /openapi.json", () => {
  it("returns 200 with valid OpenAPI document", async () => {
    const res = await app.request("/openapi.json");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.openapi).toBeDefined();
    expect(body.info).toBeDefined();
    expect(body.info.title).toBe("Ravaa Service API");
    expect(body.info.version).toBe("1.0.0");
    expect(body.paths).toBeDefined();
    expect(body.components).toBeDefined();
    expect(body.components?.securitySchemes).toBeDefined();
  });

  it("contains all expected paths", async () => {
    const res = await app.request("/openapi.json");
    const body = await res.json();

    for (const path of EXPECTED_PATHS) {
      expect(body.paths[path]).toBeDefined();
    }
  });

  it("has security schemes defined", async () => {
    const res = await app.request("/openapi.json");
    const body = await res.json();

    expect(body.components.securitySchemes.BearerAuth).toBeDefined();
    expect(body.components.securitySchemes.BearerAuth.type).toBe("http");
    expect(body.components.securitySchemes.BearerAuth.scheme).toBe("bearer");
  });

  it("has error schemas defined", async () => {
    const res = await app.request("/openapi.json");
    const body = await res.json();

    expect(body.components.schemas.ErrorResponse).toBeDefined();
    expect(body.components.schemas.ValidationErrorResponse).toBeDefined();
    expect(body.components.schemas.UnauthorizedResponse).toBeDefined();
    expect(body.components.schemas.ConflictResponse).toBeDefined();
    expect(body.components.schemas.RateLimitResponse).toBeDefined();
    expect(body.components.schemas.AccountLockedResponse).toBeDefined();
  });

  it("has common schemas defined", async () => {
    const res = await app.request("/openapi.json");
    const body = await res.json();

    expect(body.components.schemas.SafeUser).toBeDefined();
    expect(body.components.schemas.SessionInfo).toBeDefined();
    expect(body.components.schemas.AuthResult).toBeDefined();
  });

  it("has tags defined", async () => {
    const res = await app.request("/openapi.json");
    const body = await res.json();

    const tagNames = body.tags.map((t: { name: string }) => t.name);
    expect(tagNames).toContain("Health");
    expect(tagNames).toContain("Authentication");
    expect(tagNames).toContain("Users");
    expect(tagNames).toContain("Sessions");
  });

  it("has operation IDs", async () => {
    const res = await app.request("/openapi.json");
    const body = await res.json();

    const operationIds: string[] = [];
    for (const path of Object.values(body.paths) as Record<string, { get?: { operationId?: string }; post?: { operationId?: string }; delete?: { operationId?: string } }>) {
      if (path.get?.operationId) operationIds.push(path.get.operationId);
      if (path.post?.operationId) operationIds.push(path.post.operationId);
      if (path.delete?.operationId) operationIds.push(path.delete.operationId);
    }

    expect(operationIds).toContain("healthCheck");
    expect(operationIds).toContain("databaseHealthCheck");
    expect(operationIds).toContain("register");
    expect(operationIds).toContain("login");
    expect(operationIds).toContain("refreshToken");
    expect(operationIds).toContain("logout");
    expect(operationIds).toContain("getCurrentUser");
    expect(operationIds).toContain("listSessions");
    expect(operationIds).toContain("revokeSession");
    expect(operationIds).toContain("revokeAllSessions");
  });
});

describe("GET /docs", () => {
  it("returns 200 with HTML content", async () => {
    const res = await app.request("/docs");
    expect(res.status).toBe(200);
    const contentType = res.headers.get("content-type");
    expect(contentType).toContain("text/html");
  });
});
