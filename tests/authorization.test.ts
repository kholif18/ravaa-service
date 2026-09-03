import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db/index.js";
import * as authService from "../src/modules/auth/auth.service.js";
import {
  authorize,
  grantResourcePermission,
  revokeResourcePermission,
  checkApplicationScope,
  checkUserApplicationAccess,
  isApplicationActive,
  isUserAdmin,
} from "../src/lib/authorization.js";

let adminToken: string;
let adminUserId: string;
let regularToken: string;
let regularUserId: string;
let applicationId: string;
let permissionId: string;

const adminEmail = `admin_perm_${Date.now()}@test.com`;
const regularEmail = `user_perm_${Date.now()}@test.com`;

beforeAll(async () => {
  // Create admin user
  const adminResult = await authService.register(
    {
      email: adminEmail,
      username: `admin_perm_${Date.now()}`,
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
      username: `user_perm_${Date.now()}`,
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

  // Create application
  const appRes = await app.request("/api/v1/applications", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Test App",
      slug: `test-app-perm-${Date.now()}`,
    }),
  });
  const appBody = await appRes.json();
  if (!appBody.application) {
    console.error("Failed to create application:", appRes.status, JSON.stringify(appBody));
  }
  applicationId = appBody.application.id;

  // Create permission (handle existing from seed — idempotent)
  const permRes = await app.request("/api/v1/permissions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      resource: "drive",
      action: "read",
      description: "Read access to Drive",
    }),
  });
  if (permRes.status === 201) {
    const permBody = await permRes.json();
    permissionId = permBody.permission.id;
  } else if (permRes.status === 409) {
    // Already exists from seed — fetch it
    const listRes = await app.request("/api/v1/permissions", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const listBody = await listRes.json();
    const found = listBody.permissions.find(
      (p: any) => p.resource === "drive" && p.action === "read",
    );
    permissionId = found.id;
  } else {
    const permBody = await permRes.json();
    permissionId = permBody.permission.id;
  }
});

afterAll(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.resourcePermission.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.userApplicationAccess.deleteMany();
  await prisma.applicationScope.deleteMany();
  await prisma.application.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
});

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.resourcePermission.deleteMany();
});

describe("Permission CRUD", () => {
  describe("POST /api/v1/permissions", () => {
    it("creates permission as admin", async () => {
      const res = await app.request("/api/v1/permissions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resource: "office",
          action: "write",
          description: "Write access to Office",
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.permission).toBeDefined();
      expect(body.permission.resource).toBe("office");
      expect(body.permission.action).toBe("write");
    });

    it("returns 403 for non-admin user", async () => {
      const res = await app.request("/api/v1/permissions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${regularToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resource: "notes",
          action: "read",
        }),
      });

      expect(res.status).toBe(403);
    });

    it("returns 409 for duplicate permission", async () => {
      await app.request("/api/v1/permissions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resource: "drive",
          action: "delete",
        }),
      });

      const res = await app.request("/api/v1/permissions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resource: "drive",
          action: "delete",
        }),
      });

      expect(res.status).toBe(409);
    });
  });

  describe("GET /api/v1/permissions", () => {
    it("lists permissions as admin", async () => {
      const res = await app.request("/api/v1/permissions", {
        method: "GET",
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.permissions).toBeDefined();
      expect(Array.isArray(body.permissions)).toBe(true);
    });

    it("returns 403 for non-admin user", async () => {
      const res = await app.request("/api/v1/permissions", {
        method: "GET",
        headers: { Authorization: `Bearer ${regularToken}` },
      });

      expect(res.status).toBe(403);
    });
  });
});

