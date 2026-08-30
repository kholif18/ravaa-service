import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db/index.js";
import * as authService from "../src/modules/auth/auth.service.js";

let adminToken: string;
let adminUserId: string;
let regularToken: string;
let regularUserId: string;

const adminEmail = `admin_app_${Date.now()}@test.com`;
const regularEmail = `user_app_${Date.now()}@test.com`;

beforeAll(async () => {
  // Create admin user
  const adminResult = await authService.register(
    {
      email: adminEmail,
      username: `admin_app_${Date.now()}`,
      password: "password123",
    },
    { ipAddress: "127.0.0.1", userAgent: "test" }
  );
  adminToken = adminResult.accessToken;
  adminUserId = adminResult.user.id;

  await prisma.user.update({
    where: { id: adminUserId },
    data: { role: "ADMIN", status: "active" },
  });

  // Create regular user
  const regularResult = await authService.register(
    {
      email: regularEmail,
      username: `user_app_${Date.now()}`,
      password: "password123",
    },
    { ipAddress: "127.0.0.1", userAgent: "test" }
  );
  regularToken = regularResult.accessToken;
  regularUserId = regularResult.user.id;

  await prisma.user.update({
    where: { id: regularUserId },
    data: { status: "active" },
  });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.userApplicationAccess.deleteMany();
  await prisma.applicationScope.deleteMany();
  await prisma.application.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
});

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.userApplicationAccess.deleteMany();
  await prisma.applicationScope.deleteMany();
  await prisma.application.deleteMany();
});

describe("Application CRUD", () => {
  describe("POST /api/v1/applications", () => {
    it("creates application as admin", async () => {
      const res = await app.request("/api/v1/applications", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Ravaa Drive",
          slug: "ravaa-drive",
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.application).toBeDefined();
      expect(body.clientSecret).toBeDefined();
      expect(body.application.name).toBe("Ravaa Drive");
      expect(body.application.slug).toBe("ravaa-drive");
      expect(body.application.clientId).toMatch(/^ravaa-drive_/);
      expect(body.application.status).toBe("active");
    });

    it("returns 403 for non-admin user", async () => {
      const res = await app.request("/api/v1/applications", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${regularToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Test App",
          slug: "test-app",
        }),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe("AUTHORIZATION_ERROR");
    });

    it("returns 401 for unauthenticated request", async () => {
      const res = await app.request("/api/v1/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test App",
          slug: "test-app",
        }),
      });

      expect(res.status).toBe(401);
    });

    it("returns 409 for duplicate slug", async () => {
      await app.request("/api/v1/applications", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Ravaa Drive",
          slug: "ravaa-drive",
        }),
      });

      const res = await app.request("/api/v1/applications", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Ravaa Drive 2",
          slug: "ravaa-drive",
        }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe("CONFLICT");
    });

    it("returns 400 for invalid input", async () => {
      const res = await app.request("/api/v1/applications", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "",
          slug: "ab",
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/v1/applications", () => {
    it("lists applications as admin", async () => {
      await app.request("/api/v1/applications", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Ravaa Drive",
          slug: "ravaa-drive",
        }),
      });

      const res = await app.request("/api/v1/applications", {
        method: "GET",
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.applications).toBeDefined();
      expect(body.applications.length).toBe(1);
    });

    it("returns 403 for non-admin user", async () => {
      const res = await app.request("/api/v1/applications", {
        method: "GET",
        headers: { Authorization: `Bearer ${regularToken}` },
      });

      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/v1/applications/:id", () => {
    it("gets application as admin", async () => {
      const createRes = await app.request("/api/v1/applications", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Ravaa Drive",
          slug: "ravaa-drive",
        }),
      });

      const createBody = await createRes.json();
      const appId = createBody.application.id;

      const res = await app.request(`/api/v1/applications/${appId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.application.id).toBe(appId);
      expect(body.application.name).toBe("Ravaa Drive");
    });

    it("returns 404 for non-existent application", async () => {
      const res = await app.request("/api/v1/applications/00000000-0000-0000-0000-000000000000", {
        method: "GET",
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/v1/applications/:id", () => {
    it("updates application as admin", async () => {
      const createRes = await app.request("/api/v1/applications", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Ravaa Drive",
          slug: "ravaa-drive",
        }),
      });

      const createBody = await createRes.json();
      const appId = createBody.application.id;

      const res = await app.request(`/api/v1/applications/${appId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Ravaa Drive Updated",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.application.name).toBe("Ravaa Drive Updated");
    });

    it("updates application status", async () => {
      const createRes = await app.request("/api/v1/applications", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Ravaa Drive",
          slug: "ravaa-drive",
        }),
      });

      const createBody = await createRes.json();
      const appId = createBody.application.id;

      const res = await app.request(`/api/v1/applications/${appId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "suspended",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.application.status).toBe("suspended");
    });
  });

  describe("DELETE /api/v1/applications/:id", () => {
    it("disables application as admin", async () => {
      const createRes = await app.request("/api/v1/applications", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Ravaa Drive",
          slug: "ravaa-drive",
        }),
      });

      const createBody = await createRes.json();
      const appId = createBody.application.id;

      const res = await app.request(`/api/v1/applications/${appId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(204);

      const getRes = await app.request(`/api/v1/applications/${appId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const getBody = await getRes.json();
      expect(getBody.application.status).toBe("disabled");
    });
  });
});

describe("Client Secret", () => {
  it("returns secret only on create", async () => {
    const createRes = await app.request("/api/v1/applications", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Ravaa Drive",
        slug: "ravaa-drive",
      }),
    });

    const createBody = await createRes.json();
    expect(createBody.clientSecret).toBeDefined();
    expect(typeof createBody.clientSecret).toBe("string");
    expect(createBody.clientSecret.length).toBeGreaterThan(0);

    const appId = createBody.application.id;

    const getRes = await app.request(`/api/v1/applications/${appId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const getBody = await getRes.json();
    expect(getBody.application.clientSecretHash).toBeUndefined();
    expect(getBody.clientSecret).toBeUndefined();
  });

  it("does not expose secret in list", async () => {
    await app.request("/api/v1/applications", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Ravaa Drive",
        slug: "ravaa-drive",
      }),
    });

    const res = await app.request("/api/v1/applications", {
      method: "GET",
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const body = await res.json();
    expect(body.applications[0].clientSecretHash).toBeUndefined();
    expect(body.applications[0].clientSecret).toBeUndefined();
  });
});

