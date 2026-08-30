import { createRouter } from "../../factory.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requireAdmin } from "../../middlewares/admin.middleware.js";
import { createPermissionSchema, grantResourcePermissionSchema, revokeResourcePermissionSchema } from "./permissions.schema.js";
import * as permissionsService from "./permissions.service.js";
import { ValidationError } from "../../lib/errors.js";

const permissions = createRouter();

// ─── Permission Catalogue (Admin only) ────────────────────────────────────────

permissions.post("/", authMiddleware(), requireAdmin(), async (c) => {
  const body = await c.req.json();
  const parsed = createPermissionSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }

  const permission = await permissionsService.createPermission(parsed.data);
  return c.json({ permission }, 201);
});

permissions.get("/", authMiddleware(), requireAdmin(), async (c) => {
  const permissionList = await permissionsService.listPermissions();
  return c.json({ permissions: permissionList });
});

permissions.get("/:id", authMiddleware(), requireAdmin(), async (c) => {
  const id = c.req.param("id") as string;
  const permission = await permissionsService.getPermission(id);
  return c.json({ permission });
});

permissions.delete("/:id", authMiddleware(), requireAdmin(), async (c) => {
  const id = c.req.param("id") as string;
  await permissionsService.deletePermission(id);
  return c.body(null, 204);
});

// ─── Resource Permissions ─────────────────────────────────────────────────────

permissions.post("/grant", authMiddleware(), requireAdmin(), async (c) => {
  const body = await c.req.json();
  const parsed = grantResourcePermissionSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }

  const result = await permissionsService.grantPermission(parsed.data);
  return c.json({ permission: result }, 201);
});

permissions.post("/revoke", authMiddleware(), requireAdmin(), async (c) => {
  const body = await c.req.json();
  const parsed = revokeResourcePermissionSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }

  const result = await permissionsService.revokePermission(parsed.data);
  return c.json({ revoked: result !== null });
});

permissions.get("/resource/:type/:id", authMiddleware(), requireAdmin(), async (c) => {
  const resourceType = c.req.param("type") as string;
  const resourceId = c.req.param("id") as string;
  const permissionsList = await permissionsService.getResourcePermissions(resourceType, resourceId);
  return c.json({ permissions: permissionsList });
});

permissions.get("/principal/:type/:id", authMiddleware(), requireAdmin(), async (c) => {
  const principalType = c.req.param("type") as string;
  const principalId = c.req.param("id") as string;
  const permissionsList = await permissionsService.getPrincipalPermissions(principalType as "USER" | "APPLICATION" | "SYSTEM", principalId);
  return c.json({ permissions: permissionsList });
});

export { permissions };
