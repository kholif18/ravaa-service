import { createRouter } from "../../factory.js";
import * as sessionsService from "./sessions.service.js";

const sessions = createRouter();

sessions.get("/", async (c) => {
  const auth = c.get("auth");
  const sessionList = await sessionsService.listSessions(auth.userId);
  return c.json({ sessions: sessionList });
});

sessions.delete("/:id", async (c) => {
  const auth = c.get("auth");
  const sessionId = c.req.param("id");
  await sessionsService.revokeSession(sessionId, auth.userId);
  return c.json({ message: "Session revoked" });
});

sessions.delete("/", async (c) => {
  const auth = c.get("auth");
  const { logoutAll } = await import("../auth/auth.service.js");
  await logoutAll(auth.userId);
  return c.json({ message: "All sessions revoked" });
});

export { sessions };