describe("Authorization Engine", () => {
  describe("authorize()", () => {
    it("denies global access when no global grant exists", async () => {
      const result = await authorize({
        principalType: "USER",
        principalId: adminUserId,
        permission: "drive:read",
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("RESOURCE_ACCESS_DENIED");
    });

    it("denies access when permission does not exist", async () => {
      const result = await authorize({
        principalType: "USER",
        principalId: adminUserId,
        permission: "nonexistent:permission",
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("PERMISSION_NOT_FOUND");
    });

    it("denies access when no resource permission granted", async () => {
      const result = await authorize({
        principalType: "USER",
        principalId: regularUserId,
        permission: "drive:read",
        resource: { type: "drive_file", id: "00000000-0000-0000-0000-000000000000" },
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("RESOURCE_ACCESS_DENIED");
    });
  });

  describe("grantResourcePermission()", () => {
    it("grants permission on resource", async () => {
      const resourceId = "00000000-0000-0000-0000-000000000001";
      const result = await grantResourcePermission(
        "drive_file",
        resourceId,
        "USER",
        regularUserId,
        permissionId,
        adminUserId,
      );

      expect(result).toBeDefined();
      expect(result.effect).toBe("allow");
    });

    it("allows access after grant", async () => {
      const resourceId = "00000000-0000-0000-0000-000000000002";
      await grantResourcePermission(
        "drive_file",
        resourceId,
        "USER",
        regularUserId,
        permissionId,
        adminUserId,
      );

      const result = await authorize({
        principalType: "USER",
        principalId: regularUserId,
        permission: "drive:read",
        resource: { type: "drive_file", id: resourceId },
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe("revokeResourcePermission()", () => {
    it("revokes permission", async () => {
      const resourceId = "00000000-0000-0000-0000-000000000003";
      await grantResourcePermission(
        "drive_file",
        resourceId,
        "USER",
        regularUserId,
        permissionId,
        adminUserId,
      );

      const result = await revokeResourcePermission(
        "drive_file",
        resourceId,
        "USER",
        regularUserId,
        permissionId,
      );

      expect(result).toBeDefined();
      expect(result?.revokedAt).toBeDefined();
    });

    it("denies access after revoke", async () => {
      const resourceId = "00000000-0000-0000-0000-000000000004";
      await grantResourcePermission(
        "drive_file",
        resourceId,
        "USER",
        regularUserId,
        permissionId,
        adminUserId,
      );

      await revokeResourcePermission(
        "drive_file",
        resourceId,
        "USER",
        regularUserId,
        permissionId,
      );

      const result = await authorize({
        principalType: "USER",
        principalId: regularUserId,
        permission: "drive:read",
        resource: { type: "drive_file", id: resourceId },
      });

      expect(result.allowed).toBe(false);
    });
  });

  describe("checkApplicationScope()", () => {
    it("returns true when scope exists", async () => {
      await app.request(`/api/v1/applications/${applicationId}/scopes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scope: "drive:read",
        }),
      });

      const result = await checkApplicationScope(applicationId, "drive:read");
      expect(result).toBe(true);
    });

    it("returns false when scope does not exist", async () => {
      const result = await checkApplicationScope(applicationId, "nonexistent:scope");
      expect(result).toBe(false);
    });
  });

  describe("checkUserApplicationAccess()", () => {
    it("returns hasAccess true when access granted", async () => {
      await app.request(`/api/v1/applications/${applicationId}/access`, {
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

      const result = await checkUserApplicationAccess(regularUserId, applicationId, "drive:read");
      expect(result.hasAccess).toBe(true);
      expect(result.scopes).toContain("drive:read");
    });

    it("returns hasAccess false when no access", async () => {
      const result = await checkUserApplicationAccess(regularUserId, applicationId, "drive:write");
      expect(result.hasAccess).toBe(false);
    });
  });

  describe("isApplicationActive()", () => {
    it("returns true for active application", async () => {
      const result = await isApplicationActive(applicationId);
      expect(result).toBe(true);
    });

    it("returns false for disabled application", async () => {
      await app.request(`/api/v1/applications/${applicationId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const result = await isApplicationActive(applicationId);
      expect(result).toBe(false);
    });
  });

  describe("isUserAdmin()", () => {
    it("returns true for admin user", async () => {
      const result = await isUserAdmin(adminUserId);
      expect(result).toBe(true);
    });

    it("returns false for regular user", async () => {
      const result = await isUserAdmin(regularUserId);
      expect(result).toBe(false);
    });
  });
});

describe("HTTP Semantics", () => {
  it("returns 401 for unauthenticated request to permission endpoint", async () => {
    const res = await app.request("/api/v1/permissions", {
      method: "GET",
    });

    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin user on permission endpoint", async () => {
    const res = await app.request("/api/v1/permissions", {
      method: "GET",
      headers: { Authorization: `Bearer ${regularToken}` },
    });

    expect(res.status).toBe(403);
  });
});

describe("Security", () => {
  it("User A cannot use User B's permission", async () => {
    const resourceId = "00000000-0000-0000-0000-000000000005";
    await grantResourcePermission(
      "drive_file",
      resourceId,
      "USER",
      adminUserId,
      permissionId,
      adminUserId,
    );

    const result = await authorize({
      principalType: "USER",
      principalId: regularUserId,
      permission: "drive:read",
      resource: { type: "drive_file", id: resourceId },
    });

    expect(result.allowed).toBe(false);
  });

  it("permission with invalid format is denied", async () => {
    const result = await authorize({
      principalType: "USER",
      principalId: adminUserId,
      permission: "invalid",
    });

    expect(result.allowed).toBe(false);
  });
});