describe("Secret Rotation", () => {
  it("rotates secret as admin", async () => {
    const createRes = await app.request("/api/v1/applications", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Ravaa Drive",
        slug: "ravaa-drive",
      }),
    });

    const createBody = await createRes.json();
    const appId = createBody.application.id;

    const res = await app.request(`/api/v1/applications/${appId}/rotate-secret`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clientSecret).toBeDefined();
    expect(typeof body.clientSecret).toBe("string");
  });

  it("returns 404 for non-existent application", async () => {
    const res = await app.request("/api/v1/applications/00000000-0000-0000-0000-000000000000/rotate-secret", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(404);
  });
});

describe("Application Scopes", () => {
  let appId: string;

  beforeEach(async () => {
    const createRes = await app.request("/api/v1/applications", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Ravaa Drive",
        slug: "ravaa-drive",
      }),
    });

    const createBody = await createRes.json();
    appId = createBody.application.id;
  });

  it("creates scope", async () => {
    const res = await app.request(`/api/v1/applications/${appId}/scopes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scope: "drive:read",
        description: "Read access to Drive files",
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.scope.scope).toBe("drive:read");
    expect(body.scope.description).toBe("Read access to Drive files");
  });

  it("lists scopes", async () => {
    await app.request(`/api/v1/applications/${appId}/scopes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scope: "drive:read",
      }),
    });

    const res = await app.request(`/api/v1/applications/${appId}/scopes`, {
      method: "GET",
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scopes.length).toBe(1);
    expect(body.scopes[0].scope).toBe("drive:read");
  });

  it("deletes scope", async () => {
    const createRes = await app.request(`/api/v1/applications/${appId}/scopes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scope: "drive:read",
      }),
    });

    const createBody = await createRes.json();
    const scopeId = createBody.scope.id;

    const res = await app.request(`/api/v1/applications/${appId}/scopes/${scopeId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(204);
  });

  it("returns 409 for duplicate scope", async () => {
    await app.request(`/api/v1/applications/${appId}/scopes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scope: "drive:read",
      }),
    });

    const res = await app.request(`/api/v1/applications/${appId}/scopes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scope: "drive:read",
      }),
    });

    expect(res.status).toBe(409);
  });
});

