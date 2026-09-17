import { createRouter } from "../../factory.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requireAdmin } from "../../middlewares/admin.middleware.js";
import * as usersService from "./users.service.js";

const users = createRouter();

// GET /api/v1/admin/users — list all users (admin only)
// Used by Ravaa Drive Phase 7.4 identity mapping (dry-run/report)
users.get("/", authMiddleware(), requireAdmin(), async (c) => {
  const list = await usersService.listAllUsers();
  return c.json({ users: list });
});

users.get("/:id", authMiddleware(), requireAdmin(), async (c) => {
  const id = c.req.param("id") as string;
  const user = await usersService.getUserById(id);
  if (!user) {
    return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
  }
  return c.json({ user });
});

users.patch("/:id/storage", authMiddleware(), requireAdmin(), async (c) => {
  const id = c.req.param("id") as string;
  const body = await c.req.json();
  const limit = Number(body.storageLimit);
  if (!Number.isFinite(limit) || limit < 1073741824 || limit > 1099511627776) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "storageLimit must be 1GB - 1TB" } }, 400);
  }
  const user = await usersService.updateUserStorage(id, limit);
  return c.json({ user });
});

export { users };
