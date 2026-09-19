import { createRouter } from "../../factory.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requireAdmin } from "../../middlewares/admin.middleware.js";

const storage = createRouter();
const DRIVE_URL = process.env.RAVAA_DRIVE_URL || "http://localhost:2713";

// Helper to forward auth header
function getAuthHeader(c: any): string {
  return c.req.header("authorization") || "";
}

// GET /api/v1/admin/storage/locations — proxy Drive admin storage-locations
storage.get("/locations", authMiddleware(), requireAdmin(), async (c) => {
  const auth = getAuthHeader(c);
  const res = await fetch(`${DRIVE_URL}/api/admin/storage-locations`, {
    headers: { Authorization: auth },
  });
  const data = await res.json().catch(() => ({}));
  return c.json(data, res.status as any);
});

storage.post("/locations", authMiddleware(), requireAdmin(), async (c) => {
  const auth = getAuthHeader(c);
  const body = await c.req.json().catch(() => ({}));
  const res = await fetch(`${DRIVE_URL}/api/admin/storage-locations`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return c.json(data, res.status as any);
});

storage.delete("/locations", authMiddleware(), requireAdmin(), async (c) => {
  const auth = getAuthHeader(c);
  const body = await c.req.json().catch(() => ({}));
  const res = await fetch(`${DRIVE_URL}/api/admin/storage-locations`, {
    method: "DELETE",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return c.json(data, res.status as any);
});

storage.patch("/default", authMiddleware(), requireAdmin(), async (c) => {
  const auth = getAuthHeader(c);
  const body = await c.req.json().catch(() => ({}));
  const res = await fetch(`${DRIVE_URL}/api/admin/storage-locations`, {
    method: "PATCH",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return c.json(data, res.status as any);
});

export { storage };