describe("User Application Access", () => {
  let appId: string;

  beforeEach(async () => {
    const createRes = await app.request("/api/v1/applications", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Ravaa Drive",
        slug: "ravaa-drive",
      }),
    });

    const createBody = await createRes.json();
    appId = createBody.application.id;
  });

  it("grants access", async () => {
    const res = await app.request(`/api/v1/applications/${appId}/access`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: regularUserId,
        scopes: ["drive:read", "drive:write"],
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.access.userId).toBe(regularUserId);
    expect(body.access.scopes).toEqual(["drive:read", "drive:write"]);
  });

  it("lists access", async () => {
    await app.request(`/api/v1/applications/${appId}/access`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: regularUserId,
        scopes: ["drive:read"],
      }),
    });

    const res = await app.request(`/api/v1/applications/${appId}/access`, {
      method: "GET",
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.access.length).toBe(1);
  });

  it("revokes access", async () => {
    const createRes = await app.request(`/api/v1/applications/${appId}/access`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: regularUserId,
        scopes: ["drive:read"],
      }),
    });

    const createBody = await createRes.json();
    const accessId = createBody.access.id;

    const res = await app.request(`/api/v1/applications/${appId}/access/${accessId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(204);
  });

  it("returns 409 for duplicate access grant", async () => {
    await app.request(`/api/v1/applications/${appId}/access`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: regularUserId,
        scopes: ["drive:read"],
      }),
    });

    const res = await app.request(`/api/v1/applications/${appId}/access`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: regularUserId,
        scopes: ["drive:read"],
      }),
    });

    expect(res.status).toBe(409);
  });
});

describe("Application Status", () => {
  it("rejects suspended application from authentication", async () => {
    const createRes = await app.request("/api/v1/applications", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Ravaa Drive",
        slug: "ravaa-drive",
      }),
    });

    const createBody = await createRes.json();
    const appId = createBody.application.id;
    const clientId = createBody.application.clientId;

    await app.request(`/api/v1/applications/${appId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: "suspended",
      }),
    });

    const { authenticateApplication } = await import("../src/lib/application-auth.js");
    
    await expect(
      authenticateApplication(clientId, "any-secret")
    ).rejects.toThrow();
  });

  it("rejects disabled application from authentication", async () => {
    const createRes = await app.request("/api/v1/applications", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Ravaa Drive",
        slug: "ravaa-drive",
      }),
    });

    const createBody = await createRes.json();
    const appId = createBody.application.id;
    const clientId = createBody.application.clientId;

    await app.request(`/api/v1/applications/${appId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const { authenticateApplication } = await import("../src/lib/application-auth.js");
    
    await expect(
      authenticateApplication(clientId, "any-secret")
    ).rejects.toThrow();
  });
});

describe("Security", () => {
  it("secret never appears in GET response", async () => {
    const createRes = await app.request("/api/v1/applications", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Ravaa Drive",
        slug: "ravaa-drive",
      }),
    });

    const createBody = await createRes.json();
    const appId = createBody.application.id;
    const secret = createBody.clientSecret;

    const getRes = await app.request(`/api/v1/applications/${appId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const getBody = await getRes.json();
    expect(JSON.stringify(getBody)).not.toContain(secret);
  });

  it("non-admin cannot access admin endpoints", async () => {
    const endpoints = [
      { method: "GET", path: "/api/v1/applications" },
      { method: "POST", path: "/api/v1/applications" },
    ];

    for (const endpoint of endpoints) {
      const res = await app.request(endpoint.path, {
        method: endpoint.method,
        headers: {
          Authorization: `Bearer ${regularToken}`,
          "Content-Type": "application/json",
        },
        body: endpoint.method === "POST" ? JSON.stringify({ name: "Test", slug: "test" }) : undefined,
      });

      expect(res.status).toBe(403);
    }
  });
});
