import { createRouter } from "../../factory.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

const mobile = createRouter();

const DRIVE_URL = process.env.RAVAA_DRIVE_URL || "http://localhost:2713";
const NOTES_URL = process.env.RAVAA_NOTES_URL || "http://localhost:2714";

// --- Drive proxy ---

mobile.get("/drive/files", authMiddleware(), async (c) => {
  const auth = c.req.header("authorization") || "";
  const url = new URL(c.req.url);
  const qs = url.searchParams.toString();
  const res = await fetch(`${DRIVE_URL}/api/files${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: auth, "Content-Type": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  return c.json(data, res.status as any);
});

mobile.post("/drive/files/upload", authMiddleware(), async (c) => {
  const auth = c.req.header("authorization") || "";
  const body = await c.req.arrayBuffer();
  const contentType = c.req.header("content-type") || "multipart/form-data";
  const res = await fetch(`${DRIVE_URL}/api/files/upload`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": contentType },
    body: body as any,
  });
  const data = await res.json().catch(() => ({}));
  return c.json(data, res.status as any);
});

mobile.get("/drive/files/:id/download", authMiddleware(), async (c) => {
  const id = c.req.param("id");
  const auth = c.req.header("authorization") || "";
  const res = await fetch(`${DRIVE_URL}/api/files/${id}/raw`, { headers: { Authorization: auth } });
  if (!res.ok) return c.json({ error: "Not found" }, 404 as any);
  const buf = await res.arrayBuffer();
  const mime = res.headers.get("content-type") || "application/octet-stream";
  return new Response(buf, { headers: { "Content-Type": mime } }) as any;
});

// Chunk status/upload for resumable (Android large files)
mobile.get("/drive/chunk/status", authMiddleware(), async (c) => {
  const fileId = c.req.query("fileId");
  const auth = c.req.header("authorization") || "";
  const res = await fetch(`${DRIVE_URL}/api/files/chunk?fileId=${encodeURIComponent(fileId || "")}`, { headers: { Authorization: auth } });
  const data = await res.json().catch(() => ({}));
  return c.json(data, res.status as any);
});

mobile.post("/drive/chunk", authMiddleware(), async (c) => {
  const auth = c.req.header("authorization") || "";
  const body = await c.req.arrayBuffer();
  const ct = c.req.header("content-type") || "multipart/form-data";
  const qs = new URL(c.req.url).search;
  const res = await fetch(`${DRIVE_URL}/api/files/chunk${qs}`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": ct },
    body: body as any,
  });
  const data = await res.json().catch(() => ({}));
  return c.json(data, res.status as any);
});

// --- Notes proxy ---

mobile.get("/notes", authMiddleware(), async (c) => {
  const auth = c.req.header("authorization") || "";
  const qs = new URL(c.req.url).searchParams.toString();
  const res = await fetch(`${NOTES_URL}/api/notes${qs ? `?${qs}` : ""}`, { headers: { Authorization: auth } });
  const data = await res.json().catch(() => ({}));
  return c.json(data, res.status as any);
});

mobile.post("/notes", authMiddleware(), async (c) => {
  const auth = c.req.header("authorization") || "";
  const body = await c.req.json().catch(() => ({}));
  const res = await fetch(`${NOTES_URL}/api/notes`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return c.json(data, res.status as any);
});

mobile.patch("/notes/:id", authMiddleware(), async (c) => {
  const id = c.req.param("id");
  const auth = c.req.header("authorization") || "";
  const body = await c.req.json().catch(() => ({}));
  const res = await fetch(`${NOTES_URL}/api/notes/${id}`, {
    method: "PATCH",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return c.json(data, res.status as any);
});

mobile.delete("/notes/:id", authMiddleware(), async (c) => {
  const id = c.req.param("id");
  const auth = c.req.header("authorization") || "";
  const res = await fetch(`${NOTES_URL}/api/notes/${id}`, { method: "DELETE", headers: { Authorization: auth } });
  const data = await res.json().catch(() => ({}));
  return c.json(data, res.status as any);
});

mobile.get("/notebooks", authMiddleware(), async (c) => {
  const auth = c.req.header("authorization") || "";
  const res = await fetch(`${NOTES_URL}/api/notebooks`, { headers: { Authorization: auth } });
  const data = await res.json().catch(() => ({}));
  return c.json(data, res.status as any);
});

mobile.get("/drive/storage", authMiddleware(), async (c) => {
  const auth = c.req.header("authorization") || "";
  const res = await fetch(`${DRIVE_URL}/api/files/storage-stats`, { headers: { Authorization: auth } });
  const data = await res.json().catch(() => ({}));
  return c.json(data, res.status as any);
});

mobile.post("/drive/folders", authMiddleware(), async (c) => {
  const auth = c.req.header("authorization") || "";
  const body = await c.req.json().catch(() => ({}));
  const res = await fetch(`${DRIVE_URL}/api/folders`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return c.json(data, res.status as any);
});

mobile.patch("/drive/files/:id", authMiddleware(), async (c) => {
  const id = c.req.param("id");
  const auth = c.req.header("authorization") || "";
  const body = await c.req.json().catch(() => ({}));
  const res = await fetch(`${DRIVE_URL}/api/files/${id}`, {
    method: "PATCH",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return c.json(data, res.status as any);
});

mobile.delete("/drive/files/:id", authMiddleware(), async (c) => {
  const id = c.req.param("id");
  const auth = c.req.header("authorization") || "";
  const res = await fetch(`${DRIVE_URL}/api/files/${id}`, { method: "DELETE", headers: { Authorization: auth } });
  const data = await res.json().catch(() => ({}));
  return c.json(data, res.status as any);
});

// --- Device & sync token (simple) ---
mobile.post("/devices", authMiddleware(), async (c) => {
  const { userId } = c.get("auth");
  const body = await c.req.json().catch(() => ({}));
  return c.json({ success: true, data: { userId, deviceId: body.deviceId || `android-${Date.now()}`, registeredAt: new Date().toISOString() } });
});

mobile.get("/sync", authMiddleware(), async (c) => {
  const since = c.req.query("since") || "1970-01-01T00:00:00.000Z";
  const auth = c.req.header("authorization") || "";
  const [notesRes, filesRes] = await Promise.all([
    fetch(`${NOTES_URL}/api/notes?since=${encodeURIComponent(since)}`, { headers: { Authorization: auth } }).then(r => r.json().catch(()=>({data:{notes:[]}}))).catch(()=>({data:{notes:[]}})),
    fetch(`${DRIVE_URL}/api/files?since=${encodeURIComponent(since)}`, { headers: { Authorization: auth } }).then(r => r.json().catch(()=>({data:{files:[]}}))).catch(()=>({data:{files:[]}})),
  ]);
  return c.json({ success: true, data: { notes: (notesRes as any).data?.notes || [], files: (filesRes as any).data?.files || [], syncToken: new Date().toISOString() } });
});

export { mobile };
