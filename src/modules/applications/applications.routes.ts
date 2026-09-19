import { createRouter } from "../../factory.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requireAdmin } from "../../middlewares/admin.middleware.js";
import { createApplicationSchema, updateApplicationSchema, createScopeSchema, grantAccessSchema } from "./applications.schema.js";
import * as applicationsService from "./applications.service.js";
import { ValidationError } from "../../lib/errors.js";

const applications = createRouter();

// ─── Application CRUD (Admin only) ────────────────────────────────────────────

applications.post("/", authMiddleware(), requireAdmin(), async (c) => {
  const body = await c.req.json();
  const parsed = createApplicationSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }

  const auth = c.get("auth");
  const clientInfo = {
    ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown",
    userAgent: c.req.header("user-agent") ?? "unknown",
  };

  const result = await applicationsService.createApplication(parsed.data, auth.userId, clientInfo);

  return c.json({ application: result, clientSecret: result.clientSecret }, 201);
});

applications.get("/", authMiddleware(), async (c) => {
  const applicationList = await applicationsService.listApplications();
  return c.json({ applications: applicationList });
});

applications.get("/:id", authMiddleware(), requireAdmin(), async (c) => {
  const id = c.req.param("id") as string;
  const application = await applicationsService.getApplication(id);
  return c.json({ application });
});

applications.patch("/:id", authMiddleware(), requireAdmin(), async (c) => {
  const id = c.req.param("id") as string;
  const body = await c.req.json();
  const parsed = updateApplicationSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }

  const auth = c.get("auth");
  const clientInfo = {
    ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown",
    userAgent: c.req.header("user-agent") ?? "unknown",
  };

  const application = await applicationsService.updateApplication(id, parsed.data, auth.userId, clientInfo);
  return c.json({ application });
});

applications.delete("/:id", authMiddleware(), requireAdmin(), async (c) => {
  const id = c.req.param("id") as string;
  const auth = c.get("auth");
  const clientInfo = {
    ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown",
    userAgent: c.req.header("user-agent") ?? "unknown",
  };

  await applicationsService.deleteApplication(id, auth.userId, clientInfo);
  return c.body(null, 204);
});

// ─── Secret Rotation ──────────────────────────────────────────────────────────

applications.post("/:id/rotate-secret", authMiddleware(), requireAdmin(), async (c) => {
  const id = c.req.param("id") as string;
  const auth = c.get("auth");
  const clientInfo = {
    ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown",
    userAgent: c.req.header("user-agent") ?? "unknown",
  };

  const result = await applicationsService.rotateSecret(id, auth.userId, clientInfo);
  return c.json({ clientSecret: result.clientSecret });
});

// ─── Application Scopes ───────────────────────────────────────────────────────

applications.post("/:id/scopes", authMiddleware(), requireAdmin(), async (c) => {
  const applicationId = c.req.param("id") as string;
  const body = await c.req.json();
  const parsed = createScopeSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }

  const auth = c.get("auth");
  const clientInfo = {
    ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown",
    userAgent: c.req.header("user-agent") ?? "unknown",
  };

  const scope = await applicationsService.createScope(applicationId, parsed.data, auth.userId, clientInfo);
  return c.json({ scope }, 201);
});

applications.get("/:id/scopes", authMiddleware(), requireAdmin(), async (c) => {
  const applicationId = c.req.param("id") as string;
  const scopes = await applicationsService.listScopes(applicationId);
  return c.json({ scopes });
});

applications.delete("/:id/scopes/:scopeId", authMiddleware(), requireAdmin(), async (c) => {
  const applicationId = c.req.param("id") as string;
  const scopeId = c.req.param("scopeId") as string;
  const auth = c.get("auth");
  const clientInfo = {
    ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown",
    userAgent: c.req.header("user-agent") ?? "unknown",
  };

  await applicationsService.deleteScope(applicationId, scopeId, auth.userId, clientInfo);
  return c.body(null, 204);
});

// ─── User Application Access ──────────────────────────────────────────────────

applications.post("/:id/access", authMiddleware(), requireAdmin(), async (c) => {
  const applicationId = c.req.param("id") as string;
  const body = await c.req.json();
  const parsed = grantAccessSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }

  const auth = c.get("auth");
  const clientInfo = {
    ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown",
    userAgent: c.req.header("user-agent") ?? "unknown",
  };

  const access = await applicationsService.grantAccess(applicationId, parsed.data, auth.userId, clientInfo);
  return c.json({ access }, 201);
});

applications.get("/:id/access", authMiddleware(), requireAdmin(), async (c) => {
  const applicationId = c.req.param("id") as string;
  const accessList = await applicationsService.listAccess(applicationId);
  return c.json({ access: accessList });
});

applications.delete("/:id/access/:accessId", authMiddleware(), requireAdmin(), async (c) => {
  const applicationId = c.req.param("id") as string;
  const accessId = c.req.param("accessId") as string;
  const auth = c.get("auth");
  const clientInfo = {
    ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown",
    userAgent: c.req.header("user-agent") ?? "unknown",
  };

  await applicationsService.revokeAccess(applicationId, accessId, auth.userId, clientInfo);
  return c.body(null, 204);
});

export { applications };
